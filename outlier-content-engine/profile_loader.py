"""
Profile Loader — loads and validates brand profiles from YAML.

Every module in the engine references the BrandProfile returned here.
To switch brands, change ACTIVE_PROFILE in .env and restart.
"""

import yaml
from dataclasses import dataclass, field
from typing import List, Dict, Optional
from pathlib import Path

import config


class ProfileValidationError(Exception):
    """Raised when a brand profile is missing required fields."""
    pass


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
    profile_name: str = ""  # the filename key, e.g. "heritage"

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


# Fields required in the YAML for a valid profile
REQUIRED_SECTIONS = ["brand", "voice", "competitors", "content_tags"]
REQUIRED_BRAND_FIELDS = ["name", "vertical"]
REQUIRED_VOICE_FIELDS = ["tone", "language_style", "themes", "avoids", "example_captions"]


def load_profile(profile_name: Optional[str] = None) -> BrandProfile:
    """
    Load a brand profile from YAML.

    Args:
        profile_name: Name of the profile (without .yaml).
                      Defaults to ACTIVE_PROFILE from .env.

    Returns:
        BrandProfile dataclass with all brand configuration.

    Raises:
        ProfileValidationError: If the profile is missing or invalid.
        FileNotFoundError: If the YAML file doesn't exist.
    """
    if profile_name is None:
        profile_name = config.ACTIVE_PROFILE

    yaml_path = config.PROFILES_DIR / f"{profile_name}.yaml"

    if not yaml_path.exists():
        available = [f.stem for f in config.PROFILES_DIR.glob("*.yaml") if f.stem != "_template"]
        raise FileNotFoundError(
            f"Profile '{profile_name}' not found at {yaml_path}\n"
            f"Available profiles: {available}\n"
            f"Create one by copying profiles/_template.yaml"
        )

    with open(yaml_path, "r") as f:
        data = yaml.safe_load(f)

    if data is None:
        raise ProfileValidationError(f"Profile '{profile_name}' is empty.")

    _validate_profile(data, profile_name)

    return _build_profile(data, profile_name)


def _validate_profile(data: dict, profile_name: str) -> None:
    """Validate that all required fields are present."""
    missing_sections = [s for s in REQUIRED_SECTIONS if s not in data]
    if missing_sections:
        raise ProfileValidationError(
            f"Profile '{profile_name}' is missing required sections: {missing_sections}"
        )

    brand = data["brand"]
    missing_brand = [f for f in REQUIRED_BRAND_FIELDS if f not in brand or not brand[f]]
    if missing_brand:
        raise ProfileValidationError(
            f"Profile '{profile_name}' brand section is missing: {missing_brand}"
        )

    voice = data["voice"]
    missing_voice = [f for f in REQUIRED_VOICE_FIELDS if f not in voice or not voice[f]]
    if missing_voice:
        raise ProfileValidationError(
            f"Profile '{profile_name}' voice section is missing: {missing_voice}"
        )

    competitors = data["competitors"]
    if not isinstance(competitors, list) or len(competitors) == 0:
        raise ProfileValidationError(
            f"Profile '{profile_name}' must have at least one competitor."
        )

    for i, comp in enumerate(competitors):
        if "name" not in comp or "handles" not in comp:
            raise ProfileValidationError(
                f"Profile '{profile_name}' competitor #{i+1} needs 'name' and 'handles'."
            )


def _build_profile(data: dict, profile_name: str) -> BrandProfile:
    """Construct BrandProfile from validated YAML data."""
    brand = data["brand"]
    voice_data = data["voice"]
    tags_data = data.get("content_tags", {})
    outlier_data = data.get("outlier_settings", {})

    voice = VoiceConfig(
        tone=voice_data["tone"],
        language_style=voice_data["language_style"],
        themes=voice_data["themes"],
        avoids=voice_data["avoids"],
        example_captions=voice_data["example_captions"],
    )

    competitors = [
        CompetitorConfig(name=c["name"], handles=c["handles"])
        for c in data["competitors"]
    ]

    content_tags = ContentTags(
        themes=tags_data.get("themes", []),
        hook_types=tags_data.get("hook_types", []),
        formats=tags_data.get("formats", []),
    )

    outlier_settings = OutlierSettings(
        engagement_multiplier=outlier_data.get("engagement_multiplier", 2.0),
        std_dev_threshold=outlier_data.get("std_dev_threshold", 1.5),
        lookback_days=outlier_data.get("lookback_days", 30),
        top_outliers_to_analyze=outlier_data.get("top_outliers_to_analyze", 10),
        top_outliers_to_rewrite=outlier_data.get("top_outliers_to_rewrite", 5),
    )

    return BrandProfile(
        name=brand["name"],
        vertical=brand["vertical"],
        tagline=brand.get("tagline", ""),
        description=brand.get("description", ""),
        voice=voice,
        competitors=competitors,
        content_tags=content_tags,
        outlier_settings=outlier_settings,
        profile_name=profile_name,
    )
