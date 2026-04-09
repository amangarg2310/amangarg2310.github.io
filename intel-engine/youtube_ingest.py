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
    # Try DB-stored key first (from setup page), then env var
    try:
        import config as _cfg
        api_key = _cfg.get_api_key('supadata')
    except Exception:
        api_key = ''
    if not api_key:
        api_key = os.environ.get('SUPADATA_API_KEY', '').strip()
    if not api_key:
        return ""

    video_url = f"https://www.youtube.com/watch?v={video_id}"

    # Try official Python SDK first (handles auth/headers properly)
    try:
        from supadata import Supadata
        client = Supadata(api_key=api_key)
        transcript = client.transcript(url=video_url, mode="native")
        if transcript and transcript.content:
            # content is a list of TranscriptEntry objects or a string
            if isinstance(transcript.content, str):
                if transcript.content.strip():
                    logger.info(f"Got transcript via Supadata SDK for {video_id}")
                    return transcript.content
            elif isinstance(transcript.content, list):
                text = " ".join(
                    entry.text if hasattr(entry, 'text') else str(entry)
                    for entry in transcript.content
                )
                if text.strip():
                    logger.info(f"Got transcript via Supadata SDK for {video_id}")
                    return text
    except ImportError:
        logger.info("Supadata SDK not installed, trying raw HTTP")
    except Exception as e:
        logger.warning(f"Supadata SDK failed for {video_id}: {e}")

    # Fallback: raw HTTP with browser-like headers
    api_url = f"https://api.supadata.ai/v1/transcript?url={urllib.request.quote(video_url, safe='')}&mode=native"
    try:
        req = urllib.request.Request(api_url, headers={
            'x-api-key': api_key,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())

        content = data.get('content', '')

        if isinstance(content, str) and content.strip():
            logger.info(f"Got transcript via Supadata HTTP for {video_id}")
            return content

        if isinstance(content, list) and content:
            text = " ".join(
                s.get('text', '') if isinstance(s, dict) else str(s)
                for s in content
            )
            if text.strip():
                logger.info(f"Got transcript via Supadata HTTP for {video_id}")
                return text

    except urllib.error.HTTPError as e:
        body = ''
        try:
            body = e.read().decode()
        except Exception:
            pass
        logger.warning(f"Supadata HTTP error for {video_id}: HTTP {e.code} - {body}")
    except Exception as e:
        logger.warning(f"Supadata HTTP failed for {video_id}: {e}")

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
        # Check if Supadata key is configured (DB or env var)
        try:
            import config as _cfg
            has_supadata = bool(_cfg.get_api_key('supadata'))
        except Exception:
            has_supadata = bool(os.environ.get('SUPADATA_API_KEY', '').strip())
        has_proxy = bool(os.environ.get('WEBSHARE_PROXY_USERNAME', '').strip())
        if not has_supadata and not has_proxy:
            raise ValueError(
                "YouTube is blocking transcript requests from this server. "
                "Add a Supadata API key in Settings (free at supadata.ai, 100 videos/month)."
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


def extract_playlist_id(url: str) -> Optional[str]:
    """Extract playlist ID from a YouTube playlist URL."""
    match = re.search(r'[?&]list=([a-zA-Z0-9_-]+)', url)
    return match.group(1) if match else None


def fetch_playlist_videos(playlist_id: str) -> list[dict]:
    """Fetch video IDs and titles from a YouTube playlist.

    Strategy:
    1. Try RSS feed (fast, no JS, works for channel upload playlists — returns ~15 max)
    2. Fall back to scraping playlist page HTML (gets all videos in playlist)

    Returns all videos found. Caller is responsible for applying caps and dedup filtering.
    """
    # Strategy 1: RSS feed (fast, works for channel upload playlists)
    videos = _fetch_playlist_rss(playlist_id)
    if videos:
        return videos

    # Strategy 2: Scrape playlist page HTML (works for public/unlisted user playlists)
    # Note: _fetch_playlist_html raises ValueError with clear message for private playlists
    videos = _fetch_playlist_html(playlist_id)
    if videos:
        return videos

    raise ValueError("No videos found in playlist. It may be empty or unavailable.")


def _fetch_playlist_rss(playlist_id: str) -> list[dict]:
    """Try fetching playlist via RSS/Atom feed (works for channel upload playlists)."""
    import xml.etree.ElementTree as ET

    rss_url = f"https://www.youtube.com/feeds/videos.xml?playlist_id={playlist_id}"
    try:
        req = urllib.request.Request(rss_url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; IntelEngine/1.0)',
        })
        with urllib.request.urlopen(req, timeout=20) as resp:
            xml_data = resp.read().decode()
    except Exception:
        return []

    ns = {
        'atom': 'http://www.w3.org/2005/Atom',
        'yt': 'http://www.youtube.com/xml/schemas/2015',
        'media': 'http://search.yahoo.com/mrss/',
    }
    root = ET.fromstring(xml_data)
    videos = []
    for entry in root.findall('atom:entry', ns):
        vid_el = entry.find('yt:videoId', ns)
        title_el = entry.find('atom:title', ns)
        if vid_el is not None and vid_el.text:
            videos.append({
                'video_id': vid_el.text,
                'title': title_el.text if title_el is not None else 'Untitled',
            })
    return videos


