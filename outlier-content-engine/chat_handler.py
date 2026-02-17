"""
Chat Handler - Fallback conversational interface when ScoutAgent (GPT) is unavailable.

This is the SECONDARY handler. ScoutAgent (GPT with function calling) is always
tried first in dashboard.py. This handler only runs when:
- No OpenAI API key is configured
- OpenAI API call fails

Handles regex-based command patterns for:
- Creating categories
- Viewing categories and brands
- Adding/removing brands (with auto-category-creation)
- Running analysis
"""

import re
import logging
from typing import Dict, List, Optional, Tuple
from vertical_manager import VerticalManager, Brand
from brand_handle_discovery import BrandHandleDiscovery

logger = logging.getLogger(__name__)


class ChatHandler:
    """Fallback handler for structured chat commands when GPT is unavailable."""

    def __init__(self):
        self.vm = VerticalManager()
        self.brand_discovery = BrandHandleDiscovery()

    def process_message(self, message: str, current_vertical: Optional[str] = None) -> Dict:
        """
        Process user message using pattern matching (no AI).

        Returns dict with:
        - response: Text response
        - type: "text", "category_card", "category_list", "success", "error"
        - data: Optional structured data for UI components
        - actions: Optional list of quick action buttons
        - _handled: Boolean flag indicating this handler recognized the command
        """
        message_lower = message.lower().strip()

        # ── Exact command matches (unambiguous) ──

        # Category list commands
        if any(cmd in message_lower for cmd in [
            "show categories", "list categories", "show collections",
            "my categories", "show my categories", "list collections"
        ]):
            result = self._handle_list_categories()
            result['_handled'] = True
            return result

        # Help command
        if message_lower in ("help", "commands", "what can you do"):
            return {
                "response": self._help_text(),
                "type": "text",
                "_handled": True,
            }

        # ── Create category: "create Streetwear", "create a category called Streetwear" ──
        create_match = re.match(
            r'(?:create|make|new)\s+'
            r'(?:a\s+)?'
            r'(?:(?:category|collection|set)\s+(?:called\s+|named\s+)?)?'
            r'(.+?)(?:\s+(?:category|collection|set))?$',
            message_lower,
        )
        if create_match:
            name = create_match.group(1).strip().title()
            if name and len(name) < 60:
                result = self._handle_create_category(name)
                result['_handled'] = True
                return result

        # ── Add brands: "add @nike @adidas to Streetwear" ──
        add_match = re.match(
            r'add\s+([@\w\s.,&]+?)\s+to\s+([a-zA-Z0-9_&\s]+)$',
            message_lower,
        )
        if add_match:
            handles_str = add_match.group(1)
            category_name = add_match.group(2).strip()
            result = self._handle_add_brands(handles_str, category_name)
            result['_handled'] = True
            return result

        # ── Remove brands: "remove @nike from streetwear" ──
        remove_match = re.match(
            r'remove\s+([@\w\s,]+?)\s+from\s+([a-zA-Z0-9_\s]+)$',
            message_lower,
        )
        if remove_match:
            handles_str = remove_match.group(1)
            category_name = remove_match.group(2).strip()
            result = self._handle_remove_brands(handles_str, category_name)
            result['_handled'] = True
            return result

        # ── Show specific category (only match exact known category names) ──
        # "show Streetwear", "Streetwear" — only if it's an actual existing category
        verticals = self.vm.list_verticals()
        # Check "show X" where X is a known category
        show_match = re.match(r'show\s+(.+)', message_lower)
        if show_match:
            target = show_match.group(1).strip()
            for v in verticals:
                if v.lower() == target:
                    result = self._handle_show_category(v)
                    result['_handled'] = True
                    return result

        # Check if message IS a category name
        for v in verticals:
            if v.lower() == message_lower:
                result = self._handle_show_category(v)
                result['_handled'] = True
                return result

        # ── Not recognized → let dashboard try _get_fallback_response ──
        return {
            "response": "",
            "type": "text",
            "_handled": False,
        }

    def _help_text(self) -> str:
        return (
            "Here's what I can help with:\n\n"
            "**Manage collections:**\n"
            "• 'create Streetwear' — create a new category\n"
            "• 'add @nike @adidas to Streetwear' — add brands\n"
            "• 'show categories' — see all your collections\n"
            "• 'remove @nike from Streetwear' — remove brands\n\n"
            "**Analyze content:**\n"
            "• 'analyze' — run analysis on current collection\n\n"
            "What would you like to do?"
        )

    def _handle_create_category(self, name: str) -> Dict:
        """Create a new category."""
        try:
            created = self.vm.create_vertical(name)
            if created:
                return {
                    "response": (
                        f"Created **{name}** category! "
                        f"Now add brands to it:\n"
                        f"• 'add @brand1 @brand2 to {name}'"
                    ),
                    "type": "success",
                    "data": {"category": name},
                }
            else:
                return {
                    "response": f"**{name}** already exists. Say 'show {name}' to see its brands.",
                    "type": "text",
                }
        except Exception as e:
            logger.error(f"Error creating category: {e}")
            return {
                "response": f"Sorry, I couldn't create '{name}'.",
                "type": "error",
            }

    def _handle_list_categories(self) -> Dict:
        """List all categories with brand counts."""
        try:
            verticals = self.vm.list_verticals()

            if not verticals:
                return {
                    "response": (
                        "You don't have any categories yet.\n\n"
                        "Create one with: 'create Streetwear'\n"
                        "Or add brands directly: 'add @nike @adidas to Streetwear'"
                    ),
                    "type": "text",
                    "actions": [
                        {"label": "+ Create Category", "action": "create_category"}
                    ],
                }

            category_data = []
            for v_name in verticals:
                vertical = self.vm.get_vertical(v_name)
                brand_count = len(vertical.brands) if vertical else 0
                category_data.append({
                    "name": v_name,
                    "brand_count": brand_count,
                })

            return {
                "response": f"You have {len(verticals)} {'category' if len(verticals) == 1 else 'categories'}:",
                "type": "category_list",
                "data": category_data,
            }

        except Exception as e:
            logger.error(f"Error listing categories: {e}")
            return {
                "response": "Sorry, I couldn't retrieve your categories.",
                "type": "error",
            }

    def _handle_show_category(self, category_name: str) -> Dict:
        """Show details of a specific category."""
        try:
            verticals = self.vm.list_verticals()
            actual_name = None
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                return {
                    "response": (
                        f"I couldn't find a category named '{category_name}'.\n"
                        "Say 'show categories' to see available collections, "
                        "or create one with 'create " + category_name.title() + "'."
                    ),
                    "type": "text",
                }

            vertical = self.vm.get_vertical(actual_name)
            if not vertical:
                return {
                    "response": f"Something went wrong loading '{actual_name}'.",
                    "type": "error",
                }

            handles = []
            for brand in vertical.brands:
                if brand.instagram_handle:
                    handles.append(f"@{brand.instagram_handle}")
                if brand.tiktok_handle:
                    handles.append(f"@{brand.tiktok_handle}")

            return {
                "response": f"Here's your {actual_name} collection:",
                "type": "category_card",
                "data": {
                    "name": actual_name,
                    "brands": handles,
                    "brand_count": len(vertical.brands),
                },
                "actions": [
                    {"label": "+ Add Brands", "action": "add_brands", "category": actual_name},
                    {"label": "Run Analysis", "action": "run_analysis", "category": actual_name},
                ],
            }

        except Exception as e:
            logger.error(f"Error showing category {category_name}: {e}")
            return {
                "response": f"Sorry, I couldn't load '{category_name}'.",
                "type": "error",
            }

    def _handle_add_brands(self, handles_str: str, category_name: str) -> Dict:
        """Add brands to a category. Auto-creates the category if it doesn't exist."""
        try:
            # Find or auto-create the category
            verticals = self.vm.list_verticals()
            actual_name = None
            created_new = False
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                # Auto-create the category
                display_name = category_name.strip().title()
                self.vm.create_vertical(display_name)
                actual_name = display_name
                created_new = True

            # Parse input: Extract both @handles and brand names
            items_to_add = self._parse_brand_input(handles_str)

            if not items_to_add:
                return {
                    "response": "I couldn't find any brands to add. Try: 'add @nike @adidas to Streetwear'",
                    "type": "text",
                }

            # Process each item with brand discovery
            added = []
            skipped = []
            suggestions = []

            for item in items_to_add:
                if item['type'] == 'handle':
                    handle = item['value']
                    success = self.vm.add_brand(actual_name, instagram_handle=handle)
                    if success:
                        added.append(f"@{handle}")
                    else:
                        skipped.append(f"@{handle}")

                elif item['type'] == 'brand_name':
                    brand_name = item['value']
                    discovery = self.brand_discovery.discover_handle(brand_name, platform="instagram")

                    if discovery:
                        handle = discovery['handle']
                        official_name = discovery['official_name']

                        success = self.vm.add_brand(
                            actual_name,
                            instagram_handle=handle,
                            brand_name=official_name,
                        )

                        if success:
                            added.append(f"@{handle}")
                            suggestions.append(f"{official_name} → @{handle}")
                        else:
                            skipped.append(f"{brand_name} (@{handle})")
                    else:
                        success = self.vm.add_brand(actual_name, instagram_handle=brand_name)
                        if success:
                            added.append(f"@{brand_name}")
                        else:
                            skipped.append(brand_name)

            self.vm.update_vertical_timestamp(actual_name)
            total_brands = self.vm.get_brand_count(actual_name)

            if not added:
                return {
                    "response": f"Those brands are already in {actual_name}.",
                    "type": "text",
                }

            # Build response
            response_parts = []

            if created_new:
                response_parts.append(f"Created **{actual_name}** category.")

            if suggestions:
                response_parts.append("Resolved brand names:")
                for sugg in suggestions:
                    response_parts.append(f"  • {sugg}")
                response_parts.append("")

            handles_display = ", ".join(added)
            response_parts.append(
                f"Added {handles_display} to {actual_name}. "
                f"Now tracking {total_brands} brand{'s' if total_brands != 1 else ''}."
            )

            if skipped:
                response_parts.append(f"({len(skipped)} already existed)")

            response_parts.append(f"\nSay 'analyze' to find viral posts!")

            return {
                "response": "\n".join(response_parts),
                "type": "success",
                "data": {
                    "category": actual_name,
                    "added_handles": [h.replace('@', '') for h in added],
                    "total_brands": total_brands,
                },
            }

        except Exception as e:
            logger.error(f"Error adding brands: {e}")
            return {
                "response": "Sorry, I couldn't add those brands. Please try again.",
                "type": "error",
            }

    def _parse_brand_input(self, input_str: str) -> List[Dict]:
        """
        Parse user input to detect brand names vs @handles.

        Handles formats like:
        - "@nike @adidas"
        - "nike, adidas"
        - "saintwoods and stussy"
        - "@nike @stussy @saintwoods"

        Returns list of dicts with 'type' ('brand_name' or 'handle') and 'value'.
        """
        items = []

        # Normalize: split "and" / "&" into commas for consistent parsing
        normalized = re.sub(r'\s+and\s+|\s*&\s*', ', ', input_str, flags=re.IGNORECASE)

        # Pre-split space-separated @handles: "@nike @adidas" → "@nike,@adidas"
        if re.search(r'@[\w.]+\s+@[\w.]', normalized):
            normalized = re.sub(r'\s+(?=@)', ',', normalized)

        # Split by commas or pipes
        parts = re.split(r'[,|]+', normalized)

        for part in parts:
            part = part.strip()
            if not part:
                continue

            if part.startswith('@'):
                handle = part[1:]
                items.append({'type': 'handle', 'value': handle})
            else:
                if self.brand_discovery.is_brand_name(part):
                    items.append({'type': 'brand_name', 'value': part})
                else:
                    # Unknown — assume it's a handle without @
                    items.append({'type': 'handle', 'value': part})

        return items

    def _handle_remove_brands(self, handles_str: str, category_name: str) -> Dict:
        """Remove brands from a category."""
        try:
            items = self._parse_brand_input(handles_str)
            handles = [item['value'] for item in items if item.get('value')]
            if not handles:
                return {
                    "response": "I couldn't find any handles to remove.",
                    "type": "text",
                }

            verticals = self.vm.list_verticals()
            actual_name = None
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                return {
                    "response": f"Category '{category_name}' doesn't exist.",
                    "type": "text",
                }

            removed = 0
            for handle in handles:
                if self.vm.remove_brand(actual_name, handle):
                    removed += 1

            if removed == 0:
                return {
                    "response": f"No matching brands found in {actual_name}.",
                    "type": "text",
                }

            self.vm.update_vertical_timestamp(actual_name)
            total_brands = self.vm.get_brand_count(actual_name)
            handles_display = ", ".join(f"@{h}" for h in handles)

            return {
                "response": (
                    f"Removed {handles_display} from {actual_name}. "
                    f"Now tracking {total_brands} brand{'s' if total_brands != 1 else ''}."
                ),
                "type": "success",
                "data": {
                    "category": actual_name,
                    "removed_handles": handles,
                    "total_brands": total_brands,
                },
            }

        except Exception as e:
            logger.error(f"Error removing brands: {e}")
            return {
                "response": "Sorry, I couldn't remove those brands.",
                "type": "error",
            }
