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
                "Use brand_handles to filter which brands to collect/analyze."
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
                },
                "required": ["category_name"],
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

        state_block = "\n".join(state_lines)

        return f"""You are Scout, a friendly AI assistant for the Outlier Content Engine — a platform that finds viral social media posts by detecting statistical outliers in engagement.

PERSONALITY:
- Casual, energetic, knowledgeable about social media
- Concise responses (2-4 sentences when possible)
- Occasional emoji, but don't overdo it
- Always end with a clear next step or question

CURRENT STATE:
{state_block}

CRITICAL RULES FOR HANDLE EXTRACTION:
- Users often paste messy text with @handles embedded in descriptions, notes, or bullet points.
  Example: "@aimeleondore — aspirational aesthetic @kith — content ops @stussy — nostalgia OG"
  You MUST extract every @handle from such text regardless of surrounding text.
- When calling add_brands, strip the @ prefix from handles.
- If the user provides handles and a category name in the SAME message, call add_brands immediately — do NOT ask for confirmation.
- If the user provides handles but no category name, ask which category they belong to. If they previously mentioned a category in the conversation, use that one.
- If a category doesn't exist yet, add_brands will auto-create it. No need to call create_category first.

TERMINOLOGY:
- Say "category" or "collection" instead of "vertical"
- "Outliers" = posts with 2x+ normal engagement

WHAT YOU CAN DO (use the provided tools):
1. create_category — create a new competitive set
2. add_brands — add Instagram/TikTok handles to a category (auto-creates if needed)
3. remove_brands — remove handles from a category
4. list_categories — show all categories
5. show_category — show brands in a specific category
6. run_analysis — scan posts and find outlier content
7. filter_view — filter dashboard to specific brands (no analysis, instant)

INTENT DISAMBIGUATION (CRITICAL):
When user mentions a brand, determine their TRUE intent:

1. ADDING BRANDS: "add [brand] to [category]"
   → use add_brands tool

2. RUNNING ANALYSIS: "analyze [brand]" or "run analysis on [brand]"
   → use run_analysis with brand_handles=[brand]
   → Triggers fresh collection (2-5 minutes)

3. FILTERING VIEW: "show me [brand]" or "i only want to look at [brand]" or "filter to [brand]"
   → use filter_view tool
   → Instant, uses existing data, NO collection

4. FULL CATEGORY: "analyze [category]" or "run analysis"
   → use run_analysis with NO brand_handles

CRITICAL PRE-ANALYSIS VALIDATION:
Before calling run_analysis, you MUST check if the category has brands:
1. If user mentions a category name (e.g., "streetwear", "analyze beauty"), first call show_category
2. Check the brand_count in the response
3. If brand_count == 0 or category is empty:
   → DO NOT call run_analysis
   → Instead respond: "This category is empty. What brands should I add to get started?"
   → Suggest next step: "Try: add @brand1 @brand2 to [category]"
   → Wait for user to add brands, then THEY will explicitly say "analyze"
4. Only call run_analysis if brand_count > 0

CRITICAL: If user says a brand "is already in [category]" and wants to see just that brand
→ They want filter_view, NOT run_analysis
→ "Brand already exists" should trigger filter_view, not full analysis

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

IMPORTANT:
- NEVER output raw JSON to the user
- When you successfully add brands, summarize what you added and suggest "say 'analyze' to find viral posts"
- If the user seems confused, offer specific examples they can try
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

        if not category_name:
            return json.dumps({"ok": False, "error": "Category name is required."})

        if not ig_handles and not tt_handles:
            return json.dumps({"ok": False, "error": "No handles provided."})

        # Auto-create category if it doesn't exist
        existing = self.vm.list_verticals()
        actual_name = None
        was_existing_vertical = False
        is_recently_recreated = False
        for v in existing:
            if v.lower() == category_name.lower():
                actual_name = v
                was_existing_vertical = True
                # Check if this vertical was recently recreated (within last 10 minutes)
                # This handles the case where user deleted "Streetwear" and remade it fresh
                vertical_obj = self.vm.get_vertical(v)
                if vertical_obj and vertical_obj.created_at:
                    from datetime import datetime, timezone, timedelta
                    try:
                        created = datetime.fromisoformat(vertical_obj.created_at)
                        if created.tzinfo is None:
                            created = created.replace(tzinfo=timezone.utc)
                        age = datetime.now(timezone.utc) - created
                        if age < timedelta(minutes=10):
                            is_recently_recreated = True
                            logger.info(f"Vertical '{v}' was recently recreated ({age.total_seconds():.0f}s ago)")

                            # Compare incoming brands with existing brands
                            existing_brands = vertical_obj.brands
                            existing_ig_handles = {b.instagram_handle.lower() for b in existing_brands if b.instagram_handle}
                            existing_tt_handles = {b.tiktok_handle.lower() for b in existing_brands if b.tiktok_handle}

                            incoming_ig_handles = {h.strip().lstrip("@").lower() for h in ig_handles if h.strip()}
                            incoming_tt_handles = {h.strip().lstrip("@").lower() for h in tt_handles if h.strip()}

                            # If different brands, delete all existing brands for clean slate
                            if existing_ig_handles != incoming_ig_handles or existing_tt_handles != incoming_tt_handles:
                                logger.info(f"Different brands detected - removing {len(existing_brands)} legacy brands from '{v}'")
                                # Delete all brands from this vertical
                                conn = self.vm._get_conn()
                                conn.execute("DELETE FROM vertical_brands WHERE vertical_name = ?", (v,))
                                conn.commit()
                                conn.close()
                                logger.info(f"Cleared legacy brands. Will add {len(incoming_ig_handles) + len(incoming_tt_handles)} new brands.")
                    except (ValueError, TypeError):
                        pass
                break

        if not actual_name:
            self.vm.create_vertical(category_name)
            actual_name = category_name

        # Track which brands are new vs already existed
        added = []
        newly_added_handles = []  # Track actual new brands for incremental collection
        skipped = []
        for handle in ig_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue
            try:
                if self.vm.add_brand(actual_name, instagram_handle=handle):
                    added.append(f"@{handle}")
                    newly_added_handles.append(handle)
                else:
                    skipped.append(f"@{handle}")
            except Exception:
                skipped.append(f"@{handle}")

        # Add TikTok-only handles
        for handle in tt_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue
            try:
                if self.vm.add_brand(actual_name, tiktok_handle=handle):
                    added.append(f"@{handle} (TikTok)")
                    newly_added_handles.append(handle)
                else:
                    skipped.append(f"@{handle} (TikTok)")
            except Exception:
                skipped.append(f"@{handle} (TikTok)")

        self.vm.update_vertical_timestamp(actual_name)
        total = self.vm.get_brand_count(actual_name)

        # Update context so subsequent messages know the active category
        context["active_vertical"] = actual_name
        # Store newly added brands for smart incremental collection
        context["newly_added_brands"] = newly_added_handles
        context["was_existing_vertical"] = was_existing_vertical
        context["is_recently_recreated"] = is_recently_recreated

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "added": added,
            "skipped": skipped,
            "total_brands": total,
            "newly_added_count": len(newly_added_handles),
        })

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
            if self.vm.remove_brand(actual_name, instagram_handle=handle):
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
                    WHERE handle = ?
                      AND collected_at >= ?
                """, (handle, cutoff_str)).fetchone()

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

        # SMART INCREMENTAL COLLECTION: If brands were just added in this conversation,
        # only collect data for the NEW brands (not re-pull existing brands)
        newly_added = context.get("newly_added_brands", [])
        was_existing_vertical = context.get("was_existing_vertical", False)
        is_recently_recreated = context.get("is_recently_recreated", False)

        # If vertical was just deleted and recreated, treat all brands as new
        if is_recently_recreated:
            logger.info(f"Vertical was recently recreated — fetching all brands fresh")
            # Don't filter brands, fetch everything
        elif not brand_handles and newly_added and was_existing_vertical:
            # User added brands to an existing vertical — only fetch the new ones
            brand_handles = newly_added
            logger.info(f"Incremental collection: only fetching {len(brand_handles)} new brands")

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
        cmd = [sys.executable, "main.py", "--profile", actual_name, "--no-email"]
        if should_skip_collect:
            cmd.append("--skip-collect")
            logger.info("Using cached data (posts collected within last 24 hours)")
        if brand_handles:
            cmd.extend(["--brands", ",".join(brand_handles)])

        def _run():
            try:
                subprocess.run(
                    cmd,
                    cwd=str(config.PROJECT_ROOT),
                    capture_output=True,
                    text=True,
                    timeout=900,  # Increased from 300s to 900s (15 minutes)
                )
            except Exception as exc:
                logger.error(f"Analysis failed: {exc}")

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()

        # Update the vertical timestamp (used for cooldown tracking)
        self.vm.update_vertical_timestamp(actual_name)
        context["analysis_started"] = True

        # Build response message based on scope
        if brand_handles:
            handles_str = ", ".join(f"@{h}" for h in brand_handles)
            message = f"Analyzing {handles_str} from {actual_name}."
            # Store selected brands in context for UI sync
            context["selected_brands"] = brand_handles
        else:
            message = f"Analyzing all {brand_count} brands in {actual_name}."

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "brand_count": len(brand_handles) if brand_handles else brand_count,
            "message": message,
            "selected_brands": brand_handles if brand_handles else None,
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
                    max_tokens=600,
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
