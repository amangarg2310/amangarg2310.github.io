"""
Chat Handler - Conversational interface for category management and analysis.

Handles natural language commands for:
- Viewing categories and brands
- Adding/removing brands
- Running analysis
- Viewing insights
"""

import re
import logging
from typing import Dict, List, Optional, Tuple
from vertical_manager import VerticalManager, Brand
from brand_handle_discovery import BrandHandleDiscovery

logger = logging.getLogger(__name__)


class ChatHandler:
    """Handles conversational chat commands."""

    def __init__(self):
        self.vm = VerticalManager()
        self.brand_discovery = BrandHandleDiscovery()

    def process_message(self, message: str, current_vertical: Optional[str] = None) -> Dict:
        """
        Process user message and return response with optional actions.

        Returns dict with:
        - response: Text response
        - type: "text", "category_card", "category_list", "error"
        - data: Optional structured data for UI components
        - actions: Optional list of quick action buttons
        - _handled: Boolean flag indicating ChatHandler recognized this command
        """
        message_lower = message.lower().strip()

        # Category list commands
        if any(cmd in message_lower for cmd in ["show categories", "list categories", "show collections", "my categories"]):
            result = self._handle_list_categories()
            result['_handled'] = True
            return result

        # Show specific category
        match = re.search(r'show\s+([a-zA-Z0-9_\s]+)', message_lower)
        if match:
            category_name = match.group(1).strip()
            result = self._handle_show_category(category_name)
            result['_handled'] = True
            return result

        # Add brands command: "add @nike @adidas to streetwear"
        add_match = re.search(r'add\s+([@\w\s,]+?)\s+to\s+([a-zA-Z0-9_\s]+)', message_lower)
        if add_match:
            handles_str = add_match.group(1)
            category_name = add_match.group(2).strip()
            result = self._handle_add_brands(handles_str, category_name)
            result['_handled'] = True
            return result

        # Remove brands command: "remove @nike from streetwear"
        remove_match = re.search(r'remove\s+([@\w\s,]+?)\s+from\s+([a-zA-Z0-9_\s]+)', message_lower)
        if remove_match:
            handles_str = remove_match.group(1)
            category_name = remove_match.group(2).strip()
            result = self._handle_remove_brands(handles_str, category_name)
            result['_handled'] = True
            return result

        # If message is just a category name, show that category
        verticals = self.vm.list_verticals()
        for vertical in verticals:
            if vertical.lower() == message_lower:
                result = self._handle_show_category(vertical)
                result['_handled'] = True
                return result

        # Not a recognized command — let the caller decide how to handle
        # (e.g., fall through to ScoutAgent or fallback responses)
        return {
            "response": "",
            "type": "text",
            "_handled": False
        }

    def _handle_list_categories(self) -> Dict:
        """List all categories with brand counts."""
        try:
            verticals = self.vm.list_verticals()

            if not verticals:
                return {
                    "response": "You don't have any categories yet. Would you like to create one?",
                    "type": "text",
                    "actions": [
                        {"label": "+ Create Category", "action": "create_category"}
                    ]
                }

            # Get brand counts for each vertical
            category_data = []
            for v_name in verticals:
                vertical = self.vm.get_vertical(v_name)
                brand_count = len(vertical.brands) if vertical else 0
                category_data.append({
                    "name": v_name,
                    "brand_count": brand_count
                })

            return {
                "response": f"You have {len(verticals)} {'category' if len(verticals) == 1 else 'categories'}:",
                "type": "category_list",
                "data": category_data
            }

        except Exception as e:
            logger.error(f"Error listing categories: {e}")
            return {
                "response": "Sorry, I couldn't retrieve your categories.",
                "type": "error"
            }

    def _handle_show_category(self, category_name: str) -> Dict:
        """Show details of a specific category."""
        try:
            # Try to find the vertical (case-insensitive)
            verticals = self.vm.list_verticals()
            actual_name = None
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                return {
                    "response": f"I couldn't find a category named '{category_name}'. Try 'show categories' to see all available collections.",
                    "type": "text"
                }

            vertical = self.vm.get_vertical(actual_name)
            if not vertical:
                return {
                    "response": f"Something went wrong loading '{actual_name}'.",
                    "type": "error"
                }

            # Extract handles
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
                    "brand_count": len(vertical.brands)
                },
                "actions": [
                    {"label": "+ Add Brands", "action": "add_brands", "category": actual_name},
                    {"label": "Run Analysis", "action": "run_analysis", "category": actual_name}
                ]
            }

        except Exception as e:
            logger.error(f"Error showing category {category_name}: {e}")
            return {
                "response": f"Sorry, I couldn't load the category '{category_name}'.",
                "type": "error"
            }

    def _handle_add_brands(self, handles_str: str, category_name: str) -> Dict:
        """Add brands to a category with intelligent handle discovery."""
        try:
            # Find the actual vertical name (case-insensitive)
            verticals = self.vm.list_verticals()
            actual_name = None
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                return {
                    "response": f"Category '{category_name}' doesn't exist. Create it first or choose an existing one.",
                    "type": "text"
                }

            # Parse input: Extract both @handles and brand names
            items_to_add = self._parse_brand_input(handles_str)

            if not items_to_add:
                return {
                    "response": "I couldn't find any brands or handles to add. Try: 'add @nike supreme' or 'add nike, adidas'",
                    "type": "text"
                }

            # Process each item with brand discovery
            added = []
            skipped = []
            suggestions = []

            for item in items_to_add:
                if item['type'] == 'handle':
                    # Direct handle - add as-is
                    handle = item['value']
                    success = self.vm.add_brand(actual_name, instagram_handle=handle)
                    if success:
                        added.append(f"@{handle}")
                    else:
                        skipped.append(f"@{handle}")

                elif item['type'] == 'brand_name':
                    # Brand name - discover official handle
                    brand_name = item['value']
                    discovery = self.brand_discovery.discover_handle(brand_name, platform="instagram")

                    if discovery:
                        handle = discovery['handle']
                        official_name = discovery['official_name']

                        # Add the discovered handle
                        success = self.vm.add_brand(
                            actual_name,
                            instagram_handle=handle,
                            brand_name=official_name
                        )

                        if success:
                            # Format suggestion message
                            followers = discovery.get('follower_count', 0)
                            if followers >= 1000000:
                                follower_str = f"{followers / 1000000:.1f}M followers"
                            elif followers >= 1000:
                                follower_str = f"{followers / 1000:.0f}K followers"
                            else:
                                follower_str = ""

                            msg = f"@{handle}"
                            if follower_str:
                                msg += f" ({follower_str})"

                            added.append(msg)
                            suggestions.append(f"Added {official_name} as @{handle}")
                        else:
                            skipped.append(f"{brand_name} (@{handle})")
                    else:
                        # Brand not in registry - try as handle
                        success = self.vm.add_brand(actual_name, instagram_handle=brand_name)
                        if success:
                            added.append(f"@{brand_name}")
                        else:
                            skipped.append(brand_name)

            # Update timestamp
            self.vm.update_vertical_timestamp(actual_name)

            # Get updated count
            total_brands = self.vm.get_brand_count(actual_name)

            # Build response
            if not added:
                return {
                    "response": f"Those brands are already in {actual_name}.",
                    "type": "text"
                }

            response_parts = []
            if suggestions:
                response_parts.append("Found official accounts:")
                for sugg in suggestions:
                    response_parts.append(f"  • {sugg}")
                response_parts.append("")

            handles_display = ", ".join(added)
            response_parts.append(f"Added {handles_display} to {actual_name}. Now tracking {total_brands} brand{'s' if total_brands != 1 else ''}.")

            if skipped:
                response_parts.append(f"({len(skipped)} already existed)")

            return {
                "response": "\n".join(response_parts),
                "type": "success",
                "data": {
                    "category": actual_name,
                    "added_handles": [h.replace('@', '') for h in added],
                    "total_brands": total_brands
                }
            }

        except Exception as e:
            logger.error(f"Error adding brands: {e}")
            return {
                "response": "Sorry, I couldn't add those brands. Please try again.",
                "type": "error"
            }

    def _parse_brand_input(self, input_str: str) -> List[Dict]:
        """
        Parse user input to detect brand names vs @handles.

        Returns list of dicts with 'type' ('brand_name' or 'handle') and 'value'.
        """
        items = []

        # Split by common delimiters
        parts = re.split(r'[,\s]+', input_str)

        for part in parts:
            part = part.strip()
            if not part:
                continue

            # Check if it's an @handle
            if part.startswith('@'):
                handle = part[1:]  # Remove @
                items.append({'type': 'handle', 'value': handle})
            else:
                # Check if it's a known brand name
                if self.brand_discovery.is_brand_name(part):
                    items.append({'type': 'brand_name', 'value': part})
                else:
                    # Unknown - assume it's a handle without @
                    items.append({'type': 'handle', 'value': part})

        return items

    def _handle_remove_brands(self, handles_str: str, category_name: str) -> Dict:
        """Remove brands from a category."""
        try:
            # Extract handles
            handles = re.findall(r'@([\w\.]+)', handles_str)
            if not handles:
                return {
                    "response": "I couldn't find any valid handles to remove.",
                    "type": "text"
                }

            # Find actual vertical name
            verticals = self.vm.list_verticals()
            actual_name = None
            for v in verticals:
                if v.lower() == category_name.lower():
                    actual_name = v
                    break

            if not actual_name:
                return {
                    "response": f"Category '{category_name}' doesn't exist.",
                    "type": "text"
                }

            # Remove brands from database
            removed = 0
            not_found = 0
            for handle in handles:
                success = self.vm.remove_brand(actual_name, instagram_handle=handle)
                if success:
                    removed += 1
                else:
                    not_found += 1

            if removed == 0:
                return {
                    "response": f"No matching brands found in {actual_name}.",
                    "type": "text"
                }

            # Update timestamp
            self.vm.update_vertical_timestamp(actual_name)

            # Get updated count
            total_brands = self.vm.get_brand_count(actual_name)

            handles_display = ", ".join([f"@{h}" for h in handles])

            return {
                "response": f"Removed {handles_display} from {actual_name}. Now tracking {total_brands} brand{'s' if total_brands != 1 else ''}.",
                "type": "success",
                "data": {
                    "category": actual_name,
                    "removed_handles": handles,
                    "total_brands": total_brands
                }
            }

        except Exception as e:
            logger.error(f"Error removing brands: {e}")
            return {
                "response": "Sorry, I couldn't remove those brands. Please try again.",
                "type": "error"
            }
