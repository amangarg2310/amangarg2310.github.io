"""
Scout - Conversational AI agent for the Outlier Content Engine.

Uses OpenAI function calling (tools) so GPT handles natural language
understanding while real actions (create category, add brands, etc.)
are executed by VerticalManager.

Falls back gracefully when OpenAI is unavailable.
"""

import json
import logging
import subprocess
import sys
import threading
from typing import Dict, List, Optional, Tuple

from openai import OpenAI

import config
from vertical_manager import VerticalManager

logger = logging.getLogger(__name__)

# ── Tool Definitions (OpenAI function-calling schema) ──────────────────────

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "create_category",
            "description": (
                "Create a new competitive-set category to track brands. "
                "Call this when the user wants to start tracking a new group "
                "of brands (e.g. 'Streetwear', 'Beauty', 'Gaming')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Category name, e.g. 'Streetwear' or 'DTC Beauty'.",
                    },
                    "description": {
                        "type": "string",
                        "description": "Optional short description of the category.",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "add_brands",
            "description": (
                "Add one or more brand handles to a category. "
                "Accepts Instagram and TikTok handles. "
                "If the category does not exist yet it will be created automatically. "
                "IMPORTANT: Extract @handles from ANY text format the user provides — "
                "handles may be embedded in descriptions, notes, bullet points, etc. "
                "Strip the @ prefix before passing handles."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {
                        "type": "string",
                        "description": "The category to add brands to.",
                    },
                    "instagram_handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "List of Instagram handles (without @). "
                            "Extract from any text format the user provides."
                        ),
                    },
                    "tiktok_handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "List of TikTok handles (without @) if the user "
                            "explicitly marks them as TikTok. Defaults to empty."
                        ),
                    },
                    "facebook_handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "List of Facebook Page handles/slugs (without @) "
                            "if the user explicitly marks them as Facebook."
                        ),
                    },
                },
                "required": ["category_name", "instagram_handles"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "remove_brands",
            "description": "Remove one or more brands from a category.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {
                        "type": "string",
                        "description": "The category to remove brands from.",
                    },
                    "handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Instagram handles to remove (without @).",
                    },
                },
                "required": ["category_name", "handles"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_categories",
            "description": (
                "List all existing categories with their brand counts. "
                "Call this when the user asks to see their categories, "
                "collections, or what they are tracking."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_category",
            "description": (
                "Show details of a specific category including all its brands."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Category name to show details for.",
                    },
                },
                "required": ["name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_analysis",
            "description": (
                "Run outlier detection analysis for a category. "
                "Can analyze ALL brands in the category OR specific brands only. "
                "Use brand_handles to filter which brands to collect/analyze. "
                "IMPORTANT: Before calling this, you should have asked the user "
                "which platforms and timeframe they want. Pass their preferences "
                "via the platforms and timeframe parameters."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {
                        "type": "string",
                        "description": "Category to analyze (e.g., 'Streetwear')",
                    },
                    "brand_handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "OPTIONAL: Specific Instagram handles to analyze. "
                            "If omitted or empty, analyzes ALL brands in category. "
                            "Extract from user's natural language. Examples: "
                            "'analyze nike' → ['nike'], "
                            "'kith and noah' → ['kith', 'noah'], "
                            "'analyze everything' → omit this field"
                        ),
                    },
                    "platforms": {
                        "type": "string",
                        "enum": ["all", "instagram", "tiktok", "facebook"],
                        "description": (
                            "Which platforms to focus on. 'all' collects from all "
                            "platforms. Defaults to 'all' if user didn't specify."
                        ),
                    },
                    "timeframe": {
                        "type": "string",
                        "enum": ["30d", "3mo"],
                        "description": (
                            "Timeframe for analysis. '30d' = last 30 days, "
                            "'3mo' = last 3 months. Defaults to '30d'."
                        ),
                    },
                },
                "required": ["category_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_filters",
            "description": (
                "Set dashboard display filters for platform, timeframe, or sort order. "
                "Use when user says things like 'show me TikTok posts', "
                "'switch to last 3 months', 'sort by saves', 'show Facebook only'. "
                "This applies filters WITHOUT re-running analysis."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "platform": {
                        "type": "string",
                        "enum": ["instagram", "tiktok", "facebook", ""],
                        "description": "Platform filter. Empty string for all platforms.",
                    },
                    "timeframe": {
                        "type": "string",
                        "enum": ["30d", "3mo", ""],
                        "description": "Timeframe filter. 30d or 3mo.",
                    },
                    "sort": {
                        "type": "string",
                        "enum": ["score", "saves", "shares", "date", ""],
                        "description": "Sort order.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "filter_view",
            "description": (
                "Filter the dashboard to show only specific brands from EXISTING data. "
                "Use when user wants to VIEW, LOOK AT, SEE, or FILTER to specific brands "
                "WITHOUT running a new analysis or collection. "
                "This is instant and uses already-collected posts."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "brand_handles": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Brand handles to filter the view to. Examples: "
                            "'show me nike' → ['nike'], "
                            "'i only want to look at stussy' → ['stussy'], "
                            "'filter to kith and noah' → ['kith', 'noah']"
                        ),
                    },
                },
                "required": ["brand_handles"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "score_content",
            "description": (
                "Score a content concept against learned outlier patterns. "
                "Use when user says 'score this', 'rate this caption', "
                "'how would this perform', or provides a caption to evaluate. "
                "Returns a 0-100 score with breakdown across 5 dimensions. "
                "This is FREE and instant — no LLM call needed."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "caption": {
                        "type": "string",
                        "description": "The caption or concept text to score.",
                    },
                    "hook_line": {
                        "type": "string",
                        "description": "Optional opening hook line.",
                    },
                    "format": {
                        "type": "string",
                        "enum": ["reel", "carousel", "static", "story"],
                        "description": "Content format. Defaults to 'reel'.",
                    },
                    "platform": {
                        "type": "string",
                        "enum": ["instagram", "tiktok", "facebook"],
                        "description": "Target platform. Defaults to 'instagram'.",
                    },
                },
                "required": ["caption"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "optimize_content",
            "description": (
                "Optimize a content concept using AI to improve its score. "
                "Use when user says 'optimize this', 'improve it', 'make it better', "
                "'rewrite this caption', or wants to improve a previously scored concept. "
                "Costs ~$0.0003 per call (uses GPT-4o-mini)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "caption": {
                        "type": "string",
                        "description": "The caption to optimize. Use the most recent scored caption if user says 'optimize it'.",
                    },
                    "hook_line": {
                        "type": "string",
                        "description": "Optional opening hook line.",
                    },
                    "format": {
                        "type": "string",
                        "enum": ["reel", "carousel", "static", "story"],
                        "description": "Content format.",
                    },
                    "platform": {
                        "type": "string",
                        "enum": ["instagram", "tiktok", "facebook"],
                        "description": "Target platform.",
                    },
                    "score_id": {
                        "type": "integer",
                        "description": "ID of a previous score to link as parent (for iteration tracking).",
                    },
                },
                "required": ["caption"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_trends",
            "description": (
                "Show trend predictions — which sounds, hashtags, content patterns, "
                "hooks, and formats are rising vs declining. Includes Trend Radar "
                "(velocity-based sound/hashtag detection with example post links). "
                "Use when user asks 'what's trending', 'trending sounds', "
                "'what hashtags are hot', 'what patterns are rising', or "
                "'what should I post about this week'. Requires 2+ analysis runs."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "lookback_weeks": {
                        "type": "integer",
                        "description": "Number of weeks to look back. Defaults to 4.",
                    },
                },
            },
        },
    },
]


