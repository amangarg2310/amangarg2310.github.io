"""
Intelligence pipeline — the full automated flow from YouTube URL to synthesized knowledge.

This is what runs when a user pastes a URL. Everything is automated:
1. Ingest video (metadata + transcript)
2. Store source in database
3. Chunk transcript
4. Extract insights from each chunk
5. Auto-detect domain
6. Store insights
7. Re-synthesize domain knowledge

Designed to run in a background thread so the UI stays responsive.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone

import config
from youtube_ingest import ingest_video, chunk_transcript, extract_video_id
from insight_extractor import extract_insights
from domain_detector import detect_domain
from domain_synthesizer import synthesize_domain

logger = logging.getLogger(__name__)

# In-memory status tracking for the UI to poll
_pipeline_status = {}


def get_pipeline_status(video_id: str) -> dict:
    """Get the current processing status for a video."""
    return _pipeline_status.get(video_id, {
        'status': 'unknown',
        'step': '',
        'progress': 0,
        'error': None,
    })


def _update_status(video_id: str, status: str, step: str, progress: int, error: str = None, **extra):
    """Update in-memory status for UI polling."""
    _pipeline_status[video_id] = {
        'status': status,
        'step': step,
        'progress': progress,
        'error': error,
        **extra,
    }


def check_already_ingested(video_id: str, db_path=None) -> dict | None:
    """Check if a video has already been ingested."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return None

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, video_id, title, status, domain_id FROM intel_sources WHERE video_id = ?",
            (video_id,),
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except sqlite3.OperationalError:
        return None


def run_pipeline(url: str, db_path=None) -> dict:
    """
    Run the full intelligence pipeline for a YouTube URL.

    This is the main entry point — called from the Flask route in a background thread.

    Args:
        url: YouTube video URL

    Returns:
        dict with: video_id, title, domain_name, insights_count, status
    """
    db_path = db_path or config.DB_PATH

    # Extract video ID first for status tracking
    video_id = extract_video_id(url)
    if not video_id:
        return {'status': 'error', 'error': 'Invalid YouTube URL'}

    # Check if already processed
    existing = check_already_ingested(video_id, db_path)
    if existing and existing['status'] == 'processed':
        _update_status(video_id, 'already_exists', 'Already processed', 100,
                       title=existing.get('title', ''))
        return {
            'status': 'already_exists',
            'video_id': video_id,
            'title': existing.get('title', ''),
            'message': 'This video has already been processed.',
        }

    try:
        # Step 1: Ingest video
        _update_status(video_id, 'processing', 'Fetching video...', 10)
        video = ingest_video(url)
        _update_status(video_id, 'processing', 'Got transcript', 25,
                       title=video.title, channel=video.channel)

        # Step 2: Store source in database
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))

        conn.execute("""
            INSERT OR REPLACE INTO intel_sources
            (video_id, url, title, channel, thumbnail, duration_seconds, transcript, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', ?)
        """, (video.video_id, url, video.title, video.channel, video.thumbnail,
              video.duration_seconds, video.transcript, now))
        conn.commit()

        source_row = conn.execute(
            "SELECT id FROM intel_sources WHERE video_id = ?", (video.video_id,)
        ).fetchone()
        source_id = source_row[0]
        conn.close()

        # Step 3: Chunk transcript
        _update_status(video_id, 'processing', 'Analyzing content...', 35,
                       title=video.title, channel=video.channel)
        chunks = chunk_transcript(video.transcript)

        # Step 4: Auto-detect domain
        _update_status(video_id, 'processing', 'Detecting domain...', 45,
                       title=video.title, channel=video.channel)
        domain_result = detect_domain(
            video.title, video.channel, chunks[0] if chunks else video.transcript, db_path
        )
        domain_id = domain_result['domain_id']
        domain_name = domain_result['domain_name']

        # Update source with domain
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE intel_sources SET domain_id = ? WHERE id = ?", (domain_id, source_id)
        )
        conn.commit()
        conn.close()

        _update_status(video_id, 'processing', f'Domain: {domain_name}', 50,
                       title=video.title, channel=video.channel, domain=domain_name)

        # Step 5: Extract insights from each chunk
        all_insights = []
        for i, chunk in enumerate(chunks):
            progress = 50 + int((i / max(len(chunks), 1)) * 25)
            _update_status(video_id, 'processing',
                           f'Extracting insights ({i+1}/{len(chunks)})...', progress,
                           title=video.title, channel=video.channel, domain=domain_name)

            insights = extract_insights(chunk, chunk_index=i)
            all_insights.extend(insights)

        # Step 6: Store insights
        _update_status(video_id, 'processing', 'Storing insights...', 80,
                       title=video.title, channel=video.channel, domain=domain_name)

        conn = sqlite3.connect(str(db_path))
        for insight in all_insights:
            conn.execute("""
                INSERT INTO intel_insights
                (source_id, domain_id, title, content, insight_type, actionability, key_quotes, chunk_index, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                source_id, domain_id,
                insight.get('title', 'Untitled'),
                insight.get('content', ''),
                insight.get('insight_type', 'general'),
                insight.get('actionability', 'medium'),
                insight.get('key_quote', ''),
                insight.get('chunk_index', 0),
                now,
            ))
        conn.commit()
        conn.close()

        # Step 7: Re-synthesize domain knowledge
        _update_status(video_id, 'processing', 'Synthesizing knowledge...', 90,
                       title=video.title, channel=video.channel, domain=domain_name)

        synthesize_domain(domain_id, source_id, video.title, video.channel, db_path)

        # Mark as processed
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "UPDATE intel_sources SET status = 'processed', processed_at = ? WHERE id = ?",
            (datetime.now(timezone.utc).isoformat(), source_id),
        )
        conn.commit()
        conn.close()

        _update_status(video_id, 'complete', 'Done', 100,
                       title=video.title, channel=video.channel, domain=domain_name,
                       insights_count=len(all_insights))

        logger.info(f"Pipeline complete: {video.title} → {domain_name} ({len(all_insights)} insights)")

        return {
            'status': 'complete',
            'video_id': video_id,
            'title': video.title,
            'channel': video.channel,
            'domain_name': domain_name,
            'domain_id': domain_id,
            'insights_count': len(all_insights),
            'is_new_domain': domain_result.get('is_new', False),
        }

    except Exception as e:
        logger.error(f"Pipeline failed for {url}: {e}", exc_info=True)
        _update_status(video_id, 'error', 'Failed', 0, error=str(e))

        # Mark source as failed if it was stored
        try:
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                "UPDATE intel_sources SET status = 'error', error_message = ? WHERE video_id = ?",
                (str(e), video_id),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass

        return {
            'status': 'error',
            'video_id': video_id,
            'error': str(e),
        }
