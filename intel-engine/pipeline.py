"""
Intelligence pipeline — full automated flow from source to synthesized knowledge.

Supports multiple source types:
- YouTube videos (transcript extraction)
- Web articles (text extraction)
- Documents (PDF, DOCX, PPTX)
- Images/screenshots (Vision API)
- Pasted text

Each source type produces text that flows through the same pipeline:
ingest → chunk → extract insights → detect domain → synthesize
"""

import logging
import os
import re
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import config
from youtube_ingest import ingest_video, chunk_transcript, extract_video_id
from insight_extractor import extract_insights
from domain_detector import detect_domain_hierarchical
from domain_synthesizer import synthesize_domain, resynthesize_domain_full
from embeddings import batch_generate_embeddings, serialize_embedding

logger = logging.getLogger(__name__)

# In-memory status tracking for UI polling (thread-safe)
_pipeline_status = {}
_status_lock = threading.Lock()
_STATUS_TTL_SECONDS = 600  # Prune entries older than 10 minutes

SOURCE_TYPE_ICONS = {
    'youtube': '🎥',
    'article': '📄',
    'pdf': '📑',
    'docx': '📝',
    'pptx': '📊',
    'image': '🖼️',
    'text': '📋',
}


def get_pipeline_status(video_id: str) -> dict:
    """Get the current processing status for a source."""
    with _status_lock:
        _prune_old_statuses()
        return _pipeline_status.get(video_id, {
            'status': 'unknown',
            'step': '',
            'progress': 0,
            'error': None,
        })


def _update_status(video_id: str, status: str, step: str, progress: int, error: str = None, **extra):
    """Update in-memory status for UI polling (thread-safe)."""
    with _status_lock:
        _pipeline_status[video_id] = {
            'status': status,
            'step': step,
            'progress': progress,
            'error': error,
            '_timestamp': time.time(),
            **extra,
        }


def _prune_old_statuses():
    """Remove status entries older than TTL (called under lock)."""
    now = time.time()
    expired = [k for k, v in _pipeline_status.items()
               if now - v.get('_timestamp', 0) > _STATUS_TTL_SECONDS
               and v.get('status') in ('complete', 'error', 'unknown', 'already_exists')]
    for k in expired:
        del _pipeline_status[k]


def is_processing(video_id: str) -> bool:
    """Check if a source is currently being processed (idempotency check)."""
    with _status_lock:
        entry = _pipeline_status.get(video_id)
        return entry is not None and entry.get('status') == 'processing'


def _embed_insights(conn, source_id: int):
    """Generate and store embeddings for all insights from a source."""
    try:
        rows = conn.execute(
            "SELECT id, title, content FROM insights WHERE source_id = ? AND embedding IS NULL",
            (source_id,),
        ).fetchall()
        if not rows:
            return

        texts = [f"{r[1]} {r[2]}" for r in rows]
        embeddings = batch_generate_embeddings(texts)

        for row, emb in zip(rows, embeddings):
            if emb:
                conn.execute(
                    "UPDATE insights SET embedding = ? WHERE id = ?",
                    (serialize_embedding(emb), row[0]),
                )
        conn.commit()
        logger.info(f"Embedded {sum(1 for e in embeddings if e)} insights for source {source_id}")
    except Exception as e:
        logger.warning(f"Embedding generation failed for source {source_id}: {e}")


def check_already_ingested(video_id: str, db_path=None) -> dict | None:
    """Check if a source has already been ingested."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return None
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        row = conn.execute(
            "SELECT id, video_id, title, status, domain_id FROM sources WHERE video_id = ?",
            (video_id,),
        ).fetchone()
        conn.close()
        return dict(row) if row else None
    except sqlite3.OperationalError:
        return None


def detect_source_type(url: str) -> str:
    """Auto-detect source type from a URL."""
    # A watch?v= URL is ALWAYS a single video, even if it has &list= context
    if re.search(r'(?:youtube\.com/watch|youtu\.be/|youtube\.com/shorts/)', url):
        return 'youtube'
    # Only youtube.com/playlist?list=XXX (no video ID) is a playlist
    if 'youtube.com/playlist' in url and 'list=' in url:
        list_match = re.search(r'[?&]list=([a-zA-Z0-9_-]+)', url)
        if list_match and list_match.group(1) not in ('WL', 'LL', 'FL'):
            return 'playlist'
    return 'article'


def _generate_source_id(prefix: str) -> str:
    """Generate a unique source identifier."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# ══════════════════════════════════════════════════════════════
