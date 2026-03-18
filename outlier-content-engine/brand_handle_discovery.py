"""
Brand Handle Discovery - Maps brand names to official social media handles.

Helps users find the correct Instagram/TikTok handles when adding brands
by name instead of explicit @handle notation.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class BrandHandleDiscovery:
    """Discovers official social media handles for brand names."""

    def __init__(self, registry_path: Optional[Path] = None):
        if registry_path is None:
            # Default to brand_registry.json in the same directory
            registry_path = Path(__file__).parent / "brand_registry.json"

        self.registry_path = Path(registry_path)
        self.registry = self._load_registry()

    def _load_registry(self) -> Dict:
        """Load brand registry from JSON file."""
        try:
            with open(self.registry_path, 'r') as f:
                data = json.load(f)
                return data.get('brands', {})
        except FileNotFoundError:
            logger.warning(f"Brand registry not found at {self.registry_path}")
            return {}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse brand registry: {e}")
            return {}

    def normalize_brand_name(self, name: str) -> str:
        """Normalize brand name for lookup (lowercase, no spaces/hyphens)."""
        return name.lower().replace(' ', '').replace('-', '').replace('_', '')

    def find_brand(self, brand_name: str) -> Optional[Dict]:
        """
        Find brand data by name (case-insensitive, fuzzy).

        Args:
            brand_name: Brand name to search for

        Returns:
            Brand data dict or None if not found
        """
        normalized = self.normalize_brand_name(brand_name)

        # Direct match
        if normalized in self.registry:
            return self.registry[normalized]

        # Check all keys for partial match
        for key, value in self.registry.items():
            if normalized in key or key in normalized:
                return value

            # Check official name
            official = value.get('official_name', '')
            if normalized in self.normalize_brand_name(official):
                return value

        return None

    def discover_handle(
        self,
        brand_name: str,
        platform: str = "instagram"
    ) -> Optional[Dict]:
        """
        Discover the official handle for a brand on a specific platform.

        Args:
            brand_name: Brand name or partial name
            platform: "instagram" or "tiktok"

        Returns:
            Dict with handle, follower_count, verified status, etc.
            None if brand not found or platform not supported
        """
        brand_data = self.find_brand(brand_name)

        if not brand_data:
            return None

        platform_data = brand_data.get(platform, {})

        if not platform_data or not platform_data.get('handle'):
            return None

        return {
            'handle': platform_data['handle'],
            'follower_count': platform_data.get('follower_count', 0),
            'verified': platform_data.get('verified', False),
            'official_name': brand_data.get('official_name', brand_name),
            'alternatives': brand_data.get('alternatives', []),
            'notes': platform_data.get('notes', brand_data.get('notes', ''))
        }

    def suggest_handle(
        self,
        brand_name: str,
        platform: str = "instagram"
    ) -> Tuple[Optional[str], Optional[Dict]]:
        """
        Suggest the best handle for a brand name.

        Args:
            brand_name: Brand name to search
            platform: Target platform

        Returns:
            Tuple of (suggested_handle, metadata_dict)
            Returns (None, None) if no suggestion found
        """
        discovery = self.discover_handle(brand_name, platform)

        if not discovery:
            return None, None

        return discovery['handle'], discovery

    def get_alternatives(self, brand_name: str) -> List[str]:
        """Get alternative handles for a brand."""
        brand_data = self.find_brand(brand_name)
        if not brand_data:
            return []
        return brand_data.get('alternatives', [])

    def is_brand_name(self, input_str: str) -> bool:
        """
        Detect if input is likely a brand name (vs a handle).

        Args:
            input_str: User input

        Returns:
            True if likely a brand name, False if likely a handle
        """
        # If it starts with @, it's a handle
        if input_str.startswith('@'):
            return False

        # If it's in the registry, it's a brand name
        normalized = self.normalize_brand_name(input_str)
        if normalized in self.registry:
            return True

        # Check for partial matches
        for key in self.registry.keys():
            if normalized in key or key in normalized:
                return True

        return False

    def validate_handle_for_brand(
        self,
        handle: str,
        brand_name: str,
        platform: str = "instagram"
    ) -> Dict:
        """
        Check if a handle matches the expected official handle for a brand.

        Args:
            handle: Handle to validate (without @)
            brand_name: Brand name
            platform: Platform to check

        Returns:
            Dict with:
                - is_official: bool
                - is_alternative: bool
                - suggested_handle: str (if different from input)
                - message: str (explanation)
        """
        discovery = self.discover_handle(brand_name, platform)

        if not discovery:
            return {
                'is_official': False,
                'is_alternative': False,
                'suggested_handle': None,
                'message': f"Unknown brand: {brand_name}"
            }

        official_handle = discovery['handle']
        alternatives = discovery.get('alternatives', [])

        # Check if it matches official handle
        if handle.lower() == official_handle.lower():
            return {
                'is_official': True,
                'is_alternative': False,
                'suggested_handle': official_handle,
                'message': f"Correct! @{official_handle} is the official account."
            }

        # Check if it matches an alternative
        if handle.lower() in [alt.lower() for alt in alternatives]:
            return {
                'is_official': False,
                'is_alternative': True,
                'suggested_handle': official_handle,
                'message': f"@{handle} is related, but @{official_handle} is the main account."
            }

        # Wrong handle
        return {
            'is_official': False,
            'is_alternative': False,
            'suggested_handle': official_handle,
            'message': f"Did you mean @{official_handle}? That's the official account."
        }

    def format_suggestion_message(
        self,
        brand_name: str,
        platform: str = "instagram"
    ) -> Optional[str]:
        """
        Generate a user-friendly message suggesting the correct handle.

        Args:
            brand_name: Brand name
            platform: Platform

        Returns:
            Formatted message or None if brand not found
        """
        discovery = self.discover_handle(brand_name, platform)

        if not discovery:
            return None

        handle = discovery['handle']
        followers = discovery.get('follower_count', 0)
        verified = discovery.get('verified', False)
        official_name = discovery.get('official_name', brand_name)

        # Format follower count
        if followers >= 1000000:
            follower_str = f"{followers / 1000000:.1f}M"
        elif followers >= 1000:
            follower_str = f"{followers / 1000:.0f}K"
        else:
            follower_str = str(followers)

        # Build message
        parts = [f"Found {official_name}!"]

        if followers > 0:
            parts.append(f"@{handle} ({follower_str} followers)")
        else:
            parts.append(f"@{handle}")

        if verified:
            parts.append("✓ Verified")

        # Add notes if present
        notes = discovery.get('notes', '')
        if notes:
            parts.append(f"Note: {notes}")

        return " - ".join(parts)
