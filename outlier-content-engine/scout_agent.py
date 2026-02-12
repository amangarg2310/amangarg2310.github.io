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
                "Run the outlier detection analysis pipeline for a category. "
                "This collects recent posts and finds viral content."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "category_name": {
                        "type": "string",
                        "description": "The category to analyze.",
                    },
                },
                "required": ["category_name"],
            },
        },
    },
]


# ── ScoutAgent ──────────────────────────────────────────────────────────────

class ScoutAgent:
    """Conversational AI agent using OpenAI function calling."""

    def __init__(self):
        """Initialize Scout with OpenAI client (optional — works without it)."""
        api_key = config.get_api_key("openai")
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
        for v in existing:
            if v.lower() == category_name.lower():
                actual_name = v
                break

        if not actual_name:
            self.vm.create_vertical(category_name)
            actual_name = category_name

        # Add Instagram handles
        added = []
        skipped = []
        for handle in ig_handles:
            handle = handle.strip().lstrip("@")
            if not handle:
                continue
            try:
                if self.vm.add_brand(actual_name, instagram_handle=handle):
                    added.append(f"@{handle}")
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
                else:
                    skipped.append(f"@{handle} (TikTok)")
            except Exception:
                skipped.append(f"@{handle} (TikTok)")

        self.vm.update_vertical_timestamp(actual_name)
        total = self.vm.get_brand_count(actual_name)

        # Update context so subsequent messages know the active category
        context["active_vertical"] = actual_name

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "added": added,
            "skipped": skipped,
            "total_brands": total,
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

    def _handle_run_analysis(self, args: Dict, context: Dict) -> str:
        """Trigger the analysis pipeline in a background thread."""
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

        cmd = [sys.executable, "main.py", "--profile", actual_name, "--no-email"]

        def _run():
            try:
                subprocess.run(
                    cmd,
                    cwd=str(config.PROJECT_ROOT),
                    capture_output=True,
                    text=True,
                    timeout=300,
                )
            except Exception as exc:
                logger.error(f"Analysis failed: {exc}")

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        context["analysis_started"] = True

        return json.dumps({
            "ok": True,
            "category": actual_name,
            "brand_count": brand_count,
            "message": "Analysis started in the background.",
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
