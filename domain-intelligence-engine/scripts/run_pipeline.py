#!/usr/bin/env python3
"""CLI: Run the full ingest → process → store pipeline for pending videos."""

import argparse
import json
import logging
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingestion.source_registry import SourceRegistry
from ingestion.transcript_fetcher import load_transcript, transcript_to_text
from processing.chunker import chunk_segments
from processing.insight_extractor import process_video_chunks
from processing.tagger import tag_insights
from storage.embeddings import generate_embeddings_batch
from storage.vector_store import VectorStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def process_single_video(video_id: str, source: dict, store: VectorStore, registry: SourceRegistry):
    """Process a single ingested video through the full pipeline."""
    logger.info(f"Processing: {source.get('title', video_id)}")

    # Load transcript
    segments = load_transcript(video_id)
    if not segments:
        logger.warning(f"No transcript found for {video_id}")
        registry.mark_error(video_id, "No transcript found on disk")
        return

    # Chunk
    chunks = chunk_segments(segments)
    logger.info(f"  Split into {len(chunks)} chunks")

    # Extract insights
    insights = process_video_chunks(
        chunks=chunks,
        expert_name=source.get("channel", "Unknown"),
        channel_name=source.get("channel", "Unknown"),
        video_title=source.get("title", ""),
        video_id=video_id,
        source_url=source.get("url", ""),
    )
    logger.info(f"  Extracted {len(insights)} insights")

    if not insights:
        registry.mark_error(video_id, "No insights extracted")
        return

    # Tag with domains
    insights = tag_insights(insights)

    # Add IDs and timestamps
    now = datetime.now(timezone.utc).isoformat()
    for insight in insights:
        if "id" not in insight:
            insight["id"] = str(uuid.uuid4())
        insight["processed_at"] = now
        insight["ingested_at"] = source.get("ingested_at", now)

    # Generate embeddings
    texts = [f"{i.get('title', '')} {i.get('content', '')}" for i in insights]
    embeddings = generate_embeddings_batch(texts)
    logger.info(f"  Generated {len(embeddings)} embeddings")

    # Store in vector DB
    count = store.insert_insights_batch(insights, embeddings)
    logger.info(f"  Stored {count} insights in vector DB")

    registry.mark_processed(video_id)


def main():
    parser = argparse.ArgumentParser(description="Run full pipeline on ingested videos")
    parser.add_argument("--video-id", "-v", help="Process a specific video ID (otherwise processes all ingested)")
    parser.add_argument("--limit", "-n", type=int, default=None, help="Max videos to process")
    args = parser.parse_args()

    registry = SourceRegistry()
    store = VectorStore(use_service_role=True)

    if args.video_id:
        source = registry.get_source(args.video_id)
        if not source:
            logger.error(f"Video {args.video_id} not found in registry")
            sys.exit(1)
        process_single_video(args.video_id, source, store, registry)
    else:
        ingested = registry.get_ingested()
        if args.limit:
            ingested = ingested[:args.limit]

        logger.info(f"Found {len(ingested)} videos ready for processing")

        for source in ingested:
            try:
                process_single_video(source["video_id"], source, store, registry)
            except Exception as e:
                logger.error(f"Failed to process {source['video_id']}: {e}")
                registry.mark_error(source["video_id"], str(e))

    stats = registry.stats()
    logger.info(f"Registry stats: {stats}")


if __name__ == "__main__":
    main()