def _fetch_playlist_html(playlist_id: str) -> list[dict]:
    """Scrape playlist page HTML for video IDs and titles (fallback for user-created playlists).

    Only works for Public or Unlisted playlists — Private playlists require authentication.
    """
    url = f"https://www.youtube.com/playlist?list={playlist_id}"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            html = resp.read().decode('utf-8', errors='replace')
    except Exception as e:
        logger.warning(f"Failed to fetch playlist page: {e}")
        return []

    # Detect private playlist from page alerts
    if '"This playlist is private"' in html or '"PLAYLIST_PRIVATE"' in html:
        raise ValueError(
            "This playlist is private. Change it to Unlisted in YouTube (only people with the link can see it — it won't appear in search) and try again."
        )

    # Extract ytInitialData JSON — find the start marker and brace-match to get full object
    data = _extract_yt_initial_data(html)
    if data is None:
        # Fallback: extract video IDs directly with regex
        return _extract_video_ids_regex(html)

    # Navigate the nested JSON structure to find playlist video renderers
    videos = _extract_from_yt_data(data)
    if not videos:
        # Fallback: regex extraction
        videos = _extract_video_ids_regex(html)

    return videos


def _extract_yt_initial_data(html: str) -> dict | None:
    """Extract ytInitialData JSON from YouTube page HTML using brace matching."""
    marker = 'var ytInitialData = '
    start = html.find(marker)
    if start == -1:
        marker = 'ytInitialData = '
        start = html.find(marker)
    if start == -1:
        return None

    start += len(marker)

    # Brace-match to find the full JSON object
    depth = 0
    in_string = False
    escape = False
    end = start
    for i in range(start, min(start + 2_000_000, len(html))):
        c = html[i]
        if escape:
            escape = False
            continue
        if c == '\\' and in_string:
            escape = True
            continue
        if c == '"' and not escape:
            in_string = not in_string
            continue
        if in_string:
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    else:
        return None

    try:
        return json.loads(html[start:end])
    except json.JSONDecodeError:
        logger.warning("Failed to parse ytInitialData JSON")
        return None


def _extract_from_yt_data(data: dict) -> list[dict]:
    """Extract video IDs and titles from parsed ytInitialData."""
    videos = []
    try:
        tabs = data.get('contents', {}).get('twoColumnBrowseResultsRenderer', {}).get('tabs', [])
        for tab in tabs:
            tab_content = tab.get('tabRenderer', {}).get('content', {})
            section_list = tab_content.get('sectionListRenderer', {}).get('contents', [])
            for section in section_list:
                items = (section.get('itemSectionRenderer', {})
                        .get('contents', [{}])[0]
                        .get('playlistVideoListRenderer', {})
                        .get('contents', []))
                for item in items:
                    renderer = item.get('playlistVideoRenderer', {})
                    vid = renderer.get('videoId')
                    title_runs = renderer.get('title', {}).get('runs', [])
                    title = title_runs[0].get('text', 'Untitled') if title_runs else 'Untitled'
                    if vid:
                        videos.append({'video_id': vid, 'title': title})
    except (KeyError, IndexError, TypeError) as e:
        logger.warning(f"Failed to extract videos from ytInitialData: {e}")
    return videos


def _extract_video_ids_regex(html: str) -> list[dict]:
    """Last-resort: extract video IDs from raw HTML via regex patterns."""
    seen = set()
    videos = []
    # Match "videoId":"XXXXXXXXXXX" patterns
    for match in re.finditer(r'"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"', html):
        vid = match.group(1)
        if vid not in seen:
            seen.add(vid)
            videos.append({'video_id': vid, 'title': 'Untitled'})
    # Try to backfill titles from "title":{"runs":[{"text":"..."}]} near each videoId
    for v in videos:
        pattern = rf'"videoId"\s*:\s*"{re.escape(v["video_id"])}".*?"title"\s*:\s*\{{"runs"\s*:\s*\[\{{"text"\s*:\s*"([^"]+)"'
        title_match = re.search(pattern, html[:500000])
        if title_match:
            v['title'] = title_match.group(1)
    return videos


