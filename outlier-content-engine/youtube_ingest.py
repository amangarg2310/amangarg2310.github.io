"""
YouTube video ingestion — fetch metadata and transcript from a YouTube URL.

Handles URL parsing, metadata extraction via yt-dlp, and transcript fetching
via youtube-transcript-api. No LLM calls here — pure data acquisition.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class VideoMeta:
    """Metadata extracted from a YouTube video."""
    video_id: str
    url: str
    title: str
    channel: str
    thumbnail: str
    duration_seconds: int
    transcript: str


def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from various URL formats."""
    patterns = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/|youtube\.com/v/)([a-zA-Z0-9_-]{11})',
        r'(?:youtube\.com/shorts/)([a-zA-Z0-9_-]{11})',
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None


def fetch_video_metadata(video_id: str) -> dict:
    """Fetch video metadata using yt-dlp (no download)."""
    try:
        import yt_dlp
    except ImportError:
        raise ImportError("yt-dlp is required. Install with: pip install yt-dlp")

    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'no_check_certificates': True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)

    return {
        'title': info.get('title', 'Untitled'),
        'channel': info.get('channel', info.get('uploader', 'Unknown')),
        'thumbnail': info.get('thumbnail', ''),
        'duration': info.get('duration', 0),
    }


def fetch_transcript(video_id: str) -> str:
    """Fetch video transcript using youtube-transcript-api."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise ImportError("youtube-transcript-api required. Install with: pip install youtube-transcript-api")

    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join(entry['text'] for entry in transcript_list)
    except Exception as e:
        logger.warning(f"Could not fetch transcript for {video_id}: {e}")
        # Try auto-generated captions
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
            return " ".join(entry['text'] for entry in transcript_list)
        except Exception:
            return ""


def ingest_video(url: str) -> VideoMeta:
    """
    Full ingestion pipeline for a single YouTube video.

    Args:
        url: YouTube video URL

    Returns:
        VideoMeta with all extracted data

    Raises:
        ValueError: If URL is invalid or video_id can't be extracted
    """
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {url}")

    logger.info(f"Ingesting video: {video_id}")

    # Fetch metadata
    meta = fetch_video_metadata(video_id)

    # Fetch transcript
    transcript = fetch_transcript(video_id)
    if not transcript:
        raise ValueError(f"No transcript available for video: {video_id}")

    return VideoMeta(
        video_id=video_id,
        url=url,
        title=meta['title'],
        channel=meta['channel'],
        thumbnail=meta['thumbnail'],
        duration_seconds=meta['duration'],
        transcript=transcript,
    )


def chunk_transcript(transcript: str, max_tokens: int = 3000, overlap: int = 200) -> list[str]:
    """
    Split transcript into overlapping chunks for processing.

    Uses word-based splitting as a proxy for tokens (~1.3 words/token).
    """
    words = transcript.split()
    max_words = int(max_tokens * 1.3)
    overlap_words = int(overlap * 1.3)

    if len(words) <= max_words:
        return [transcript]

    chunks = []
    start = 0
    while start < len(words):
        end = start + max_words
        chunk = " ".join(words[start:end])
        chunks.append(chunk)

        if end >= len(words):
            break
        start = end - overlap_words

    return chunks
