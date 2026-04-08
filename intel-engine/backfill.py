"""
Backfill script — upgrade existing data to the enriched pipeline.

Run after deploying Tier 1 + 2A changes to upgrade existing insights,
re-embed with contextual enrichment, and regenerate hierarchical synthesis.

Usage: python backfill.py [--insights] [--embeddings] [--synthesis] [--all]
"""

import argparse
import json
import logging
import sqlite3
import sys

import config
from insight_extractor import extract_insights
from embeddings import batch_generate_embeddings, serialize_embedding
from domain_synthesizer import resynthesize_domain_full, _cascade_synthesis

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _get_conn():
    conn = sqlite3.connect(str(config.DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.row_factory = sqlite3.Row
    return conn


def backfill_insights():
    """Re-extract insights from existing sources to populate evidence, source_context, confidence, topics."""
    conn = _get_conn()
    sources = conn.execute("""
        SELECT id, video_id, title, transcript FROM sources
        WHERE status IN ('processed', 'processed_empty') AND transcript IS NOT NULL AND transcript != ''
    """).fetchall()
    conn.close()

    logger.info(f"Found {len(sources)} processed sources to re-extract insights from")

    for i, source in enumerate(sources):
        source_id = source['id']
        transcript = source['transcript']
        title = source['title'] or 'Unknown'

        # Check if this source already has enriched insights
        conn = _get_conn()
        sample = conn.execute(
            "SELECT evidence FROM insights WHERE source_id = ? AND evidence IS NOT NULL AND evidence != '' LIMIT 1",
            (source_id,),
        ).fetchone()
        conn.close()

        if sample:
            logger.info(f"[{i+1}/{len(sources)}] Skipping '{title}' — already has enriched insights")
            continue

        logger.info(f"[{i+1}/{len(sources)}] Re-extracting insights for '{title}'...")

        # Chunk the transcript
        from youtube_ingest import chunk_transcript
        chunks = chunk_transcript(transcript)

        all_insights = []
        for ci, chunk in enumerate(chunks):
            insights = extract_insights(chunk, chunk_index=ci)
            all_insights.extend(insights)

        if not all_insights:
            logger.warning(f"  No insights extracted for '{title}'")
            continue

        # Update existing insights with enriched fields
        conn = _get_conn()
        for insight in all_insights:
            # Try to match by title similarity
            conn.execute("""
                UPDATE insights SET
                    evidence = ?,
                    source_context = ?,
                    confidence = ?,
                    topics = ?
                WHERE source_id = ? AND title = ?
            """, (
                insight.get('evidence', ''),
                insight.get('source_context', ''),
                insight.get('confidence', 'stated'),
                json.dumps(insight.get('topics', [])),
                source_id,
                insight.get('title', ''),
            ))
        conn.commit()
        updated = conn.total_changes
        conn.close()
        logger.info(f"  Updated {updated} insights with enriched metadata")


def backfill_embeddings():
    """Re-embed all insights with contextual enrichment (source title + channel + domain path)."""
    conn = _get_conn()
    # Get all insights that need re-embedding (we re-embed all for consistency)
    rows = conn.execute("""
        SELECT i.id, i.title, i.content, s.title as source_title, s.channel, d.path as domain_path
        FROM insights i
        JOIN sources s ON i.source_id = s.id
        LEFT JOIN domains d ON i.domain_id = d.id
        WHERE s.status IN ('processed', 'processed_empty')
        ORDER BY i.id
    """).fetchall()
    conn.close()

    logger.info(f"Re-embedding {len(rows)} insights with contextual enrichment...")

    batch_size = 50
    for batch_start in range(0, len(rows), batch_size):
        batch = rows[batch_start:batch_start + batch_size]

        texts = []
        for r in batch:
            parts = [p for p in [r['source_title'], r['channel'], r['domain_path']] if p]
            prefix = " | ".join(parts) + " | " if parts else ""
            texts.append(f"{prefix}{r['title']} {r['content']}")

        embeddings = batch_generate_embeddings(texts)

        conn = _get_conn()
        for row, emb in zip(batch, embeddings):
            if emb:
                conn.execute(
                    "UPDATE insights SET embedding = ? WHERE id = ?",
                    (serialize_embedding(emb), row['id']),
                )
        conn.commit()
        conn.close()

        done = min(batch_start + batch_size, len(rows))
        logger.info(f"  Embedded {done}/{len(rows)} insights")


def backfill_synthesis():
    """Regenerate hierarchical synthesis at all levels."""
    conn = _get_conn()
    # Get all level-1+ domains with sources (sub-topics and domains)
    domains = conn.execute("""
        SELECT id, name, level, parent_id FROM domains
        WHERE source_count > 0 AND level >= 1
        ORDER BY level DESC, id
    """).fetchall()
    conn.close()

    logger.info(f"Regenerating synthesis for {len(domains)} domains...")

    for i, domain in enumerate(domains):
        logger.info(f"[{i+1}/{len(domains)}] Resynthesizing '{domain['name']}' (level {domain['level']})...")
        try:
            resynthesize_domain_full(domain['id'])
        except Exception as e:
            logger.error(f"  Failed: {e}")

    # Now cascade to parent levels
    conn = _get_conn()
    parents = conn.execute("""
        SELECT id, name, level FROM domains
        WHERE level IN (0, 1) AND source_count > 0
        ORDER BY level DESC
    """).fetchall()
    conn.close()

    for parent in parents:
        logger.info(f"Cascading synthesis for '{parent['name']}' (level {parent['level']})...")
        try:
            _cascade_synthesis(parent['id'], config.DB_PATH)
        except Exception as e:
            logger.error(f"  Cascade failed: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill existing data with enriched pipeline")
    parser.add_argument("--insights", action="store_true", help="Re-extract insights with evidence/confidence/topics")
    parser.add_argument("--embeddings", action="store_true", help="Re-embed insights with contextual enrichment")
    parser.add_argument("--synthesis", action="store_true", help="Regenerate hierarchical synthesis at all levels")
    parser.add_argument("--all", action="store_true", help="Run all backfill steps")
    args = parser.parse_args()

    if not any([args.insights, args.embeddings, args.synthesis, args.all]):
        parser.print_help()
        print("\nNo action specified. Use --all to run everything, or pick individual steps.")
        sys.exit(1)

    if args.insights or args.all:
        backfill_insights()

    if args.embeddings or args.all:
        backfill_embeddings()

    if args.synthesis or args.all:
        backfill_synthesis()

    logger.info("Backfill complete!")