# YouTube Pipeline (existing, refactored)
# ══════════════════════════════════════════════════════════════

def run_pipeline(url: str, db_path=None) -> dict:
    """
    Run the full intelligence pipeline for a YouTube URL.
    Called from Flask route in a background thread.
    """
    db_path = db_path or config.DB_PATH
    video_id = extract_video_id(url)
    if not video_id:
        return {'status': 'error', 'error': 'Invalid YouTube URL'}

    existing = check_already_ingested(video_id, db_path)
    if existing and existing['status'] == 'processed':
        _update_status(video_id, 'already_exists', 'Already processed', 100,
                       title=existing.get('title', ''),
                       source_id=existing.get('id'))
        return {
            'status': 'already_exists', 'video_id': video_id,
            'title': existing.get('title', ''),
            'source_id': existing.get('id'),
            'message': 'This video has already been processed.',
        }

    try:
        # Step 1: Ingest video
        _update_status(video_id, 'processing', 'Fetching video...', 10)
        video = ingest_video(url)
        _update_status(video_id, 'processing', 'Got transcript', 25,
                       title=video.title, channel=video.channel)

        # Step 2: Store source
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT OR REPLACE INTO sources
            (video_id, url, title, channel, thumbnail, duration_seconds, transcript, source_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'youtube', 'processing', ?)
        """, (video.video_id, url, video.title, video.channel, video.thumbnail,
              video.duration_seconds, video.transcript, now))
        conn.commit()
        source_id = conn.execute(
            "SELECT id FROM sources WHERE video_id = ?", (video.video_id,)
        ).fetchone()[0]
        conn.close()

        # Steps 3-7: shared pipeline
        return _run_shared_pipeline(
            video_id=video.video_id,
            source_id=source_id,
            transcript=video.transcript,
            title=video.title,
            channel=video.channel,
            source_date=now,
            db_path=db_path,
            start_progress=35,
        )

    except Exception as e:
        logger.error(f"Pipeline failed for {url}: {e}", exc_info=True)
        _update_status(video_id, 'error', 'Failed', 0, error=str(e))
        try:
            conn = sqlite3.connect(str(db_path))
            conn.execute(
                "UPDATE sources SET status = 'error', error_message = ? WHERE video_id = ?",
                (str(e), video_id),
            )
            conn.commit()
            conn.close()
        except Exception:
            pass
        return {'status': 'error', 'video_id': video_id, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Playlist Pipeline
# ══════════════════════════════════════════════════════════════

def run_playlist_pipeline(playlist_url: str, db_path=None, user_id=None) -> dict:
    """Ingest all videos from a YouTube playlist sequentially."""
    from youtube_ingest import extract_playlist_id, fetch_playlist_videos

    db_path = db_path or config.DB_PATH
    playlist_id = extract_playlist_id(playlist_url)
    if not playlist_id:
        return {'status': 'error', 'error': 'Invalid playlist URL'}

    playlist_vid = _generate_source_id("playlist")

    try:
        _update_status(playlist_vid, 'processing', 'Fetching playlist...', 5)
        videos = fetch_playlist_videos(playlist_id)
        _update_status(playlist_vid, 'processing', f'Found {len(videos)} videos', 10)

        results = []
        for i, video in enumerate(videos):
            progress = 10 + int((i / max(len(videos), 1)) * 85)
            _update_status(playlist_vid, 'processing',
                           f'Processing {i+1}/{len(videos)}: {video["title"][:50]}...', progress)

            url = f'https://www.youtube.com/watch?v={video["video_id"]}'
            try:
                result = run_pipeline(url, db_path=db_path)
                results.append(result)
            except Exception as e:
                logger.error(f"Playlist video failed ({video['video_id']}): {e}")
                results.append({'status': 'error', 'video_id': video['video_id'], 'error': str(e)})

        succeeded = sum(1 for r in results if r.get('status') in ('complete', 'already_exists'))
        _update_status(playlist_vid, 'complete',
                       f'Done — {succeeded}/{len(videos)} videos processed', 100)
        return {'status': 'complete', 'video_id': playlist_vid, 'total': len(videos), 'succeeded': succeeded, 'results': results}

    except Exception as e:
        logger.error(f"Playlist pipeline failed: {e}", exc_info=True)
        _update_status(playlist_vid, 'error', 'Playlist failed', 0, error=str(e))
        return {'status': 'error', 'video_id': playlist_vid, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Article Pipeline
# ══════════════════════════════════════════════════════════════

def run_article_pipeline(url: str, db_path=None) -> dict:
    """Run the pipeline for a web article URL."""
    from article_ingest import ingest_article, generate_article_id

    db_path = db_path or config.DB_PATH
    source_vid = generate_article_id(url)

    existing = check_already_ingested(source_vid, db_path)
    if existing and existing['status'] == 'processed':
        _update_status(source_vid, 'already_exists', 'Already processed', 100,
                       title=existing.get('title', ''),
                       source_id=existing.get('id'))
        return {
            'status': 'already_exists', 'video_id': source_vid,
            'title': existing.get('title', ''),
            'source_id': existing.get('id'),
        }

    try:
        _update_status(source_vid, 'processing', 'Fetching article...', 10)
        article = ingest_article(url)

        _update_status(source_vid, 'processing', f'Extracted: {article.title[:40]}...', 25,
                       title=article.title, channel=article.site_name)

        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT OR REPLACE INTO sources
            (video_id, url, title, channel, transcript, source_type, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'article', 'processing', ?)
        """, (source_vid, url, article.title, article.site_name, article.text_content, now))
        conn.commit()
        source_id = conn.execute(
            "SELECT id FROM sources WHERE video_id = ?", (source_vid,)
        ).fetchone()[0]
        conn.close()

        return _run_shared_pipeline(
            video_id=source_vid,
            source_id=source_id,
            transcript=article.text_content,
            title=article.title,
            channel=article.site_name,
            source_date=now,
            db_path=db_path,
            start_progress=35,
        )

    except Exception as e:
        logger.error(f"Article pipeline failed for {url}: {e}", exc_info=True)
        _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        return {'status': 'error', 'video_id': source_vid, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# File Pipeline (PDF, DOCX, PPTX)
# ══════════════════════════════════════════════════════════════

def run_file_pipeline(file_path: str, original_filename: str, source_type: str, db_path=None) -> dict:
    """Run the pipeline for an uploaded document."""
    from file_ingest import ingest_file

    db_path = db_path or config.DB_PATH
    source_vid = _generate_source_id("file")

    try:
        _update_status(source_vid, 'processing', f'Extracting text from {original_filename}...', 10,
                       title=original_filename)

        text_content, page_count = ingest_file(file_path, original_filename)

        _update_status(source_vid, 'processing', f'Extracted text ({page_count} pages)', 25,
                       title=original_filename, channel=source_type.upper())

        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT INTO sources
            (video_id, url, title, channel, transcript, source_type, file_path, original_filename, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?)
        """, (source_vid, "", original_filename, source_type.upper(),
              text_content, source_type, file_path, original_filename, now))
        conn.commit()
        source_id = conn.execute(
            "SELECT id FROM sources WHERE video_id = ?", (source_vid,)
        ).fetchone()[0]
        conn.close()

        return _run_shared_pipeline(
            video_id=source_vid,
            source_id=source_id,
            transcript=text_content,
            title=original_filename,
            channel=source_type.upper(),
            source_date=now,
            db_path=db_path,
            start_progress=35,
        )

    except Exception as e:
        logger.error(f"File pipeline failed for {original_filename}: {e}", exc_info=True)
        _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        return {'status': 'error', 'video_id': source_vid, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Image Pipeline
# ══════════════════════════════════════════════════════════════

def run_image_pipeline(file_path: str, original_filename: str, db_path=None) -> dict:
    """Run the pipeline for an uploaded image/screenshot."""
    from image_ingest import ingest_image

    db_path = db_path or config.DB_PATH
    source_vid = _generate_source_id("img")

    try:
        _update_status(source_vid, 'processing', 'Analyzing image with AI...', 10,
                       title=original_filename)

        text_content = ingest_image(file_path)

        _update_status(source_vid, 'processing', 'Image analyzed', 30,
                       title=original_filename, channel='Image')

        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT INTO sources
            (video_id, url, title, channel, transcript, source_type, file_path, original_filename, status, created_at)
            VALUES (?, ?, ?, 'Image', ?, 'image', ?, ?, 'processing', ?)
        """, (source_vid, "", original_filename, text_content, file_path, original_filename, now))
        conn.commit()
        source_id = conn.execute(
            "SELECT id FROM sources WHERE video_id = ?", (source_vid,)
        ).fetchone()[0]
        conn.close()

        return _run_shared_pipeline(
            video_id=source_vid,
            source_id=source_id,
            transcript=text_content,
            title=original_filename,
            channel="Image",
            source_date=now,
            db_path=db_path,
            start_progress=35,
        )

    except Exception as e:
        logger.error(f"Image pipeline failed for {original_filename}: {e}", exc_info=True)
        _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        return {'status': 'error', 'video_id': source_vid, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Text Pipeline (pasted text)
# ══════════════════════════════════════════════════════════════

def run_text_pipeline(title: str, text_content: str, db_path=None) -> dict:
    """Run the pipeline for pasted text."""
    db_path = db_path or config.DB_PATH
    source_vid = _generate_source_id("text")

    try:
        _update_status(source_vid, 'processing', 'Processing text...', 15,
                       title=title)

        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT INTO sources
            (video_id, url, title, channel, transcript, source_type, status, created_at)
            VALUES (?, '', ?, 'Text Note', ?, 'text', 'processing', ?)
        """, (source_vid, title, text_content, now))
        conn.commit()
        source_id = conn.execute(
            "SELECT id FROM sources WHERE video_id = ?", (source_vid,)
        ).fetchone()[0]
        conn.close()

        return _run_shared_pipeline(
            video_id=source_vid,
            source_id=source_id,
            transcript=text_content,
            title=title,
            channel="Text Note",
            source_date=now,
            db_path=db_path,
            start_progress=25,
        )

    except Exception as e:
        logger.error(f"Text pipeline failed: {e}", exc_info=True)
        _update_status(source_vid, 'error', 'Failed', 0, error=str(e))
        return {'status': 'error', 'video_id': source_vid, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Reprocess Pipeline
# ══════════════════════════════════════════════════════════════

def reprocess_pipeline(source_id: int, db_path=None) -> dict:
    """
    Re-process an existing source with current prompts.

    Loads the stored text, re-chunks, re-extracts insights, and re-synthesizes.
    Does NOT re-fetch the original source.
    """
    db_path = db_path or config.DB_PATH

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    source = conn.execute(
        "SELECT id, video_id, title, channel, transcript, domain_id FROM sources WHERE id = ?",
        (source_id,),
    ).fetchone()
    conn.close()

    if not source:
        return {'status': 'error', 'error': 'Source not found'}

    source = dict(source)
    video_id = source['video_id']
    transcript = source['transcript']

    if not transcript or not transcript.strip():
        _update_status(video_id, 'error', 'No text content stored', 0, error='No stored transcript to re-process')
        return {'status': 'error', 'video_id': video_id, 'error': 'No text content to re-process'}

    domain_id = source['domain_id']

    try:
        # Delete old insights
        _update_status(video_id, 'processing', 'Re-analyzing content...', 10,
                       title=source['title'], channel=source['channel'])

        conn = sqlite3.connect(str(db_path))
        conn.execute("DELETE FROM insights WHERE source_id = ?", (source_id,))
        conn.commit()
        conn.close()

        # Re-chunk and re-extract
        chunks = chunk_transcript(transcript)

        all_insights = []
        for i, chunk in enumerate(chunks):
            progress = 20 + int((i / max(len(chunks), 1)) * 40)
            _update_status(video_id, 'processing',
                           f'Re-extracting insights ({i+1}/{len(chunks)})...', progress,
                           title=source['title'], channel=source['channel'])
            insights = extract_insights(chunk, chunk_index=i)
            all_insights.extend(insights)

        # Store new insights
        _update_status(video_id, 'processing', 'Storing insights...', 70,
                       title=source['title'], channel=source['channel'])

        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        for insight in all_insights:
            conn.execute("""
                INSERT INTO insights
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
        conn.execute(
            "UPDATE sources SET processed_at = ? WHERE id = ?",
            (now, source_id),
        )
        conn.commit()

        # Generate embeddings for new insights
        _update_status(video_id, 'processing', 'Generating embeddings...', 75,
                       title=source['title'], channel=source['channel'])
        _embed_insights(conn, source_id)
        conn.close()

        # Re-synthesize the full domain
        _update_status(video_id, 'processing', 'Re-synthesizing knowledge...', 85,
                       title=source['title'], channel=source['channel'])

        resynthesize_domain_full(domain_id, db_path)

        # Get domain name for status
        conn = sqlite3.connect(str(db_path))
        domain_row = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
        domain_name = domain_row[0] if domain_row else None
        conn.close()

        _update_status(video_id, 'complete', 'Done', 100,
                       title=source['title'], channel=source['channel'],
                       domain=domain_name, insights_count=len(all_insights))

        logger.info(f"Reprocess complete: {source['title']} ({len(all_insights)} insights)")
        return {
            'status': 'complete', 'video_id': video_id,
            'title': source['title'], 'insights_count': len(all_insights),
            'domain_name': domain_name,
        }

    except Exception as e:
        logger.error(f"Reprocess failed for source {source_id}: {e}", exc_info=True)
        _update_status(video_id, 'error', 'Failed', 0, error=str(e))
        return {'status': 'error', 'video_id': video_id, 'error': str(e)}


# ══════════════════════════════════════════════════════════════
# Shared Pipeline (steps 3-7, common to all source types)
# ══════════════════════════════════════════════════════════════

def _run_shared_pipeline(
    video_id: str,
    source_id: int,
    transcript: str,
    title: str,
    channel: str,
    source_date: str,
    db_path=None,
    start_progress: int = 35,
    user_id: int = None,
) -> dict:
    """
    Shared pipeline steps: chunk → detect domain → extract insights → store → synthesize.

    Used by all source type pipelines after they've ingested and stored the source.
    """
    db_path = db_path or config.DB_PATH

    # Step 3: Chunk transcript
    _update_status(video_id, 'processing', 'Analyzing content...', start_progress,
                   title=title, channel=channel)
    chunks = chunk_transcript(transcript)

    # Step 4: Auto-detect domain (hierarchical)
    _update_status(video_id, 'processing', 'Detecting domain...', start_progress + 10,
                   title=title, channel=channel)
    domain_result = detect_domain_hierarchical(
        title, channel, chunks[0] if chunks else transcript, db_path, user_id=user_id
    )
    domain_id = domain_result['domain_id']
    domain_name = domain_result['domain_name']

    conn = sqlite3.connect(str(db_path))
    conn.execute("UPDATE sources SET domain_id = ? WHERE id = ?", (domain_id, source_id))
    conn.commit()
    conn.close()

    _update_status(video_id, 'processing', f'Domain: {domain_name}', start_progress + 15,
                   title=title, channel=channel, domain=domain_name)

    # Step 5: Extract insights
    all_insights = []
    for i, chunk in enumerate(chunks):
        progress = (start_progress + 15) + int((i / max(len(chunks), 1)) * 25)
        _update_status(video_id, 'processing',
                       f'Extracting insights ({i+1}/{len(chunks)})...', progress,
                       title=title, channel=channel, domain=domain_name)
        insights = extract_insights(chunk, chunk_index=i)
        all_insights.extend(insights)

    # Step 6: Store insights
    _update_status(video_id, 'processing', 'Storing insights...', 80,
                   title=title, channel=channel, domain=domain_name)

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    for insight in all_insights:
        conn.execute("""
            INSERT INTO insights
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

    # Step 6.5: Generate embeddings for insights
    _update_status(video_id, 'processing', 'Generating embeddings...', 82,
                   title=title, channel=channel, domain=domain_name)
    _embed_insights(conn, source_id)
    conn.close()

    # Step 7: Re-synthesize
    _update_status(video_id, 'processing', 'Synthesizing knowledge...', 90,
                   title=title, channel=channel, domain=domain_name)
    synthesize_domain(domain_id, source_id, title, channel, db_path, source_date=source_date)

    # Mark as processed
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "UPDATE sources SET status = 'processed', processed_at = ? WHERE id = ?",
        (datetime.now(timezone.utc).isoformat(), source_id),
    )
    conn.commit()
    conn.close()

    _update_status(video_id, 'complete', 'Done', 100,
                   title=title, channel=channel, domain=domain_name,
                   insights_count=len(all_insights))

    logger.info(f"Pipeline complete: {title} → {domain_name} ({len(all_insights)} insights)")

    return {
        'status': 'complete', 'video_id': video_id,
        'title': title, 'channel': channel,
        'domain_name': domain_name, 'domain_id': domain_id,
        'insights_count': len(all_insights),
        'is_new_domain': domain_result.get('is_new', False),
    }
