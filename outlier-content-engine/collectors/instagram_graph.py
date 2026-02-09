"""
Instagram Graph API Collector — fetches your OWN account's post data.

The official Instagram Graph API (via Meta Business Suite) is the ONLY
way to get saves and shares for Instagram posts. It only works for
accounts you own/manage (requires a valid access token).

This is used exclusively for own-channel voice analysis where complete
engagement data makes the voice learner significantly more accurate.

Setup:
  1. Create a Meta Business app at https://developers.facebook.com
  2. Connect your Instagram Professional account
  3. Generate a long-lived access token
  4. Set IG_GRAPH_ACCESS_TOKEN in .env
"""

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import requests

import config
from collectors import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)


class InstagramGraphCollector(BaseCollector):
    """
    Fetches own-account Instagram posts via the official Graph API.

    Returns full engagement data including saves and shares,
    which are not available from any public scraping API.
    """

    BASE_URL = "https://graph.instagram.com"

    def __init__(self, access_token: str):
        if not access_token:
            raise ValueError(
                "IG_GRAPH_ACCESS_TOKEN is required for own-channel data. "
                "See https://developers.facebook.com/docs/instagram-api"
            )
        self.access_token = access_token

    def health_check(self) -> bool:
        """Verify Graph API access token is valid."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/me",
                params={
                    "fields": "id,username",
                    "access_token": self.access_token,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                data = resp.json()
                logger.info(
                    f"  Graph API connected: @{data.get('username', '?')}"
                )
                return True
            logger.warning(
                f"  Graph API health check: {resp.status_code} — "
                f"{resp.text[:200]}"
            )
            return False
        except Exception as e:
            logger.error(f"Graph API health check failed: {e}")
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """
        Fetch own-channel posts with full engagement metrics.

        The 'handle' param is used for labeling only — the Graph API
        returns posts for whichever account the token belongs to.
        """
        logger.info(f"  Fetching own posts via Graph API for @{handle}...")

        # Step 1: Get media IDs
        media_ids = self._get_media_ids(count)
        if not media_ids:
            logger.warning("  No media returned from Graph API")
            return []

        # Step 2: Get full details + insights for each post
        posts = []
        for media_id in media_ids:
            post = self._get_media_details(media_id, handle, competitor_name)
            if post:
                posts.append(post)
            time.sleep(0.2)  # gentle rate limiting

        logger.info(
            f"  Graph API @{handle}: {len(posts)} posts with full metrics"
        )
        return posts

    def _get_media_ids(self, count: int) -> List[str]:
        """Get recent media IDs from the user's profile."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/me/media",
                params={
                    "fields": "id",
                    "limit": min(count, 50),
                    "access_token": self.access_token,
                },
                timeout=15,
            )
            if resp.status_code != 200:
                logger.error(
                    f"  Graph API media list error: {resp.status_code}"
                )
                return []
            return [item["id"] for item in resp.json().get("data", [])]
        except Exception as e:
            logger.error(f"  Graph API media list failed: {e}")
            return []

    def _get_media_details(self, media_id: str, handle: str,
                           competitor_name: str) -> Optional[CollectedPost]:
        """Fetch full details and insights for a single media post."""
        try:
            # Get media fields
            resp = requests.get(
                f"{self.BASE_URL}/{media_id}",
                params={
                    "fields": (
                        "id,caption,media_type,media_url,permalink,"
                        "timestamp,like_count,comments_count,"
                        "shortcode"
                    ),
                    "access_token": self.access_token,
                },
                timeout=15,
            )
            if resp.status_code != 200:
                return None
            media = resp.json()

            # Get insights (saves, shares, reach, impressions)
            saves = 0
            shares = 0
            views = None
            insights = self._get_media_insights(media_id)
            if insights:
                saves = insights.get("saved", 0)
                shares = insights.get("shares", 0)
                views = insights.get("plays", insights.get("video_views"))

            # Parse timestamp
            posted_at = None
            ts = media.get("timestamp")
            if ts:
                try:
                    posted_at = datetime.fromisoformat(
                        ts.replace("Z", "+00:00")
                    )
                except (ValueError, TypeError):
                    pass

            # Determine media type
            raw_type = (media.get("media_type") or "").upper()
            if raw_type == "VIDEO":
                media_type = "reel"
            elif raw_type == "CAROUSEL_ALBUM":
                media_type = "carousel"
            else:
                media_type = "image"

            caption = media.get("caption", "") or ""
            import re
            hashtags = re.findall(r"#(\w+)", caption)
            mentions = re.findall(r"@(\w+)", caption)

            return CollectedPost(
                post_id=media.get("shortcode", media_id),
                competitor_name=competitor_name,
                competitor_handle=handle,
                platform="instagram",
                post_url=media.get("permalink", ""),
                media_type=media_type,
                caption=caption,
                likes=media.get("like_count", 0),
                comments=media.get("comments_count", 0),
                saves=saves,
                shares=shares,
                views=views,
                posted_at=posted_at,
                media_url=media.get("media_url"),
                hashtags=hashtags,
                mentioned_accounts=mentions,
            )

        except Exception as e:
            logger.error(f"  Error fetching media {media_id}: {e}")
            return None

    def _get_media_insights(self, media_id: str) -> Optional[dict]:
        """Fetch engagement insights (saves, shares, reach) for a post."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/{media_id}/insights",
                params={
                    "metric": "saved,shares,plays",
                    "access_token": self.access_token,
                },
                timeout=15,
            )
            if resp.status_code != 200:
                # Try older metric names for non-reel posts
                resp = requests.get(
                    f"{self.BASE_URL}/{media_id}/insights",
                    params={
                        "metric": "saved,shares",
                        "access_token": self.access_token,
                    },
                    timeout=15,
                )
                if resp.status_code != 200:
                    return None

            results = {}
            for item in resp.json().get("data", []):
                name = item.get("name", "")
                values = item.get("values", [{}])
                results[name] = values[0].get("value", 0) if values else 0
            return results

        except Exception as e:
            logger.debug(f"  Insights unavailable for {media_id}: {e}")
            return None


def create_graph_collector() -> Optional[InstagramGraphCollector]:
    """
    Create a Graph API collector if credentials are available.

    Returns None if IG_GRAPH_ACCESS_TOKEN is not set (graceful fallback).
    """
    token = getattr(config, 'IG_GRAPH_ACCESS_TOKEN', None)
    if not token:
        return None
    return InstagramGraphCollector(access_token=token)
