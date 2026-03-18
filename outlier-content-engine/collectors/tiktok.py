"""
TikTok Collector — fetches public TikTok post data via Apify.

Uses the same abstract BaseCollector interface as the Instagram collector.
"""

import logging
import time
from datetime import datetime, timezone
from typing import List, Optional

import requests

import config
from collectors import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)


class ApifyTikTokCollector(BaseCollector):
    """Collects TikTok posts via Apify TikTok Scraper actor."""

    ACTOR_ID = "clockworks~tiktok-scraper"  # Apify's TikTok scraper

    def __init__(self, api_token: str):
        if not api_token:
            raise ValueError(
                "APIFY_API_TOKEN is required. Get one at https://apify.com"
            )
        self.api_token = api_token
        self.base_url = "https://api.apify.com/v2"

    def health_check(self) -> bool:
        """Verify Apify API access."""
        try:
            response = requests.get(
                f"{self.base_url}/acts/{self.ACTOR_ID}",
                params={"token": self.api_token},
                timeout=10,
            )
            return response.status_code == 200
        except Exception:
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent TikTok posts for a handle using Apify.

        Returns an empty list if the profile has 0 posts (legitimate).
        Raises RuntimeError for API/infrastructure failures so the caller
        can differentiate "no posts" from "collection error."
        """
        logger.info(f"  TikTok @{handle}: starting Apify collection...")

        # Start actor run
        run_input = {
            "profiles": [handle],
            "resultsPerPage": min(count, 50),
            "shouldDownloadVideos": False,
            "shouldDownloadCovers": False,
            "shouldDownloadSubtitles": False,
        }

        try:
            # Trigger actor run
            response = requests.post(
                f"{self.base_url}/acts/{self.ACTOR_ID}/runs",
                params={"token": self.api_token},
                json=run_input,
                timeout=30,
            )

            if response.status_code not in (200, 201):
                raise RuntimeError(
                    f"Apify actor start failed: HTTP {response.status_code}"
                )

            run_data = response.json()
            if not run_data or "data" not in run_data or not run_data["data"]:
                raise RuntimeError(
                    f"Unexpected Apify response: {str(run_data)[:200]}"
                )
            run_id = run_data["data"]["id"]
            logger.info(f"  TikTok @{handle}: Apify run started (ID: {run_id})")

            # Wait for run to complete
            max_wait = 180  # 3 minutes
            wait_interval = 5
            elapsed = 0

            while elapsed < max_wait:
                time.sleep(wait_interval)
                elapsed += wait_interval

                status_response = requests.get(
                    f"{self.base_url}/actor-runs/{run_id}",
                    params={"token": self.api_token},
                    timeout=10,
                )

                if status_response.status_code != 200:
                    raise RuntimeError(
                        f"Run status check failed: HTTP {status_response.status_code}"
                    )

                status_data = status_response.json()
                run_info = status_data.get("data") if status_data else None
                if not run_info:
                    raise RuntimeError("Unexpected status response (no data)")
                status = run_info.get("status", "UNKNOWN")

                if status == "SUCCEEDED":
                    logger.info(f"  TikTok @{handle}: Apify run completed")
                    break
                elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    raise RuntimeError(f"Apify run {status}")

            else:
                raise RuntimeError(
                    f"Apify run timed out after {max_wait}s"
                )

            # Fetch results from dataset
            dataset_id = run_info.get("defaultDatasetId")
            if not dataset_id:
                raise RuntimeError("No dataset ID in run response")
            results_response = requests.get(
                f"{self.base_url}/datasets/{dataset_id}/items",
                params={"token": self.api_token},
                timeout=30,
            )

            if results_response.status_code != 200:
                raise RuntimeError(
                    f"Dataset fetch failed: HTTP {results_response.status_code}"
                )

            items = results_response.json()
            posts = self._parse_apify_posts(items, handle, competitor_name, count)

            logger.info(
                f"  TikTok @{handle}: collected {len(posts)} posts"
            )
            return posts

        except RuntimeError:
            raise  # Propagate infrastructure errors to caller
        except Exception as e:
            raise RuntimeError(f"TikTok collection failed: {e}") from e

    def _parse_apify_posts(self, items: List[dict], handle: str,
                          competitor_name: str,
                          limit: int) -> List[CollectedPost]:
        """Parse Apify TikTok response into CollectedPost objects."""
        posts = []

        for item in items[:limit]:
            try:
                post_id = str(item.get("id", ""))
                if not post_id:
                    continue

                # Parse timestamp (Apify returns Unix timestamp, not ISO)
                posted_at = None
                create_time = item.get("createTime")
                if create_time:
                    try:
                        posted_at = datetime.fromtimestamp(
                            int(create_time), tz=timezone.utc
                        )
                    except (ValueError, TypeError):
                        pass

                # Extract audio info
                music = item.get("musicMeta", {}) or {}
                audio_id = str(music.get("musicId", "")) if music.get("musicId") else None
                audio_name = music.get("musicName")

                # Stats are at root level in Apify response
                likes = item.get("diggCount", 0) or 0
                comments = item.get("commentCount", 0) or 0
                shares = item.get("shareCount", 0) or 0
                views = item.get("playCount", 0) or 0
                saves = item.get("collectCount", 0) or 0

                # Get cover image
                video_meta = item.get("videoMeta", {}) or {}
                media_url = video_meta.get("coverUrl") or video_meta.get("originalCoverUrl")

                posts.append(CollectedPost(
                    post_id=post_id,
                    competitor_name=competitor_name,
                    competitor_handle=handle,
                    platform="tiktok",
                    post_url=item.get("webVideoUrl", f"https://www.tiktok.com/@{handle}/video/{post_id}"),
                    media_type="video",
                    caption=item.get("text", ""),
                    likes=likes,
                    comments=comments,
                    shares=shares,
                    views=views,
                    saves=saves,
                    posted_at=posted_at,
                    media_url=media_url,
                    hashtags=[
                        tag.get("name", "")
                        for tag in item.get("hashtags", [])
                    ],
                    follower_count=item.get("authorMeta", {}).get("fans"),
                    audio_id=audio_id,
                    audio_name=audio_name,
                ))

            except Exception as e:
                logger.error(f"Error parsing Apify TikTok post: {e}")
                continue

        return posts


def create_tiktok_collector() -> BaseCollector:
    """Create a TikTok collector instance (Apify)."""
    api_token = config.get_api_key('apify')
    if not api_token:
        raise ValueError(
            "APIFY_API_TOKEN not set in database or environment. "
            "Add it via the dashboard Setup page or set APIFY_API_TOKEN in .env"
        )
    return ApifyTikTokCollector(api_token=api_token)
