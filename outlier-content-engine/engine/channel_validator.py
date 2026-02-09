"""
Channel Validator — verifies social media handles exist before collection.

Checks if Instagram/TikTok handles are valid, public, and have posts.
Used to warn users about invalid handles rather than silently failing.
"""

import logging
from typing import Dict, Optional

import requests

import config

logger = logging.getLogger(__name__)


class ChannelValidator:
    """Validates social media channel handles before data collection."""

    def validate_instagram(self, handle: str) -> Dict:
        """
        Validate an Instagram handle via RapidAPI.

        Returns:
            {"exists": bool, "is_private": bool, "follower_count": int,
             "post_count": int, "error": str or None}
        """
        result = {
            "handle": handle,
            "platform": "instagram",
            "exists": False,
            "is_private": False,
            "follower_count": 0,
            "post_count": 0,
            "error": None,
        }

        if not config.RAPIDAPI_KEY:
            result["error"] = "RAPIDAPI_KEY not configured"
            return result

        try:
            response = requests.get(
                "https://instagram-scraper-api2.p.rapidapi.com/v1/info",
                params={"username_or_id_or_url": handle},
                headers={
                    "x-rapidapi-key": config.RAPIDAPI_KEY,
                    "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
                },
                timeout=15,
            )

            if response.status_code == 404:
                result["error"] = f"@{handle} not found on Instagram"
                return result

            if response.status_code != 200:
                result["error"] = f"API error: {response.status_code}"
                return result

            data = response.json().get("data", {})
            result["exists"] = True
            result["is_private"] = data.get("is_private", False)
            result["follower_count"] = data.get("follower_count", 0)
            result["post_count"] = data.get("media_count", 0)

            if result["is_private"]:
                result["error"] = (
                    f"@{handle} is a private account. "
                    f"Only public accounts can be monitored."
                )

        except requests.Timeout:
            result["error"] = f"Timeout validating @{handle}"
        except Exception as e:
            result["error"] = f"Validation failed: {str(e)}"

        return result

    def validate_tiktok(self, handle: str) -> Dict:
        """
        Validate a TikTok handle.

        Returns same structure as validate_instagram.
        """
        result = {
            "handle": handle,
            "platform": "tiktok",
            "exists": False,
            "is_private": False,
            "follower_count": 0,
            "post_count": 0,
            "error": None,
        }

        tiktok_key = getattr(config, 'TIKTOK_RAPIDAPI_KEY', None)
        if not tiktok_key and not config.RAPIDAPI_KEY:
            result["error"] = "No TikTok API key configured"
            return result

        api_key = tiktok_key or config.RAPIDAPI_KEY

        try:
            response = requests.get(
                "https://tiktok-scraper7.p.rapidapi.com/user/info",
                params={"unique_id": handle},
                headers={
                    "x-rapidapi-key": api_key,
                    "x-rapidapi-host": "tiktok-scraper7.p.rapidapi.com",
                },
                timeout=15,
            )

            if response.status_code != 200:
                result["error"] = f"API error: {response.status_code}"
                return result

            data = response.json()
            user_info = data.get("data", {}).get("user", {})
            stats = data.get("data", {}).get("stats", {})

            if user_info:
                result["exists"] = True
                result["is_private"] = user_info.get("privateAccount", False)
                result["follower_count"] = stats.get("followerCount", 0)
                result["post_count"] = stats.get("videoCount", 0)
            else:
                result["error"] = f"@{handle} not found on TikTok"

        except requests.Timeout:
            result["error"] = f"Timeout validating @{handle}"
        except Exception as e:
            result["error"] = f"Validation failed: {str(e)}"

        return result

    def validate_all(self, handles: list, platform: str = "instagram") -> list:
        """Validate a list of handles, return results."""
        results = []
        validate_fn = (
            self.validate_instagram if platform == "instagram"
            else self.validate_tiktok
        )
        for handle_info in handles:
            handle = handle_info["handle"]
            result = validate_fn(handle)
            result["competitor_name"] = handle_info.get("name", handle)
            results.append(result)
            if result["exists"]:
                logger.info(
                    f"  @{handle} ({platform}): "
                    f"{result['follower_count']:,} followers, "
                    f"{result['post_count']} posts"
                )
            elif result["error"]:
                logger.warning(f"  @{handle}: {result['error']}")
        return results
