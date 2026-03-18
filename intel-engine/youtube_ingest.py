"""
YouTube video ingestion — fetch metadata and transcript from a YouTube URL.

Uses YouTube oEmbed API for metadata (no auth required, works on cloud servers)
and youtube-transcript-api for transcripts.
"""

import json
import logging
import re
import urllib.request
import urllib.error
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
    """Fetch video metadata using YouTube oEmbed API (no auth, no bot detection)."""
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    oembed_url = f"https://www.youtube.com/oembed?url={urllib.request.quote(video_url, safe='')}&format=json"

    try:
        req = urllib.request.Request(oembed_url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; IntelEngine/1.0)',
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 401 or e.code == 403:
            raise ValueError(f"Video is private or unavailable: {video_id}")
        elif e.code == 404:
            raise ValueError(f"Video not found: {video_id}")
        else:
            raise ValueError(f"Could not fetch video metadata (HTTP {e.code}): {video_id}")
    except Exception as e:
        raise ValueError(f"Could not fetch video metadata: {e}")

    # oEmbed gives title, author_name, thumbnail_url but not duration
    return {
        'title': data.get('title', 'Untitled'),
        'channel': data.get('author_name', 'Unknown'),
        'thumbnail': data.get('thumbnail_url', f'https://img.youtube.com/vi/{video_id}/hqdefault.jpg'),
        'duration': 0,  # oEmbed doesn't provide duration; not critical for pipeline
    }


def fetch_transcript(video_id: str) -> str:
    """Fetch video transcript using youtube-transcript-api."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise ImportError("youtube-transcript-api required. Install with: pip install youtube-transcript-api")

    # Try new API first (v1.0.0+), fall back to old API
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id)
        return " ".join(
            entry.text if hasattr(entry, 'text') else entry.get('text', '')
            for entry in transcript
        )
    except AttributeError:
        pass  # Old version without .fetch()
    except Exception as e:
        logger.warning(f"Could not fetch transcript (new API) for {video_id}: {e}")
        # Try with English language filter
        try:
            ytt_api = YouTubeTranscriptApi()
            transcript = ytt_api.fetch(video_id, languages=['en'])
            return " ".join(
                entry.text if hasattr(entry, 'text') else entry.get('text', '')
                for entry in transcript
            )
        except Exception:
            pass

    # Fall back to old API (pre-v1.0.0)
    try:
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        return " ".join(entry['text'] for entry in transcript_list)
    except Exception as e:
        logger.warning(f"Could not fetch transcript (old API) for {video_id}: {e}")
        try:
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['en'])
            return " ".join(entry['text'] for entry in transcript_list)
        except Exception:
            return ""


def ingest_video(url: str) -> VideoMeta:
    """Full ingestion: URL → metadata + transcript."""
    video_id = extract_video_id(url)
    if not video_id:
        raise ValueError(f"Could not extract video ID from URL: {url}")

    logger.info(f"Ingesting video: {video_id}")
    meta = fetch_video_metadata(video_id)
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
    """Split transcript into overlapping chunks for processing."""
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
