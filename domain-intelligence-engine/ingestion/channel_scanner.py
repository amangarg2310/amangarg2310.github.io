"""Discover videos from YouTube channels and playlists using yt-dlp."""

import logging
import time
from typing import Optional

import yt_dlp

logger = logging.getLogger(__name__)


def _make_yt_dlp_opts(quiet: bool = True) -> dict:
    """Base yt-dlp options — extract metadata only, no downloads."""
    return {
        "quiet": quiet,
        "no_warnings": quiet,
        "extract_flat": True,
        "skip_download": True,
    }


def list_channel_videos(
    channel_url: str,
    max_videos: Optional[int] = None,
    max_retries: int = 3,
) -> list[dict]:
    """Return a list of video metadata dicts from a YouTube channel.

    Each dict contains: id, title, url, upload_date (if available).
    """
    opts = _make_yt_dlp_opts()
    if max_videos:
        opts["playlistend"] = max_videos

    for attempt in range(max_retries):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(channel_url, download=False)

            if not info:
                return []

            entries = info.get("entries", []) or []
            videos = []
            for entry in entries:
                if entry is None:
                    continue
                videos.append({
                    "id": entry.get("id", ""),
                    "title": entry.get("title", ""),
                    "url": entry.get("url") or f"https://www.youtube.com/watch?v={entry.get('id', '')}",
                    "upload_date": entry.get("upload_date"),
                    "duration": entry.get("duration"),
                    "channel": info.get("channel") or info.get("uploader"),
                    "channel_id": info.get("channel_id") or info.get("uploader_id"),
                })

            logger.info(f"Found {len(videos)} videos from {channel_url}")
            return videos

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Retry {attempt + 1}/{max_retries} for {channel_url}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to list videos from {channel_url}: {e}")
                raise


def list_playlist_videos(
    playlist_url: str,
    max_videos: Optional[int] = None,
    max_retries: int = 3,
) -> list[dict]:
    """Return a list of video metadata dicts from a YouTube playlist.

    Uses the same format as list_channel_videos.
    """
    return list_channel_videos(playlist_url, max_videos=max_videos, max_retries=max_retries)


def get_video_metadata(video_url: str, max_retries: int = 3) -> dict:
    """Fetch full metadata for a single video (title, channel, description, etc.)."""
    opts = _make_yt_dlp_opts()
    opts["extract_flat"] = False

    for attempt in range(max_retries):
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(video_url, download=False)

            if not info:
                return {}

            return {
                "id": info.get("id", ""),
                "title": info.get("title", ""),
                "description": info.get("description", ""),
                "channel": info.get("channel") or info.get("uploader", ""),
                "channel_id": info.get("channel_id") or info.get("uploader_id", ""),
                "upload_date": info.get("upload_date"),
                "duration": info.get("duration"),
                "view_count": info.get("view_count"),
                "tags": info.get("tags", []),
                "url": video_url,
            }

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Retry {attempt + 1}/{max_retries} for metadata {video_url}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to get metadata for {video_url}: {e}")
                raise
