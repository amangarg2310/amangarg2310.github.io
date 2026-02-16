"""
Facebook Collector — fetches public Facebook Page post data via Apify.

Uses the Apify Facebook Pages Scraper actor to collect public page posts.
Follows the same BaseCollector pattern as Instagram and TikTok collectors.
"""

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import requests

import config
from collectors import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)


class ApifyFacebookCollector(BaseCollector):
    """Collects Facebook Page posts via Apify Facebook Pages Scraper."""

    BASE_URL = "https://api.apify.com/v2"
    ACTOR_ID = "apify~facebook-pages-scraper"

    def __init__(self, api_token: str):
        if not api_token:
            raise ValueError(
                "APIFY_API_TOKEN is required for Facebook collection. "
                "Get one at https://apify.com"
            )
        self.api_token = api_token

    def health_check(self) -> bool:
        """Test Apify API access for the Facebook actor."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/acts/{self.ACTOR_ID}",
                params={"token": self.api_token},
                timeout=10,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Facebook health check failed: {e}")
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent Facebook Page posts via Apify."""
        start_time = time.time()
        logger.info(f"  Fetching posts for facebook.com/{handle} via Apify...")

        run_input = {
            "startUrls": [{"url": f"https://www.facebook.com/{handle}"}],
            "resultsLimit": count,
        }

        try:
            # Start the actor run
            resp = requests.post(
                f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs",
                params={"token": self.api_token},
                json=run_input,
                timeout=30,
            )
            resp.raise_for_status()
            run_data = resp.json().get("data", {})
            run_id = run_data.get("id")

            if not run_id:
                logger.error(f"  Failed to start Apify actor run for {handle}")
                return []

            # Wait for the run to complete
            dataset_items = self._wait_for_results(run_id, handle)

            posts = self._parse_posts(dataset_items, handle,
                                      competitor_name, count)

            elapsed = time.time() - start_time
            logger.info(
                f"  Collected {len(posts)} Facebook posts from {handle} "
                f"({elapsed:.1f}s)"
            )
            return posts

        except requests.exceptions.HTTPError as e:
            logger.error(f"  Facebook HTTP error for {handle}: {e}")
            return []
        except Exception as e:
            logger.error(f"  Facebook collection failed for {handle}: {e}")
            return []

    def _wait_for_results(self, run_id: str, handle: str,
                          timeout_seconds: int = 600) -> List[dict]:
        """Poll for actor run completion and return results."""
        start = time.time()
        logger.info(f"  Waiting for Facebook results for {handle}...")

        while time.time() - start < timeout_seconds:
            try:
                resp = requests.get(
                    f"{self.BASE_URL}/actor-runs/{run_id}",
                    params={"token": self.api_token},
                    timeout=10,
                )
                run_info = resp.json().get("data", {})
                status = run_info.get("status")

                if status == "SUCCEEDED":
                    dataset_id = run_info.get("defaultDatasetId")
                    return self._fetch_dataset(dataset_id)
                elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    logger.error(f"  Facebook run {status} for {handle}")
                    return []

                time.sleep(5)
            except Exception as e:
                logger.warning(f"  Error checking run status for {handle}: {e}")
                time.sleep(5)

        logger.error(f"  Facebook run timed out for {handle}")
        return []

    def _fetch_dataset(self, dataset_id: str) -> List[dict]:
        """Fetch results from completed actor run."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/datasets/{dataset_id}/items",
                params={"token": self.api_token, "format": "json"},
                timeout=30,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"  Failed to fetch Facebook dataset: {e}")
            return []

    def _parse_posts(self, items: List[dict], handle: str,
                     competitor_name: str,
                     limit: int) -> List[CollectedPost]:
        """Parse Apify Facebook response into CollectedPost objects."""
        posts = []

        for item in items[:limit]:
            try:
                # Parse timestamp
                posted_at = None
                ts = item.get("time") or item.get("timestamp")
                if ts:
                    try:
                        posted_at = datetime.fromisoformat(
                            str(ts).replace("Z", "+00:00")
                        )
                    except (ValueError, TypeError):
                        pass

                # Determine media type
                media_type = self._detect_media_type(item)

                # Extract caption/text
                caption = item.get("text") or item.get("message") or ""

                # Get media URL
                media_url = (
                    item.get("imageUrl")
                    or item.get("full_picture")
                    or item.get("image")
                )

                # Get post ID
                post_id = (
                    item.get("postId")
                    or item.get("id")
                    or item.get("postUrl", "").split("/")[-1]
                    or ""
                )

                post = CollectedPost(
                    post_id=post_id,
                    competitor_name=competitor_name,
                    competitor_handle=handle,
                    platform="facebook",
                    post_url=item.get("postUrl") or item.get("url")
                        or f"https://www.facebook.com/{handle}/posts/{post_id}",
                    media_type=media_type,
                    caption=caption,
                    likes=item.get("likesCount") or item.get("likes") or 0,
                    comments=item.get("commentsCount") or item.get("comments") or 0,
                    shares=item.get("sharesCount") or item.get("shares") or 0,
                    views=item.get("videoViewCount") or item.get("views") or 0,
                    saves=None,  # Facebook doesn't expose saves publicly
                    posted_at=posted_at,
                    media_url=media_url,
                    follower_count=item.get("pageFollowerCount"),
                )
                posts.append(post)

            except Exception as e:
                logger.warning(f"  Error parsing Facebook post: {e}")
                continue

        return posts

    def _detect_media_type(self, item: dict) -> str:
        """Determine post type from API response."""
        post_type = (item.get("type") or "").lower()

        if "video" in post_type or item.get("videoViewCount"):
            return "video"
        elif "photo" in post_type or item.get("imageUrl"):
            return "image"
        elif "link" in post_type:
            return "link"
        else:
            return "image"


def create_facebook_collector() -> ApifyFacebookCollector:
    """Factory function for the Facebook collector."""
    api_token = config.get_api_key("apify") or config.APIFY_API_TOKEN
    return ApifyFacebookCollector(api_token=api_token)
