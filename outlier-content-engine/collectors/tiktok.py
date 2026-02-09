"""
TikTok Collector — fetches public TikTok post data via RapidAPI.

Uses the same abstract BaseCollector interface as the Instagram collector.
Supports RapidAPI TikTok scrapers.
"""

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import requests

import config
from collectors import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)


class RapidAPITikTokCollector(BaseCollector):
    """Collects TikTok posts via RapidAPI TikTok scraper."""

    API_HOST = "tiktok-scraper7.p.rapidapi.com"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError(
                "TikTok RapidAPI key is required. "
                "Set TIKTOK_RAPIDAPI_KEY or RAPIDAPI_KEY in .env"
            )
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": self.API_HOST,
        }

    def health_check(self) -> bool:
        """Verify TikTok API access."""
        try:
            response = requests.get(
                f"https://{self.API_HOST}/user/info",
                params={"unique_id": "tiktok"},
                headers=self.headers,
                timeout=15,
            )
            return response.status_code == 200
        except Exception:
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent TikTok posts for a handle."""
        data = self._make_request(
            "/user/posts",
            params={"unique_id": handle, "count": min(count, 30)},
        )

        if not data:
            return []

        posts = self._parse_posts(data, handle, competitor_name, count)
        logger.info(
            f"  TikTok @{handle}: collected {len(posts)} posts"
        )
        return posts

    def _make_request(self, endpoint: str, params: dict,
                      max_retries: int = 3) -> Optional[dict]:
        """Make API request with retry logic."""
        url = f"https://{self.API_HOST}{endpoint}"

        for attempt in range(max_retries):
            try:
                response = requests.get(
                    url, params=params, headers=self.headers, timeout=30,
                )

                if response.status_code == 200:
                    return response.json()
                elif response.status_code == 429:
                    wait = 2 ** (attempt + 1)
                    logger.warning(
                        f"TikTok rate limited. Waiting {wait}s..."
                    )
                    time.sleep(wait)
                    continue
                else:
                    logger.error(
                        f"TikTok API error {response.status_code}: "
                        f"{response.text[:200]}"
                    )
                    return None

            except requests.Timeout:
                logger.warning(
                    f"TikTok request timeout (attempt {attempt + 1})"
                )
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)

        return None

    def _parse_posts(self, data: dict, handle: str,
                     competitor_name: str,
                     limit: int) -> List[CollectedPost]:
        """Parse TikTok API response into CollectedPost objects."""
        posts = []
        items = data.get("data", {}).get("videos", [])

        if not items:
            # Try alternate response format
            items = data.get("data", [])

        for item in items[:limit]:
            try:
                # Extract post data
                post_id = str(item.get("video_id", item.get("id", "")))
                if not post_id:
                    continue

                # Parse timestamp
                posted_at = None
                create_time = item.get("create_time")
                if create_time:
                    try:
                        posted_at = datetime.fromtimestamp(
                            int(create_time), tz=timezone.utc
                        )
                    except (ValueError, TypeError):
                        pass

                # Extract audio info
                music = item.get("music", {}) or {}
                audio_id = str(music.get("id", "")) if music.get("id") else None
                audio_name = music.get("title")

                # Extract stats
                stats = item.get("stats", {}) or {}

                posts.append(CollectedPost(
                    post_id=post_id,
                    competitor_name=competitor_name,
                    competitor_handle=handle,
                    platform="tiktok",
                    post_url=f"https://www.tiktok.com/@{handle}/video/{post_id}",
                    media_type="video",
                    caption=item.get("desc", item.get("title", "")),
                    likes=stats.get("diggCount", stats.get("likeCount", 0)) or 0,
                    comments=stats.get("commentCount", 0) or 0,
                    shares=stats.get("shareCount", 0) or 0,
                    views=stats.get("playCount", 0) or 0,
                    saves=stats.get("collectCount", 0) or 0,
                    posted_at=posted_at,
                    media_url=(
                        item.get("cover", item.get("originCover"))
                        or item.get("dynamicCover")
                    ),
                    hashtags=[
                        tag.get("name", "")
                        for tag in item.get("textExtra", [])
                        if tag.get("hashtagName") or tag.get("name")
                    ],
                    follower_count=item.get("authorStats", {}).get(
                        "followerCount"
                    ),
                    audio_id=audio_id,
                    audio_name=audio_name,
                ))

            except Exception as e:
                logger.error(f"Error parsing TikTok post: {e}")
                continue

        return posts


def create_tiktok_collector(source: str = "rapidapi") -> BaseCollector:
    """Create a TikTok collector instance."""
    api_key = getattr(config, 'TIKTOK_RAPIDAPI_KEY', None) or config.RAPIDAPI_KEY

    if source == "rapidapi":
        return RapidAPITikTokCollector(api_key=api_key)
    else:
        raise ValueError(
            f"Unknown TikTok collection source: '{source}'. Use 'rapidapi'."
        )
