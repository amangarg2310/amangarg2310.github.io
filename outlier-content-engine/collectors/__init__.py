"""
Collectors — platform-agnostic data fetching layer.

Each platform collector implements BaseCollector.
Use the factory functions to get the right collector for your config.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime


@dataclass
class CollectedPost:
    """Platform-agnostic post data returned by all collectors."""
    post_id: str                        # unique identifier (shortcode for IG)
    competitor_name: str
    competitor_handle: str
    platform: str                       # "instagram", "tiktok", "facebook"
    post_url: str
    media_type: str                     # "image", "carousel", "reel", "video"
    caption: Optional[str] = None
    likes: int = 0
    comments: int = 0
    saves: Optional[int] = None         # not always available
    shares: Optional[int] = None        # not always available
    views: Optional[int] = None         # for reels/video
    posted_at: Optional[datetime] = None
    media_url: Optional[str] = None
    hashtags: List[str] = field(default_factory=list)
    mentioned_accounts: List[str] = field(default_factory=list)
    follower_count: Optional[int] = None  # of the competitor at collection time


class BaseCollector(ABC):
    """Abstract base for all platform data collectors."""

    @abstractmethod
    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent posts for a competitor handle."""
        ...

    @abstractmethod
    def health_check(self) -> bool:
        """Verify API access is working."""
        ...
