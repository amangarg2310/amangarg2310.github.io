#!/usr/bin/env python3
"""CLI: Ingest all videos from a YouTube playlist."""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingestion.channel_scanner import list_playlist_videos
from ingestion.source_registry import SourceRegistry
from ingestion.transcript_fetcher import fetch_and_save

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Ingest all videos from a YouTube playlist")
    parser.add_argument("playlist_url", help="YouTube playlist URL")
    parser.add_argument("--max-videos", "-m", type=int, default=None, help="Max videos to ingest")
    parser.add_argument("--language", "-l", default="en", help="Transcript language (default: en)")
    args = parser.parse_args()

    registry = SourceRegistry()

    logger.info(f"Scanning playlist: {args.playlist_url}")
    videos = list_playlist_videos(args.playlist_url, max_videos=args.max_videos)
    logger.info(f"Found {len(videos)} videos")

    ingested = 0
    skipped = 0
    failed = 0

    for video in videos:
        video_id = video["id"]

        if registry.is_known(video_id):
            status = registry.get_status(video_id)
            if status in ("ingested", "processed"):
                skipped += 1
                continue

        registry.register(
            video_id=video_id,
            url=video["url"],
            title=video.get("title"),
            channel=video.get("channel"),
            channel_id=video.get("channel_id"),
        )

        try:
            _, segments, save_path = fetch_and_save(
                video_id,
                metadata=video,
                languages=[args.language],
            )
            registry.mark_ingested(video_id, str(save_path))
            ingested += 1
            logger.info(f"[{ingested}/{len(videos)}] Ingested: {video.get('title', video_id)}")
        except Exception as e:
            registry.mark_error(video_id, str(e))
            failed += 1
            logger.warning(f"Failed: {video.get('title', video_id)}: {e}")

    logger.info(f"Done. Ingested: {ingested}, Skipped: {skipped}, Failed: {failed}")


if __name__ == "__main__":
    main()
