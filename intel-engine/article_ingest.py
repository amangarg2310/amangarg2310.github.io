"""
Web article ingestion — fetch and extract clean text from any URL.

Uses trafilatura for high-quality article extraction with beautifulsoup4 fallback.
"""

import hashlib
import logging
import urllib.request
import urllib.error
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


@dataclass
class ArticleMeta:
    """Metadata extracted from a web article."""
    source_id: str
    url: str
    title: str
    site_name: str
    text_content: str


def generate_article_id(url: str) -> str:
    """Generate a unique source ID from a URL."""
    url_hash = hashlib.sha256(url.encode()).hexdigest()[:12]
    return f"art_{url_hash}"


def extract_site_name(url: str) -> str:
    """Extract a readable site name from a URL."""
    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    # Remove www. prefix
    if hostname.startswith("www."):
        hostname = hostname[4:]
    return hostname


def ingest_article(url: str) -> ArticleMeta:
    """
    Fetch and extract text content from a web article.

    Tries trafilatura first (best quality), falls back to BeautifulSoup.
    """
    source_id = generate_article_id(url)
    site_name = extract_site_name(url)

    # Try trafilatura first
    text_content = None
    title = None
    try:
        import trafilatura
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text_content = trafilatura.extract(
                downloaded,
                include_comments=False,
                include_tables=True,
                favor_precision=False,
                favor_recall=True,
            )
            # Try to get title from metadata
            metadata = trafilatura.extract_metadata(downloaded)
            if metadata:
                title = metadata.title
                if metadata.sitename:
                    site_name = metadata.sitename
    except ImportError:
        logger.info("trafilatura not installed, trying BeautifulSoup fallback")
    except Exception as e:
        logger.warning(f"trafilatura failed for {url}: {e}")

    # Fallback to BeautifulSoup
    if not text_content:
        try:
            text_content, title = _beautifulsoup_extract(url)
        except Exception as e:
            logger.warning(f"BeautifulSoup fallback failed for {url}: {e}")

    if not text_content or not text_content.strip():
        raise ValueError(f"Could not extract text content from {url}")

    if not title:
        title = site_name or "Web Article"

    logger.info(f"Extracted article from {site_name}: {title} ({len(text_content)} chars)")

    return ArticleMeta(
        source_id=source_id,
        url=url,
        title=title,
        site_name=site_name,
        text_content=text_content,
    )


def _beautifulsoup_extract(url: str) -> tuple[str, Optional[str]]:
    """Fallback extraction using BeautifulSoup."""
    from bs4 import BeautifulSoup

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    soup = BeautifulSoup(html, "html.parser")

    # Extract title
    title = None
    title_tag = soup.find("title")
    if title_tag:
        title = title_tag.get_text(strip=True)

    # Remove script, style, nav, footer elements
    for tag in soup.find_all(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try to find main content area
    main = soup.find("article") or soup.find("main") or soup.find(class_="content") or soup.body

    if main:
        text = main.get_text(separator="\n", strip=True)
    else:
        text = soup.get_text(separator="\n", strip=True)

    # Clean up excessive whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    text = "\n".join(lines)

    return text, title