def chunk_transcript(transcript: str, max_tokens: int = 4500, overlap: int = 200) -> list[str]:
    """Split transcript into topic-coherent chunks using sentence boundaries.

    Uses a two-pass approach:
    1. Split into sentences
    2. Group sentences into chunks that respect topic boundaries by detecting
       vocabulary shifts between sentence groups
    3. Fall back to word-based chunking if sentence splitting fails
    """
    # Split into sentences (handles ., !, ?, and common abbreviations)
    sentences = _split_sentences(transcript)
    if len(sentences) < 3:
        # Too few sentences — use simple word-based chunking
        return _chunk_by_words(transcript, max_tokens, overlap)

    max_words = int(max_tokens * 1.3)
    overlap_words = int(overlap * 1.3)

    # Calculate cumulative word counts per sentence
    sentence_words = [len(s.split()) for s in sentences]
    total_words = sum(sentence_words)

    if total_words <= max_words:
        return [transcript]

    # Score each sentence boundary for topic shift using vocabulary overlap
    shift_scores = _compute_topic_shifts(sentences, window=3)

    # Build chunks respecting topic boundaries
    chunks = []
    current_start = 0
    current_words = 0

    for i, s in enumerate(sentences):
        current_words += sentence_words[i]

        # Check if we should break here
        if current_words >= max_words * 0.7:  # Start looking for break at 70% capacity
            # Find the best break point between here and max
            if current_words >= max_words or (i < len(shift_scores) and shift_scores[i] > 0.5):
                chunk_text = " ".join(sentences[current_start:i + 1])
                chunks.append(chunk_text)

                # Overlap: go back a few sentences
                overlap_sents = 0
                overlap_word_count = 0
                backtrack = i
                while backtrack > current_start and overlap_word_count < overlap_words:
                    overlap_word_count += sentence_words[backtrack]
                    overlap_sents += 1
                    backtrack -= 1

                current_start = max(current_start + 1, i + 1 - overlap_sents)
                current_words = sum(sentence_words[current_start:i + 1])

    # Don't forget the last chunk
    if current_start < len(sentences):
        remaining = " ".join(sentences[current_start:])
        if remaining.strip():
            chunks.append(remaining)

    return chunks if chunks else [transcript]


def _split_sentences(text: str) -> list[str]:
    """Split text into sentences, handling common edge cases."""
    # Split on sentence-ending punctuation followed by space/newline
    parts = re.split(r'(?<=[.!?])\s+', text)
    # Filter empty strings and merge very short fragments
    sentences = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if sentences and len(sentences[-1].split()) < 4:
            sentences[-1] += " " + p
        else:
            sentences.append(p)
    return sentences


def _compute_topic_shifts(sentences: list[str], window: int = 3) -> list[float]:
    """Score each sentence boundary for topic shift using vocabulary overlap.

    Returns a list of scores (0-1) where higher = bigger topic shift.
    Uses Jaccard distance between word sets of adjacent windows.
    """
    scores = []
    stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
                  'on', 'with', 'at', 'by', 'from', 'it', 'its', 'this', 'that', 'and',
                  'or', 'but', 'not', 'so', 'if', 'then', 'than', 'when', 'what', 'which',
                  'who', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
                  'other', 'some', 'such', 'no', 'nor', 'only', 'own', 'same', 'too',
                  'very', 'just', 'because', 'as', 'until', 'while', 'about', 'between',
                  'through', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
                  'out', 'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
                  'where', 'why', 'i', 'you', 'he', 'she', 'we', 'they', 'me', 'him', 'her',
                  'us', 'them', 'my', 'your', 'his', 'our', 'their'}

    def get_words(text):
        return {w.lower() for w in re.findall(r'\b[a-zA-Z]{3,}\b', text)} - stop_words

    for i in range(len(sentences) - 1):
        # Words in the window before this boundary
        before_start = max(0, i - window + 1)
        before_text = " ".join(sentences[before_start:i + 1])
        before_words = get_words(before_text)

        # Words in the window after this boundary
        after_end = min(len(sentences), i + 1 + window)
        after_text = " ".join(sentences[i + 1:after_end])
        after_words = get_words(after_text)

        # Jaccard distance: 1 - (intersection / union)
        if not before_words and not after_words:
            scores.append(0.0)
        else:
            intersection = len(before_words & after_words)
            union = len(before_words | after_words)
            scores.append(1.0 - (intersection / union) if union > 0 else 0.0)

    return scores


def _chunk_by_words(transcript: str, max_tokens: int = 3000, overlap: int = 200) -> list[str]:
    """Fallback: simple word-based chunking with overlap."""
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
