#!/usr/bin/env python3
"""CLI: Ingest a single YouTube video — fetch transcript and register source."""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingestion.channel_scanner import get_video_metadata
from ingestion.source_registry import SourceRegistry
from ingestion.transcript_fetcher import extract_video_id, fetch_and_save

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def main():
    parser = argparse.ArgumentParser(description="Ingest a single YouTube video transcript")
    parser.add_argument("url", help="YouTube video URL or ID")
    parser.add_argument("--language", "-l", default="en", help="Transcript language (default: en)")
    parser.add_argument("--skip-metadata", action="store_true", help="Skip fetching video metadata via yt-dlp")
    args = parser.parse_args()

    video_id = extract_video_id(args.url)
    registry = SourceRegistry()

    # Check if already ingested
    if registry.is_known(video_id):
        status = registry.get_status(video_id)
        if status in ("ingested", "processed"):
            logger.info(f"Video {video_id} already {status}, skipping")
            return
        logger.info(f"Video {video_id} has status '{status}', re-attempting ingestion")

    # Fetch metadata
    metadata = None
    if not args.skip_metadata:
        try:
            metadata = get_video_metadata(f"https://www.youtube.com/watch?v={video_id}")
            logger.info(f"Video: {metadata.get('title', 'Unknown')} by {metadata.get('channel', 'Unknown')}")
        except Exception as e:
            logger.warning(f"Could not fetch metadata: {e}")

    # Register source
    registry.register(
        video_id=video_id,
        url=f"https://www.youtube.com/watch?v={video_id}",
        title=metadata.get("title") if metadata else None,
        channel=metadata.get("channel") if metadata else None,
        channel_id=metadata.get("channel_id") if metadata else None,
    )

    # Fetch and save transcript
    try:
        _, segments, save_path = fetch_and_save(
            video_id,
            metadata=metadata,
            languages=[args.language],
        )
        registry.mark_ingested(video_id, str(save_path))
        logger.info(f"Successfully ingested {video_id}: {len(segments)} segments saved to {save_path}")
    except Exception as e:
        registry.mark_error(video_id, str(e))
        logger.error(f"Failed to ingest {video_id}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
