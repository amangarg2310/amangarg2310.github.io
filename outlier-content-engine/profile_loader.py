"""
Profile Loader — loads brand profiles from the database vertical system.

Every module in the engine references the BrandProfile returned here.
Verticals and brands are managed via the dashboard.
"""

import sqlite3
from dataclasses import dataclass, field
from typing import List, Dict, Optional

import config


@dataclass(frozen=True)
class VoiceConfig:
    tone: str
    language_style: str
    themes: List[str]
    avoids: List[str]
    example_captions: List[str]


@dataclass(frozen=True)
class CompetitorConfig:
    name: str
    handles: Dict[str, str]  # platform -> handle


@dataclass(frozen=True)
class ContentTags:
    themes: List[str]
    hook_types: List[str]
    formats: List[str]


@dataclass(frozen=True)
class OutlierSettings:
    engagement_multiplier: float = 2.0
    std_dev_threshold: float = 1.5
    lookback_days: int = 30
    top_outliers_to_analyze: int = 10
    top_outliers_to_rewrite: int = 5


@dataclass(frozen=True)
class BrandProfile:
    name: str
    vertical: str
    tagline: str
    description: str
    voice: VoiceConfig
    competitors: List[CompetitorConfig]
    content_tags: ContentTags
    outlier_settings: OutlierSettings
    profile_name: str = ""
    own_channel: Dict[str, str] = field(default_factory=dict)
    follower_count: Optional[int] = None
    team_size: Optional[str] = None  # "solo", "small_team", "agency"

    def get_competitors(self, platform: str = "instagram") -> List[CompetitorConfig]:
        """Return competitors that have a handle for the given platform."""
        return [c for c in self.competitors if platform in c.handles]

    def get_competitor_handles(self, platform: str = "instagram") -> List[Dict[str, str]]:
        """Return list of {name, handle} dicts for a platform."""
        results = []
        for c in self.competitors:
            if platform in c.handles:
                results.append({
                    "name": c.name,
                    "handle": c.handles[platform],
                })
        return results

    def get_voice_prompt(self) -> str:
        """Build a formatted string ready to inject into LLM prompts."""
        themes_str = ", ".join(self.voice.themes)
        avoids_str = ", ".join(self.voice.avoids)
        examples = "\n".join(f'  - "{cap}"' for cap in self.voice.example_captions)

        return (
            f"Brand: {self.name}\n"
            f"Vertical: {self.vertical}\n"
            f"Tagline: \"{self.tagline}\"\n"
            f"Description: {self.description.strip()}\n\n"
            f"Tone: {self.voice.tone}\n"
            f"Language style: {self.voice.language_style}\n"
            f"Core themes: {themes_str}\n"
            f"Avoids: {avoids_str}\n\n"
            f"Example captions in brand voice:\n{examples}"
        )

    def get_outlier_thresholds(self) -> OutlierSettings:
        """Return outlier detection settings."""
        return self.outlier_settings

    def get_content_tags(self) -> ContentTags:
        """Return content tag categories for the active vertical."""
        return self.content_tags

    def get_own_handle(self, platform: str = "instagram") -> Optional[str]:
        """Return the brand's own handle for the given platform, or None."""
        handle = self.own_channel.get(platform)
        return handle if handle else None


def load_profile_from_database(vertical_name: str) -> Optional[BrandProfile]:
    """
    Load a brand profile from the verticals database.

    Args:
        vertical_name: Name of the vertical in the database.

    Returns:
        BrandProfile dataclass built from vertical data, or None if not found.
    """
    if not config.DB_PATH.exists():
        return None

    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row

        # Get vertical metadata
        vertical_row = conn.execute(
            "SELECT name, description FROM verticals WHERE name = ?",
            (vertical_name,)
        ).fetchone()

        if not vertical_row:
            conn.close()
            return None

        # Get brands for this vertical
        brand_rows = conn.execute("""
            SELECT brand_name, instagram_handle, tiktok_handle
            FROM vertical_brands
            WHERE vertical_name = ?
        """, (vertical_name,)).fetchall()

        conn.close()

        if not brand_rows:
            return None

        # Build competitor configs
        competitors = []
        for brand in brand_rows:
            handles = {}
            if brand['instagram_handle']:
                handles['instagram'] = brand['instagram_handle']
            if brand['tiktok_handle']:
                handles['tiktok'] = brand['tiktok_handle']

            # Use Instagram handle as name if brand_name is not set
            name = brand['brand_name'] or brand['instagram_handle'] or brand['tiktok_handle']
            competitors.append(CompetitorConfig(name=name, handles=handles))

        # Create minimal voice config (Scout doesn't need this, but outlier detection does)
        voice = VoiceConfig(
            tone="engaging",
            language_style="casual",
            themes=["social media", "viral content"],
            avoids=["spam", "clickbait"],
            example_captions=[]
        )

        # Create default content tags
        content_tags = ContentTags(
            themes=["trending", "viral", "engaging"],
            hook_types=["question", "shock", "curiosity"],
            formats=["reel", "carousel", "story"]
        )

        # Use default outlier settings
        outlier_settings = OutlierSettings()

        # Build and return profile
        return BrandProfile(
            name=vertical_name,
            vertical=vertical_name,
            tagline=vertical_row['description'] or f"{vertical_name} brands",
            description=vertical_row['description'] or f"Tracking {vertical_name} competitors",
            voice=voice,
            competitors=competitors,
            content_tags=content_tags,
            outlier_settings=outlier_settings,
            profile_name=vertical_name,
            own_channel={},
            follower_count=None,
            team_size="solo"
        )

    except Exception as e:
        import logging
        logging.error(f"Error loading profile from database: {e}")
        return None


def load_profile(vertical_name: Optional[str] = None) -> BrandProfile:
    """
    Load a brand profile from the database.

    Args:
        vertical_name: Name of the vertical.
                       Defaults to ACTIVE_VERTICAL from .env.

    Returns:
        BrandProfile dataclass with all brand configuration.

    Raises:
        FileNotFoundError: If the vertical is not found in the database.
    """
    if vertical_name is None:
        vertical_name = config.ACTIVE_VERTICAL

    db_profile = load_profile_from_database(vertical_name)
    if db_profile:
        return db_profile

    raise FileNotFoundError(
        f"Vertical '{vertical_name}' not found in database.\n"
        f"Create a vertical in the dashboard or set ACTIVE_VERTICAL in .env."
    )
