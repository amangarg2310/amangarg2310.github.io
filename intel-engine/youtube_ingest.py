"""
YouTube video ingestion — fetch metadata and transcript from a YouTube URL.

Uses YouTube oEmbed API for metadata (no auth required, works on cloud servers)
and youtube-transcript-api for transcripts, with Supadata.ai as a free fallback
when YouTube blocks cloud server IPs.
"""

import json
import logging
import os
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


def _build_transcript_api():
    """Build YouTubeTranscriptApi instance with proxy if configured."""
    from youtube_transcript_api import YouTubeTranscriptApi

    proxy_user = os.environ.get('WEBSHARE_PROXY_USERNAME', '').strip()
    proxy_pass = os.environ.get('WEBSHARE_PROXY_PASSWORD', '').strip()

    if proxy_user and proxy_pass:
        try:
            from youtube_transcript_api.proxies import WebshareProxyConfig
            logger.info("Using Webshare proxy for transcript fetching")
            return YouTubeTranscriptApi(
                proxy_config=WebshareProxyConfig(
                    proxy_username=proxy_user,
                    proxy_password=proxy_pass,
                )
            )
        except ImportError:
            logger.warning("WebshareProxyConfig not available, using direct connection")

    return YouTubeTranscriptApi()


def _extract_text(transcript) -> str:
    """Extract text from transcript entries (works with both old and new API formats)."""
    return " ".join(
        entry.text if hasattr(entry, 'text') else entry.get('text', '')
        for entry in transcript
    )


def _fetch_transcript_supadata(video_id: str) -> str:
    """Fetch transcript via Supadata.ai free API (100 req/month free, no proxy needed)."""
    api_key = os.environ.get('SUPADATA_API_KEY', '').strip()
    if not api_key:
        return ""

    video_url = f"https://www.youtube.com/watch?v={video_id}"
    api_url = f"https://api.supadata.ai/v1/transcript?url={urllib.request.quote(video_url, safe='')}&mode=native"
    try:
        req = urllib.request.Request(api_url, headers={
            'x-api-key': api_key,
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())

        # Supadata returns {content: [...segments...], lang: "en"}
        content = data.get('content', '')

        # If content is a string, return directly
        if isinstance(content, str) and content.strip():
            logger.info(f"Got transcript via Supadata for {video_id}")
            return content

        # If content is a list of segments [{text, offset, duration}]
        if isinstance(content, list) and content:
            text = " ".join(
                s.get('text', '') if isinstance(s, dict) else str(s)
                for s in content
            )
            if text.strip():
                logger.info(f"Got transcript via Supadata for {video_id}")
                return text

    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode()
        except Exception:
            pass
        logger.warning(f"Supadata API error for {video_id}: HTTP {e.code} - {body}")
    except Exception as e:
        logger.warning(f"Supadata transcript fetch failed for {video_id}: {e}")

    return ""


def fetch_transcript(video_id: str) -> str:
    """Fetch video transcript. Tries direct API first, then Supadata fallback."""
    try:
        from youtube_transcript_api import YouTubeTranscriptApi
    except ImportError:
        raise ImportError("youtube-transcript-api required. Install with: pip install youtube-transcript-api")

    ytt_api = _build_transcript_api()

    # Try direct fetch first
    try:
        transcript = ytt_api.fetch(video_id)
        return _extract_text(transcript)
    except Exception as e:
        logger.warning(f"Direct transcript fetch failed for {video_id}: {e}")
        # Try with English language filter
        try:
            transcript = ytt_api.fetch(video_id, languages=['en'])
            return _extract_text(transcript)
        except Exception:
            pass

    # Fallback: Supadata.ai free API
    supadata_text = _fetch_transcript_supadata(video_id)
    if supadata_text:
        return supadata_text

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
        has_supadata = bool(os.environ.get('SUPADATA_API_KEY', '').strip())
        has_proxy = bool(os.environ.get('WEBSHARE_PROXY_USERNAME', '').strip())
        if not has_supadata and not has_proxy:
            raise ValueError(
                "YouTube is blocking transcript requests from this server. "
                "Set SUPADATA_API_KEY env var (free at supadata.ai, 100 videos/month) "
                "to fix this."
            )
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
