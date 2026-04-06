"""Fetch transcripts from YouTube videos using youtube-transcript-api."""

import json
import logging
import re
import time
from pathlib import Path
from typing import Optional

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter

from config.settings import TRANSCRIPTS_DIR

logger = logging.getLogger(__name__)


def extract_video_id(url_or_id: str) -> str:
    """Extract YouTube video ID from a URL or return the ID if already bare."""
    patterns = [
        r'(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})',
        r'^([a-zA-Z0-9_-]{11})$',
    ]
    for pattern in patterns:
        match = re.search(pattern, url_or_id)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract video ID from: {url_or_id}")


def fetch_transcript(
    video_id: str,
    languages: Optional[list[str]] = None,
    max_retries: int = 3,
) -> list[dict]:
    """Fetch transcript segments for a YouTube video with retry logic.

    Returns a list of dicts with keys: text, start, duration.
    """
    if languages is None:
        languages = ["en"]

    for attempt in range(max_retries):
        try:
            ytt_api = YouTubeTranscriptApi()
            transcript = ytt_api.fetch(video_id, languages=languages)
            segments = [
                {
                    "text": seg.text,
                    "start": seg.start,
                    "duration": seg.duration,
                }
                for seg in transcript.snippets
            ]
            logger.info(f"Fetched {len(segments)} segments for video {video_id}")
            return segments
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Retry {attempt + 1}/{max_retries} for {video_id}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to fetch transcript for {video_id}: {e}")
                raise


def transcript_to_text(segments: list[dict]) -> str:
    """Convert transcript segments into a single text string."""
    return " ".join(seg["text"] for seg in segments)


def save_transcript(video_id: str, segments: list[dict], metadata: Optional[dict] = None) -> Path:
    """Save raw transcript segments and metadata to disk."""
    video_dir = TRANSCRIPTS_DIR / video_id
    video_dir.mkdir(parents=True, exist_ok=True)

    segments_path = video_dir / "segments.json"
    with open(segments_path, "w") as f:
        json.dump(segments, f, indent=2)

    text_path = video_dir / "transcript.txt"
    with open(text_path, "w") as f:
        f.write(transcript_to_text(segments))

    if metadata:
        meta_path = video_dir / "metadata.json"
        with open(meta_path, "w") as f:
            json.dump(metadata, f, indent=2)

    logger.info(f"Saved transcript for {video_id} to {video_dir}")
    return video_dir


def load_transcript(video_id: str) -> Optional[list[dict]]:
    """Load previously saved transcript segments from disk."""
    segments_path = TRANSCRIPTS_DIR / video_id / "segments.json"
    if not segments_path.exists():
        return None
    with open(segments_path) as f:
        return json.load(f)


def fetch_and_save(
    url_or_id: str,
    metadata: Optional[dict] = None,
    languages: Optional[list[str]] = None,
) -> tuple[str, list[dict], Path]:
    """Convenience: extract ID, fetch transcript, save to disk.

    Returns (video_id, segments, save_path).
    """
    video_id = extract_video_id(url_or_id)
    segments = fetch_transcript(video_id, languages=languages)
    save_path = save_transcript(video_id, segments, metadata=metadata)
    return video_id, segments, save_path