# ── ScoutAgent ──────────────────────────────────────────────────────────────

class ScoutAgent:
    """Conversational AI agent using OpenAI function calling."""

    def __init__(self, openai_key: str = None):
        """Initialize Scout with OpenAI client.

        Args:
            openai_key: Per-request BYOK key (from browser localStorage).
                        Falls back to database/env key if not provided.
        """
        api_key = openai_key or config.get_api_key("openai")
        self.client = None
        if api_key:
            try:
                self.client = OpenAI(api_key=api_key)
            except Exception:
                pass  # Will return None so dashboard falls back
        self.model = "gpt-4o-mini"
        self.vm = VerticalManager()

    # ── System Prompt ───────────────────────────────────────────────────

    def _build_system_prompt(self, context: Dict) -> str:
        """Build the system prompt with live state injected."""

        # Gather current state
        verticals = self.vm.list_verticals()
        active = context.get("active_vertical")

        state_lines = []
        if verticals:
            state_lines.append(f"Existing categories: {', '.join(verticals)}")
            if active:
                v = self.vm.get_vertical(active)
                if v:
                    handles = [
                        f"@{b.instagram_handle}" for b in v.brands if b.instagram_handle
                    ]
                    state_lines.append(
                        f"Active category: {v.name} ({len(v.brands)} brands: "
                        f"{', '.join(handles[:8])}{'...' if len(handles) > 8 else ''})"
                    )
        else:
            state_lines.append("No categories created yet.")

        # Include current filter context if available
        filter_ctx = context.get("chat_context", {}) if isinstance(context.get("chat_context"), dict) else {}
        active_filters = []
        if filter_ctx.get("active_platform_filter"):
            active_filters.append(f"Platform: {filter_ctx['active_platform_filter']}")
        if filter_ctx.get("active_timeframe_filter"):
            active_filters.append(f"Timeframe: {filter_ctx['active_timeframe_filter']}")
        if filter_ctx.get("active_brand_filter"):
            active_filters.append(f"Brand: {filter_ctx['active_brand_filter']}")
        if active_filters:
            state_lines.append(f"Active UI filters: {', '.join(active_filters)}")

        state_block = "\n".join(state_lines)

        return f"""You are Scout, a friendly AI assistant for the Outlier Content Engine — a platform that finds viral social media posts by detecting statistical outliers in engagement.

PERSONALITY:
- Casual, energetic, knowledgeable about social media
- Concise responses (2-4 sentences when possible)
- Occasional emoji, but don't overdo it
- Always end with a clear next step or question

CURRENT STATE:
{state_block}

NATURAL CONVERSATION FLOW (CRITICAL — follow this step-by-step):
Guide users through setup in a natural, friendly way. Never dump all questions at once.
Ask ONE thing at a time and wait for their response before moving to the next step.

STEP 1 — NAME THE SET:
If the user hasn't named their competitive set yet, start here:
"Let's set up your competitive set! What would you like to call it? (e.g., 'Streetwear', 'DTC Beauty', 'Fitness')"
- If the user already mentioned a category name (e.g., "create a Streetwear set"), use it — don't re-ask.
- Generic phrases like "the set", "the collection", "the competitive set" are NOT names. Ask for a specific one.
- Once you have the name, call create_category, then move to Step 2.

STEP 2 — ADD BRANDS:
"Great! Now let's add some brands. Which brands or handles do you want to track?"
- Accept brand names WITHOUT @ (e.g., "SaintWoods", "Fear of God Essentials")
- Accept handles WITH @ (e.g., "@saintwoods", "@essentials")
- Accept messy mixed input: "@kith — content ops @stussy — nostalgia OG" → extract all handles
- When calling add_brands, the system auto-resolves brand names to official handles.
- Just pass whatever the user says — strip @ prefixes and pass as instagram_handles.
- If the user already provided brands in their first message, skip asking and use those.

STEP 3 — PICK PLATFORMS:
"What platforms do you want to look at? Instagram, TikTok, Facebook, or all of them?"
- Wait for their answer. Don't combine this with other questions.
- Remember their choice for Step 5.

STEP 4 — CONFIRM HANDLES:
After add_brands returns (it includes resolved_handles), confirm with the user:
"I found these handles for each platform — do these look right?
• SaintWoods → @saintwoods
• Stussy → @stussy
(If any look off, just let me know and I'll fix it!)"
- Only show this if brand names were resolved to handles.
- If user just provided @handles directly, skip this step.

STEP 5 — TIMEFRAME:
"Last question — what timeframe should the analysis cover? Last 30 days or last 3 months?"
- Default to 30 days if user says "whatever" or "default".

STEP 6 — LAUNCH ANALYSIS:
"I've got everything I need! Ready to analyze? Just say 'go' and I'll start scanning."
- Only call run_analysis when the user confirms ("go", "yes", "do it", "analyze", etc.)
- Pass their platform and timeframe choices to run_analysis.

SHORTCUT HANDLING:
Users don't always follow the step-by-step flow. Handle shortcuts:
- "add saintwoods and stussy to Streetwear" → Skip Step 1, do Steps 2+3+4+5 (create category + add brands, then ask platforms/timeframe).
- "create a Streetwear set with @nike and @adidas" → Do Step 1+2 together, then ask platforms/timeframe.
- "saintwoods and stussy" (just brand names, no command) → The user wants to track these. Ask "What should we call this collection?" (Step 1), then continue.
- "analyze Streetwear" → Skip to pre-analysis validation, then ask platforms/timeframe if not already specified.
- "analyze everything on IG for the last 3 months" → User specified platform+timeframe, skip straight to analysis.
- "go" / "just do it" / "all defaults" → Use defaults (all platforms, 30d) and run.

POST-ANALYSIS FOLLOW-UP (STEP 7):
After run_analysis is triggered and you've told the user analysis is running,
offer advanced features they can try while they wait or after results come in:

"Analysis is running — I'll have results shortly! While we wait, here are some
things you can do next:

• **Trend Analysis** — See what sounds, hashtags, and content patterns are rising or falling. Great for planning your next post.
• **Score a Caption** — Paste a draft caption and I'll score it 0-100 against what's working for these brands. Free and instant!
• **Optimize Content** — I can rewrite your caption using patterns from top-performing posts.

Just let me know what sounds interesting, or hang tight for the analysis results!"

Only show this ONCE per analysis run. Don't repeat it on every message.
If user says "trends" → call show_trends.
If user says "score this: [caption]" → call score_content.

TERMINOLOGY:
- Say "category" or "collection" instead of "vertical"
- "Outliers" = posts with 2x+ normal engagement

WHAT YOU CAN DO (use the provided tools):
1. create_category — create a new competitive set
2. add_brands — add Instagram/TikTok/Facebook handles to a category (auto-creates if needed)
3. remove_brands — remove handles from a category
4. list_categories — show all categories
5. show_category — show brands in a specific category
6. run_analysis — scan posts and find outlier content
7. filter_view — filter dashboard to specific brands (no analysis, instant)
8. set_filters — change platform (IG/TT/FB), timeframe (30d/3mo), or sort order
9. score_content — score a content concept (FREE, instant, no LLM)
10. optimize_content — AI-powered caption improvement
11. show_trends — show rising/declining content patterns

INTENT DISAMBIGUATION (CRITICAL):
When user mentions a brand, determine their TRUE intent:

1. ADDING BRANDS: "add [brand] to [category]"
   → use add_brands tool

2. RUNNING ANALYSIS: "analyze [brand]" or "run analysis on [brand]"
   → use run_analysis with brand_handles=[brand]

3. FILTERING VIEW: "show me [brand]" or "filter to [brand]"
   → use filter_view tool (instant, uses existing data)

4. FULL CATEGORY: "analyze [category]" or "run analysis"
   → use run_analysis with NO brand_handles

PRE-ANALYSIS VALIDATION:
Before calling run_analysis:
1. Check the category has brands (call show_category if unsure)
2. If empty → "This category is empty. What brands should I add?"
3. If you haven't asked about platforms/timeframe yet → ask (Steps 3+5)
4. If user already specified everything → go ahead

BRAND-SPECIFIC ANALYSIS:
When users request analysis, determine the SCOPE:

1. SPECIFIC BRANDS: "analyze just nike" or "show me kith and noah"
   → Extract brand handles and pass to run_analysis
   → Example: run_analysis(category_name="Streetwear", brand_handles=["nike"])

2. FULL CATEGORY: "analyze streetwear" or "run analysis"
   → Omit brand_handles to analyze all brands
   → Example: run_analysis(category_name="Streetwear")

3. CONTEXT-AWARE: If user says "analyze it" or "run analysis" without specifics
   → Check if they previously mentioned specific brands in chat history
   → If yes, use those brands. If no, analyze full category.

BRAND EXTRACTION RULES:
- Strip @ symbols from handles
- Handle informal phrasing: "just nike" → ["nike"]
- Handle conjunctions: "nike and kith" → ["nike", "kith"]
- Handle comparisons: "kith vs noah" → ["kith", "noah"]
- Validate brands exist in the category before running analysis

RESPONSE TEMPLATES:
✓ Single brand: "Got it! I'll analyze just @saintwoods from Streetwear."
✓ Multiple brands: "Perfect! Analyzing @nike and @kith from your Streetwear category."
✓ Full category: "Running analysis on all 6 brands in Streetwear."
✓ Brand not found: "Hmm, I don't see 'fakeband' in Streetwear. Did you mean one of these: @nike, @kith, @stussy?"

SCORING & OPTIMIZATION:
When user provides a caption/concept to score:
1. Use score_content — returns 0-100 with breakdown
2. Present the score clearly: "Your concept scored 72/100" then list each dimension
3. Mention the weakest areas and specific suggestions
4. Suggest "say 'optimize it' to get an AI-improved version"

When user says "optimize it", "improve it", "make it better":
1. Use optimize_content — this calls GPT-4o-mini
2. Present the improved caption vs. original
3. Show the before/after scores
4. The user can say "optimize again" to iterate further

When user asks "what's trending", "what sounds are hot", "what should I post about":
1. Use show_trends — needs 2+ analysis snapshots
2. Present rising content patterns with emphasis
3. If trend_radar data is present, highlight top trending sounds and hashtags with their velocity
4. Include example post links (top_post_url) so users can click through to see the actual TikTok posts
5. Format sounds with a music note icon and hashtags with #
6. If not enough data, explain they need to run analysis at least twice to see velocity trends

IMPORTANT:
- NEVER output raw JSON to the user
- When you successfully add brands, summarize what you added and suggest "say 'analyze' to find viral posts"
- If the user seems confused, offer specific examples they can try
- When presenting scores, format them clearly with each dimension on its own line
- Always suggest next steps after scoring ("optimize it" or "try a different caption")
"""

    # ── Tool Handlers ───────────────────────────────────────────────────

    def _handle_create_category(self, args: Dict) -> str:
        """Create a new category. Returns a result summary for GPT."""
        name = args.get("name", "").strip()
        description = args.get("description", "").strip() or None

        if not name:
            return json.dumps({"ok": False, "error": "Category name is required."})

        created = self.vm.create_vertical(name, description)
        if created:
            return json.dumps({"ok": True, "message": f"Category '{name}' created."})
        else:
            return json.dumps({
                "ok": True,
                "message": f"Category '{name}' already exists (reusing it).",
            })

    def _handle_add_brands(self, args: Dict, context: Dict) -> str:
        """Add brands to a category (auto-creating it if necessary)."""
        category_name = args.get("category_name", "").strip()
        ig_handles = args.get("instagram_handles", [])
        tt_handles = args.get("tiktok_handles", [])
        fb_handles = args.get("facebook_handles", [])

        if not category_name:
            return json.dumps({"ok": False, "error": "Category name is required."})

        if not ig_handles and not tt_handles and not fb_handles:
            return json.dumps({"ok": False, "error": "No handles provided."})

        # Auto-create category if it doesn't exist
        existing = self.vm.list_verticals()
        actual_name = None
        was_existing_vertical = False
        for v in existing:
            if v.lower() == category_name.lower():
                actual_name = v
                was_existing_vertical = True
                break

        if not actual_name:
            self.vm.create_vertical(category_name)
            actual_name = category_name

        # Resolve brand names to official handles using BrandHandleDiscovery
        from brand_handle_discovery import BrandHandleDiscovery
        discovery = BrandHandleDiscovery()

        # Track which brands are new vs already existed
        added = []
        resolved = []  # Track name→handle resolutions for user feedback
        newly_added_handles = []  # Track actual new brands for incremental collection
        skipped = []
        for handle in ig_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue

            # Try to resolve brand name → official handle
            original_input = handle
            suggestion = discovery.discover_handle(handle, platform="instagram")
            if suggestion:
                resolved_handle = suggestion['handle']
                official_name = suggestion.get('official_name', original_input)
                if resolved_handle.lower() != handle.lower():
                    resolved.append({
                        "input": original_input,
                        "handle": resolved_handle,
                        "name": official_name,
                        "followers": suggestion.get('follower_count', 0),
                        "verified": suggestion.get('verified', False),
                    })
                    handle = resolved_handle

            try:
                if self.vm.add_brand(actual_name, instagram_handle=handle,
                                      brand_name=suggestion['official_name'] if suggestion else None):
                    added.append(f"@{handle}")
                    newly_added_handles.append(handle)
                else:
                    skipped.append(f"@{handle}")
            except Exception:
                skipped.append(f"@{handle}")

        # Add TikTok-only handles (with brand name resolution)
        for handle in tt_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue

            # Try to resolve brand name → official TikTok handle
            original_input = handle
            tt_suggestion = discovery.discover_handle(handle, platform="tiktok")
            if tt_suggestion:
                resolved_handle = tt_suggestion['handle']
                if resolved_handle and resolved_handle.lower() != handle.lower():
                    resolved.append({
                        "input": original_input,
                        "handle": resolved_handle,
                        "name": tt_suggestion.get('official_name', original_input),
                        "platform": "tiktok",
                    })
                    handle = resolved_handle

            try:
                if self.vm.add_brand(actual_name, tiktok_handle=handle,
                                      brand_name=tt_suggestion['official_name'] if tt_suggestion else None):
                    added.append(f"@{handle} (TikTok)")
                    newly_added_handles.append(handle)
                else:
                    skipped.append(f"@{handle} (TikTok)")
            except Exception:
                skipped.append(f"@{handle} (TikTok)")

        # Add Facebook-only handles
        for handle in fb_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue
            try:
                if self.vm.add_brand(actual_name, facebook_handle=handle):
                    added.append(f"@{handle} (Facebook)")
                    newly_added_handles.append(handle)
                else:
                    skipped.append(f"@{handle} (Facebook)")
            except Exception:
                skipped.append(f"@{handle} (Facebook)")

        self.vm.update_vertical_timestamp(actual_name)
        total = self.vm.get_brand_count(actual_name)

        # Update context so subsequent messages know the active category
        context["active_vertical"] = actual_name
        # Store newly added brands for smart incremental collection
        context["newly_added_brands"] = newly_added_handles
        context["was_existing_vertical"] = was_existing_vertical

        result = {
            "ok": True,
            "category": actual_name,
            "added": added,
            "skipped": skipped,
            "total_brands": total,
            "newly_added_count": len(newly_added_handles),
        }

        # Include handle resolution details so GPT can inform the user
        if resolved:
            result["resolved_handles"] = resolved
            result["resolution_note"] = (
                "Some brand names were resolved to official handles. "
                "Tell the user which handles were used."
            )

        return json.dumps(result)

    def _handle_remove_brands(self, args: Dict) -> str:
        """Remove brands from a category."""
        category_name = args.get("category_name", "").strip()
        handles = args.get("handles", [])

        if not category_name or not handles:
            return json.dumps({"ok": False, "error": "Category and handles required."})

        actual_name = None
        for v in self.vm.list_verticals():
            if v.lower() == category_name.lower():
                actual_name = v
                break

        if not actual_name:
            return json.dumps({"ok": False, "error": f"Category '{category_name}' not found."})

        removed = []
        not_found = []
        for handle in handles:
            handle = handle.strip().lstrip("@")
            if self.vm.remove_brand(actual_name, handle):
                removed.append(f"@{handle}")
            else:
                not_found.append(f"@{handle}")

        self.vm.update_vertical_timestamp(actual_name)
        total = self.vm.get_brand_count(actual_name)

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "removed": removed,
            "not_found": not_found,
            "total_brands": total,
        })

    def _handle_list_categories(self) -> str:
        """List all categories with brand counts."""
        verticals = self.vm.list_verticals()
        if not verticals:
            return json.dumps({"categories": [], "message": "No categories yet."})

        cats = []
        for v_name in verticals:
            v = self.vm.get_vertical(v_name)
            brands_count = len(v.brands) if v else 0
            handles_preview = []
            if v:
                handles_preview = [
                    f"@{b.instagram_handle}" for b in v.brands[:5] if b.instagram_handle
                ]
            cats.append({
                "name": v_name,
                "brand_count": brands_count,
                "sample_handles": handles_preview,
            })

        return json.dumps({"categories": cats})

    def _handle_show_category(self, args: Dict) -> str:
        """Show details for a specific category."""
        name = args.get("name", "").strip()

        actual_name = None
        for v in self.vm.list_verticals():
            if v.lower() == name.lower():
                actual_name = v
                break

        if not actual_name:
            return json.dumps({"ok": False, "error": f"Category '{name}' not found."})

        v = self.vm.get_vertical(actual_name)
        if not v:
            return json.dumps({"ok": False, "error": f"Could not load '{actual_name}'."})

        handles = []
        for b in v.brands:
            entry = {}
            if b.instagram_handle:
                entry["instagram"] = f"@{b.instagram_handle}"
            if b.tiktok_handle:
                entry["tiktok"] = f"@{b.tiktok_handle}"
            if getattr(b, 'facebook_handle', None):
                entry["facebook"] = f"@{b.facebook_handle}"
            if b.brand_name:
                entry["name"] = b.brand_name
            handles.append(entry)

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "description": v.description,
            "brand_count": len(v.brands),
            "brands": handles,
        })

    def _should_skip_collection(self, vertical_name: str, brand_handles: list = None) -> bool:
        """Check if posts were recently collected to enable fast cached re-analysis.

        Returns True if ALL requested brands have posts collected within last 24 hours.
        This enables instant re-analysis without slow Apify collection.
        """
        try:
            import sqlite3
            from datetime import datetime, timedelta

            conn = sqlite3.connect(str(config.DB_PATH))
            conn.row_factory = sqlite3.Row

            # Get all brands for this vertical
            vertical = self.vm.get_vertical(vertical_name)
            if not vertical:
                return False

            # If specific brands requested, check only those
            # Otherwise check all brands in vertical
            if brand_handles:
                handles_to_check = brand_handles
            else:
                handles_to_check = [b.instagram_handle for b in vertical.brands if b.instagram_handle]

            if not handles_to_check:
                return False

            # Check if ALL brands have recent posts (within 24 hours)
            cutoff_time = datetime.now() - timedelta(hours=24)
            cutoff_str = cutoff_time.strftime('%Y-%m-%dT%H:%M:%S')

            for handle in handles_to_check:
                result = conn.execute("""
                    SELECT COUNT(*) as count, MAX(collected_at) as last_collected
                    FROM competitor_posts
                    WHERE competitor_handle = ?
                      AND brand_profile = ?
                      AND collected_at >= ?
                """, (handle, vertical_name, cutoff_str)).fetchone()

                # If this brand has no recent posts, we need fresh collection
                if not result or result['count'] == 0:
                    conn.close()
                    return False

            conn.close()
            return True  # All brands have recent data

        except Exception as e:
            logger.warning(f"Cache check failed: {e}")
            return False  # On error, do fresh collection

    def _handle_run_analysis(self, args: Dict, context: Dict) -> str:
        """Trigger the analysis pipeline in a background thread.

        Enforces rate limits unless admin mode is active:
        - Per-category cooldown (default 60 min)
        - Daily run cap (default 3/day)
        """
        import sqlite3
        from datetime import datetime, timezone, timedelta

        category_name = args.get("category_name", "").strip()

        actual_name = None
        for v in self.vm.list_verticals():
            if v.lower() == category_name.lower():
                actual_name = v
                break

        if not actual_name:
            return json.dumps({"ok": False, "error": f"Category '{category_name}' not found."})

        brand_count = self.vm.get_brand_count(actual_name)
        if brand_count == 0:
            return json.dumps({
                "ok": False,
                "error": f"Category '{actual_name}' has no brands. Add some first.",
            })

        # ── Brand-specific filtering (optional) ──
        brand_handles = args.get("brand_handles")  # None, [], or ["nike", "kith"]

        # Clear newly_added_brands from context to prevent stale filtering
        # on subsequent analysis calls. Analysis always respects explicit
        # brand_handles from the user; it never auto-filters.
        context.pop("newly_added_brands", None)
        context.pop("was_existing_vertical", None)

        # Validate brands exist in category (if specified)
        if brand_handles:
            vertical = self.vm.get_vertical(actual_name)
            available_handles = [b.instagram_handle for b in vertical.brands if b.instagram_handle]
            invalid = [h for h in brand_handles if h not in available_handles]

            if invalid:
                return json.dumps({
                    "ok": False,
                    "error": (
                        f"Brands not found in {actual_name}: {', '.join(invalid)}. "
                        f"Available: {', '.join(available_handles)}"
                    ),
                })

        # ── Rate limiting (skip if admin mode) ──
        is_admin = context.get("admin_mode", False) or config.ADMIN_MODE
        if not is_admin:
            try:
                conn = sqlite3.connect(str(config.DB_PATH))

                # Check per-category cooldown via verticals.updated_at
                row = conn.execute(
                    "SELECT updated_at FROM verticals WHERE name = ?",
                    (actual_name,)
                ).fetchone()
                if row and row[0]:
                    try:
                        last_run = datetime.fromisoformat(row[0])
                        cooldown = timedelta(minutes=config.ANALYSIS_COOLDOWN_MINUTES)
                        now = datetime.now(timezone.utc)
                        if last_run.tzinfo is None:
                            last_run = last_run.replace(tzinfo=timezone.utc)
                        if now - last_run < cooldown:
                            mins_left = int((cooldown - (now - last_run)).total_seconds() / 60) + 1
                            conn.close()
                            return json.dumps({
                                "ok": False,
                                "error": (
                                    f"Cooldown active — please wait ~{mins_left} min before "
                                    f"running analysis on '{actual_name}' again."
                                ),
                            })
                    except (ValueError, TypeError):
                        pass  # Malformed date, skip check

                # Check daily run cap
                today_key = f"runs_today_{datetime.now(timezone.utc).strftime('%Y-%m-%d')}"
                cap_row = conn.execute(
                    "SELECT value FROM config WHERE key = ?", (today_key,)
                ).fetchone()
                runs_today = int(cap_row[0]) if cap_row else 0

                if runs_today >= config.DAILY_RUN_CAP:
                    conn.close()
                    return json.dumps({
                        "ok": False,
                        "error": (
                            f"Daily limit reached ({config.DAILY_RUN_CAP} runs/day). "
                            f"Try again tomorrow, or ask an admin to increase the cap."
                        ),
                    })

                # Increment daily counter
                conn.execute("""
                    INSERT INTO config (key, value) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = ?
                """, (today_key, str(runs_today + 1), str(runs_today + 1)))
                conn.commit()
                conn.close()
            except Exception as exc:
                logger.warning(f"Rate-limit check failed (proceeding anyway): {exc}")

        # Check if posts were recently collected (within last 24 hours)
        # If so, use --skip-collect for instant re-analysis
        should_skip_collect = self._should_skip_collection(actual_name, brand_handles)

        # Build CLI command with optional brand filtering
        cmd = [sys.executable, "main.py", "--vertical", actual_name, "--no-email"]
        if should_skip_collect:
            cmd.append("--skip-collect")
            logger.info("Using cached data (posts collected within last 24 hours)")
        if brand_handles:
            cmd.extend(["--brands", ",".join(brand_handles)])

        vm = self.vm  # capture reference for thread

        def _run():
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(config.PROJECT_ROOT),
                    capture_output=True,
                    text=True,
                    timeout=900,  # Increased from 300s to 900s (15 minutes)
                )
                if result.returncode == 0:
                    # Only update cooldown timestamp on successful completion
                    vm.update_vertical_timestamp(actual_name)
                else:
                    logger.error(f"Analysis exited with code {result.returncode}: {result.stderr[:500]}")
            except Exception as exc:
                logger.error(f"Analysis failed: {exc}")

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        context["analysis_started"] = True

        # Apply user's platform/timeframe preferences as dashboard filters
        user_platforms = args.get("platforms", "all")
        user_timeframe = args.get("timeframe", "30d")

        if user_platforms and user_platforms != "all":
            context["filter_platform"] = user_platforms
        if user_timeframe:
            context["filter_timeframe"] = user_timeframe

        # Build response message based on scope
        platform_label = user_platforms if user_platforms != "all" else "all platforms"
        timeframe_label = "last 30 days" if user_timeframe == "30d" else "last 3 months"

        if brand_handles:
            handles_str = ", ".join(f"@{h}" for h in brand_handles)
            message = f"Analyzing {handles_str} from {actual_name} ({platform_label}, {timeframe_label})."
            # Store selected brands in context for UI sync
            context["selected_brands"] = brand_handles
        else:
            message = f"Analyzing all {brand_count} brands in {actual_name} ({platform_label}, {timeframe_label})."

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "brand_count": len(brand_handles) if brand_handles else brand_count,
            "message": message,
            "selected_brands": brand_handles if brand_handles else None,
            "follow_up_hint": (
                "Analysis is running. Offer the user advanced features they can try: "
                "Trend Analysis (rising sounds/hashtags/patterns), "
                "Score a Caption (paste a draft and get 0-100 score), "
                "or Optimize Content (AI rewrite using top-performing patterns). "
                "Present these as friendly options."
            ),
        })

    def _handle_set_filters(self, args: Dict, context: Dict) -> str:
        """Set dashboard filters (platform, timeframe, sort) from chat."""
        context["filter_action"] = True
        applied = []

        if args.get("platform") is not None:
            context["filter_platform"] = args["platform"]
            applied.append(f"platform={args['platform'] or 'all'}")
        if args.get("timeframe"):
            context["filter_timeframe"] = args["timeframe"]
            applied.append(f"timeframe={args['timeframe']}")
        if args.get("sort"):
            context["filter_sort"] = args["sort"]
            applied.append(f"sort={args['sort']}")

        return json.dumps({
            "ok": True,
            "message": f"Filters updated: {', '.join(applied)}",
            "applied": applied,
        })

    def _handle_filter_view(self, args: Dict, context: Dict) -> str:
        """Filter dashboard to show specific brands without triggering analysis."""
        brand_handles = args.get("brand_handles", [])

        if not brand_handles:
            return json.dumps({"ok": False, "error": "No brands specified for filtering."})

        # Get active category from context
        active_vertical = context.get("active_vertical")
        if not active_vertical:
            return json.dumps({
                "ok": False,
                "error": "No active category. Please select a category first."
            })

        # Validate brands exist in the category
        vertical = self.vm.get_vertical(active_vertical)
        if not vertical:
            return json.dumps({"ok": False, "error": f"Category '{active_vertical}' not found."})

        available_handles = [b.instagram_handle for b in vertical.brands if b.instagram_handle]
        invalid = [h for h in brand_handles if h not in available_handles]

        if invalid:
            return json.dumps({
                "ok": False,
                "error": (
                    f"Brands not found in {active_vertical}: {', '.join(invalid)}. "
                    f"Available: {', '.join(available_handles)}"
                ),
            })

        # Set filter context for frontend
        context["filter_action"] = True
        context["filter_brands"] = brand_handles

        # Build response message
        handles_str = ", ".join(f"@{h}" for h in brand_handles)
        if len(brand_handles) == 1:
            message = f"Showing posts from {handles_str} only."
        else:
            message = f"Filtering to {handles_str}."

        return json.dumps({
            "ok": True,
            "action": "filter",
            "brands": brand_handles,
            "message": message,
        })

    # ── Scoring & Trend Handlers ─────────────────────────────────────────

    def _handle_score_content(self, args: Dict, context: Dict) -> str:
        """Score a content concept against learned outlier patterns."""
        from content_scorer import ContentScorer

        caption = args.get("caption", "").strip()
        if not caption:
            return json.dumps({"ok": False, "error": "Caption text is required."})

        active = context.get("active_vertical")
        if not active:
            return json.dumps({"ok": False, "error": "No active category. Create one first."})

        concept = {
            "caption": caption,
            "hook_line": args.get("hook_line", ""),
            "format": args.get("format", "reel"),
            "platform": args.get("platform", "instagram"),
        }

        try:
            scorer = ContentScorer(active)
            result = scorer.score_concept(concept)
            score_id = scorer.store_score(concept, result)

            # Store in context so "optimize it" can reference this score
            context["last_score_id"] = score_id
            context["last_scored_concept"] = concept
            context["last_score_data"] = result

            return json.dumps({
                "ok": True,
                "score_id": score_id,
                "overall_score": result.get("overall_score", 0),
                "breakdown": result.get("breakdown", {}),
                "suggestions": result.get("suggestions", []),
                "predicted_engagement_range": result.get("predicted_engagement_range", {}),
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": f"Scoring failed: {e}"})

    def _handle_optimize_content(self, args: Dict, context: Dict) -> str:
        """Optimize a content concept via LLM and auto-re-score."""
        from content_scorer import ContentScorer
        from content_optimizer import ContentOptimizer

        caption = args.get("caption", "").strip()
        active = context.get("active_vertical")

        if not active:
            return json.dumps({"ok": False, "error": "No active category."})

        # If no caption provided, use the last scored concept
        if not caption and context.get("last_scored_concept"):
            caption = context["last_scored_concept"]["caption"]

        if not caption:
            return json.dumps({"ok": False, "error": "No caption to optimize. Score a concept first."})

        concept = {
            "caption": caption,
            "hook_line": args.get("hook_line", context.get("last_scored_concept", {}).get("hook_line", "")),
            "format": args.get("format", context.get("last_scored_concept", {}).get("format", "reel")),
            "platform": args.get("platform", context.get("last_scored_concept", {}).get("platform", "instagram")),
        }

        score_data = context.get("last_score_data", {})
        parent_score_id = args.get("score_id") or context.get("last_score_id")

        try:
            optimizer = ContentOptimizer(active)
            optimized = optimizer.optimize(concept, score_data)

            # Auto-re-score the improved version
            improved_concept = {
                "caption": optimized["improved_caption"],
                "hook_line": optimized["improved_hook"],
                "format": optimized.get("format_recommendation", concept["format"]),
                "platform": concept["platform"],
            }
            scorer = ContentScorer(active)
            new_score = scorer.score_concept(improved_concept)
            new_score_id = scorer.store_score(
                improved_concept, new_score, parent_score_id=parent_score_id
            )

            # Update context with new score
            context["last_score_id"] = new_score_id
            context["last_scored_concept"] = improved_concept
            context["last_score_data"] = new_score

            return json.dumps({
                "ok": True,
                "improved_caption": optimized["improved_caption"],
                "improved_hook": optimized["improved_hook"],
                "improvements": optimized.get("improvements", []),
                "format_recommendation": optimized.get("format_recommendation", ""),
                "new_overall_score": new_score.get("overall_score", 0),
                "new_breakdown": new_score.get("breakdown", {}),
                "original_score": score_data.get("overall_score", 0),
                "score_id": new_score_id,
            })
        except Exception as e:
            return json.dumps({"ok": False, "error": f"Optimization failed: {e}"})

    def _handle_show_trends(self, args: Dict, context: Dict) -> str:
        """Show rising/declining content pattern trends AND sound/hashtag velocity trends."""
        from trend_analyzer import TrendAnalyzer

        active = context.get("active_vertical")
        if not active:
            return json.dumps({"ok": False, "error": "No active category."})

        lookback = args.get("lookback_weeks", 4)
        result = {"ok": True}

        # Existing: content pattern trends
        try:
            ta = TrendAnalyzer(active)
            pattern_trends = ta.get_trends(lookback_weeks=lookback)
            result.update(pattern_trends)
        except Exception as e:
            result["pattern_error"] = str(e)

        # Trend Radar: sound/hashtag velocity trends with example post links
        try:
            from trend_radar.scorer import TrendRadarScorer
            radar = TrendRadarScorer(active).get_top_trends(limit=10)
            result["trend_radar"] = radar
        except ImportError:
            pass
        except Exception as e:
            result["radar_error"] = str(e)

        return json.dumps(result)

    # ── Dispatch a tool call ────────────────────────────────────────────

    def _dispatch_tool(self, name: str, args: Dict, context: Dict) -> str:
        """Route a tool call to the appropriate handler. Returns JSON string."""
        if name == "create_category":
            return self._handle_create_category(args)
        elif name == "add_brands":
            return self._handle_add_brands(args, context)
        elif name == "remove_brands":
            return self._handle_remove_brands(args)
        elif name == "list_categories":
            return self._handle_list_categories()
        elif name == "show_category":
            return self._handle_show_category(args)
        elif name == "run_analysis":
            return self._handle_run_analysis(args, context)
        elif name == "set_filters":
            return self._handle_set_filters(args, context)
        elif name == "filter_view":
            return self._handle_filter_view(args, context)
        elif name == "score_content":
            return self._handle_score_content(args, context)
        elif name == "optimize_content":
            return self._handle_optimize_content(args, context)
        elif name == "show_trends":
            return self._handle_show_trends(args, context)
        else:
            return json.dumps({"error": f"Unknown tool: {name}"})

    # ── Main chat method ────────────────────────────────────────────────

    def chat(self, message: str, context: Dict) -> Tuple[Optional[str], Dict]:
        """
        Process a user message and return Scout's response.

        Uses OpenAI function calling: GPT decides which tools to invoke,
        we execute them, feed results back, and GPT writes the final reply.

        Returns:
            (response_text or None, updated_context)
            None means the caller should use its own fallback.
        """
        if not self.client:
            return (None, context)

        # Build messages
        messages = [
            {"role": "system", "content": self._build_system_prompt(context)},
        ]

        # Append conversation history (last 10 messages = 5 turns)
        history = context.get("chat_history", [])
        messages.extend(history[-10:])

        # Current user message
        messages.append({"role": "user", "content": message})

        try:
            # ── Function-calling loop (max 3 rounds to prevent runaway) ──
            for _ in range(3):
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    tools=TOOL_DEFINITIONS,
                    tool_choice="auto",
                    temperature=0.6,
                    max_tokens=800,
                )

                choice = response.choices[0]

                # If GPT wants to call tools, execute them and loop
                if choice.finish_reason == "tool_calls" or choice.message.tool_calls:
                    # Append the assistant message (contains tool_calls)
                    messages.append(choice.message)

                    for tool_call in choice.message.tool_calls:
                        fn_name = tool_call.function.name
                        try:
                            fn_args = json.loads(tool_call.function.arguments)
                        except json.JSONDecodeError:
                            fn_args = {}

                        logger.info(f"Tool call: {fn_name}({fn_args})")

                        result = self._dispatch_tool(fn_name, fn_args, context)

                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call.id,
                            "content": result,
                        })

                    # Continue the loop — GPT will see tool results and decide
                    # whether to call more tools or produce a final text reply.
                    continue

                # GPT produced a final text response
                assistant_text = choice.message.content or ""

                # Sanitize: if GPT accidentally returns raw JSON, hide it
                stripped = assistant_text.strip()
                if stripped.startswith("{") or stripped.startswith("[{"):
                    assistant_text = (
                        "I've updated your collection! "
                        "Type 'show categories' to see your current setup, "
                        "or say 'analyze' to find viral posts."
                    )

                # Persist conversation history
                if "chat_history" not in context:
                    context["chat_history"] = []
                context["chat_history"].append({"role": "user", "content": message})
                context["chat_history"].append(
                    {"role": "assistant", "content": assistant_text}
                )

                # Trim history to last 20 entries (10 turns)
                if len(context["chat_history"]) > 20:
                    context["chat_history"] = context["chat_history"][-20:]

                return (assistant_text, context)

            # Exhausted loop iterations — shouldn't happen normally
            return (
                "I ran into a hiccup processing that. Could you try rephrasing?",
                context,
            )

        except Exception as exc:
            logger.warning(f"OpenAI call failed: {exc}")
            return (None, context)
