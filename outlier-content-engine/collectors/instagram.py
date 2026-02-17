"""
Instagram Collector — fetches public competitor post data.

Supports two data sources:
  1. RapidAPI Instagram scrapers (primary, free tier)
  2. Apify Instagram Scraper (fallback, pay-per-result)

Uses the abstract BaseCollector interface so sources are swappable.
"""

import json
import logging
import sqlite3
import time
import re
from datetime import datetime, timezone
from typing import List, Optional, Dict

import requests

import config
from collectors import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)


# ── Database Setup ──

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS competitor_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    brand_profile TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'instagram',
    competitor_name TEXT NOT NULL,
    competitor_handle TEXT NOT NULL,
    posted_at TEXT,
    caption TEXT,
    media_type TEXT,
    media_url TEXT,
    likes INTEGER DEFAULT 0,
    comments INTEGER DEFAULT 0,
    saves INTEGER,
    shares INTEGER,
    views INTEGER,
    follower_count INTEGER,
    estimated_engagement_rate REAL,
    is_outlier INTEGER DEFAULT 0,
    outlier_score REAL,
    content_tags TEXT,
    collected_at TEXT NOT NULL,
    UNIQUE(post_id, platform, brand_profile)
);

CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd REAL,
    context TEXT
);

CREATE TABLE IF NOT EXISTS collection_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_timestamp TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    competitors_collected INTEGER DEFAULT 0,
    posts_collected INTEGER DEFAULT 0,
    posts_new INTEGER DEFAULT 0,
    errors TEXT,
    duration_seconds REAL
);

CREATE INDEX IF NOT EXISTS idx_posts_competitor_date
    ON competitor_posts(competitor_handle, collected_at);
CREATE INDEX IF NOT EXISTS idx_posts_outlier
    ON competitor_posts(is_outlier);
CREATE INDEX IF NOT EXISTS idx_posts_profile
    ON competitor_posts(brand_profile);
"""


def init_database(db_path=None):
    """Create the database and tables if they don't exist."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.executescript(DB_SCHEMA)
    conn.commit()
    conn.close()
    logger.info(f"Database initialized at {db_path}")


def migrate_database(db_path=None):
    """Run schema migrations for new features. Safe to call multiple times."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    # Check existing columns on competitor_posts
    cursor = conn.execute("PRAGMA table_info(competitor_posts)")
    existing_columns = {row[1] for row in cursor.fetchall()}

    new_columns = {
        "is_own_channel": "INTEGER DEFAULT 0",
        "audio_id": "TEXT",
        "audio_name": "TEXT",
        "is_trending_audio": "INTEGER DEFAULT 0",
        "weighted_engagement_score": "REAL",
        "primary_engagement_driver": "TEXT",
        "outlier_timeframe": "TEXT",
        "ai_analysis": "TEXT",
        "archived": "INTEGER DEFAULT 0",
    }

    for col_name, col_type in new_columns.items():
        if col_name not in existing_columns:
            conn.execute(
                f"ALTER TABLE competitor_posts ADD COLUMN {col_name} {col_type}"
            )
            logger.info(f"  Added column: competitor_posts.{col_name}")

    # New tables
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS voice_analysis (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            analyzed_at TEXT NOT NULL,
            source_post_count INTEGER,
            voice_data TEXT NOT NULL,
            top_post_ids TEXT,
            UNIQUE(brand_profile)
        );

        CREATE TABLE IF NOT EXISTS content_series (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            competitor_handle TEXT,
            series_name TEXT NOT NULL,
            format_pattern TEXT,
            post_count INTEGER DEFAULT 0,
            avg_engagement REAL,
            first_seen TEXT,
            last_seen TEXT,
            cadence_days REAL,
            is_active INTEGER DEFAULT 1,
            description TEXT,
            post_ids TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_posts_own_channel
            ON competitor_posts(is_own_channel);
        CREATE INDEX IF NOT EXISTS idx_posts_audio
            ON competitor_posts(audio_id);
    """)

    conn.commit()
    conn.close()
    logger.info("Database migrations complete")


def store_own_posts(posts: List[CollectedPost], profile_name: str,
                    db_path=None) -> int:
    """Store own-channel posts. Reuses store_posts then marks them."""
    new_count = store_posts(posts, profile_name, db_path)

    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    for post in posts:
        conn.execute("""
            UPDATE competitor_posts
            SET is_own_channel = 1
            WHERE post_id = ? AND brand_profile = ?
        """, (post.post_id, profile_name))
    conn.commit()
    conn.close()
    return new_count


def store_posts(posts: List[CollectedPost], profile_name: str,
                db_path=None) -> int:
    """
    Store collected posts in SQLite. Returns count of new posts inserted.
    Uses INSERT OR IGNORE to skip duplicates (same post_id + platform).
    Batch inserts for performance.
    """
    if not posts:
        return 0

    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    cursor = conn.cursor()
    now = datetime.now(timezone.utc).isoformat()

    # Pre-count existing posts to calculate new inserts
    before_count = cursor.execute(
        "SELECT COUNT(*) FROM competitor_posts WHERE brand_profile = ?",
        (profile_name,)
    ).fetchone()[0]

    # Build batch of row tuples
    rows = []
    for post in posts:
        engagement_rate = None
        if post.follower_count and post.follower_count > 0:
            total_engagement = (
                (post.likes or 0) + (post.comments or 0) +
                (post.saves or 0) + (post.shares or 0)
            )
            engagement_rate = total_engagement / post.follower_count

        rows.append((
            post.post_id, profile_name, post.platform,
            post.competitor_name, post.competitor_handle,
            post.posted_at.isoformat() if post.posted_at else None,
            post.caption, post.media_type, post.media_url,
            post.likes, post.comments, post.saves, post.shares,
            post.views, post.follower_count, engagement_rate, now,
            getattr(post, 'audio_id', None),
            getattr(post, 'audio_name', None),
        ))

    try:
        cursor.executemany("""
            INSERT OR IGNORE INTO competitor_posts
            (post_id, brand_profile, platform, competitor_name,
             competitor_handle, posted_at, caption, media_type,
             media_url, likes, comments, saves, shares, views,
             follower_count, estimated_engagement_rate, collected_at,
             audio_id, audio_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, rows)
        conn.commit()
    except sqlite3.Error as e:
        logger.error(f"DB batch insert error: {e}")
        conn.rollback()

    after_count = cursor.execute(
        "SELECT COUNT(*) FROM competitor_posts WHERE brand_profile = ?",
        (profile_name,)
    ).fetchone()[0]

    conn.close()
    return after_count - before_count


# ── RapidAPI Instagram Collector ──

class RapidAPIInstagramCollector(BaseCollector):
    """
    Fetches Instagram posts via RapidAPI Instagram scrapers.

    Uses the 'instagram-scraper-api2' endpoint (or similar).
    Free tier typically offers 100-500 requests/month.
    6 competitors * 1 request/day = ~180 requests/month.
    """

    API_HOST = "instagram-scraper-api2.p.rapidapi.com"
    BASE_URL = f"https://{API_HOST}/v1"

    def __init__(self, api_key: str):
        if not api_key:
            raise ValueError(
                "RAPIDAPI_KEY is required. Get one at https://rapidapi.com "
                "and subscribe to an Instagram scraper API."
            )
        self.api_key = api_key
        self.headers = {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": self.API_HOST,
        }

    def health_check(self) -> bool:
        """Test API connectivity."""
        try:
            resp = self._make_request("/info", {"username_or_id_or_url": "instagram"})
            return resp is not None
        except Exception as e:
            logger.error(f"RapidAPI health check failed: {e}")
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent posts for an Instagram handle."""
        logger.info(f"  Fetching posts for @{handle} via RapidAPI...")

        # First get profile info for follower count
        follower_count = self._get_follower_count(handle)

        # Fetch recent posts
        data = self._make_request("/posts", {
            "username_or_id_or_url": handle,
        })

        if not data:
            logger.warning(f"  No data returned for @{handle}")
            return []

        posts = self._parse_posts(data, handle, competitor_name,
                                  follower_count, count)
        logger.info(f"  Collected {len(posts)} posts from @{handle}")
        return posts

    def _get_follower_count(self, handle: str) -> Optional[int]:
        """Fetch follower count from profile info."""
        try:
            data = self._make_request("/info", {
                "username_or_id_or_url": handle,
            })
            if data and "data" in data:
                return data["data"].get("follower_count")
        except Exception as e:
            logger.warning(f"  Could not fetch follower count for @{handle}: {e}")
        return None

    def _make_request(self, endpoint: str, params: dict,
                      max_retries: int = 3) -> Optional[dict]:
        """Make an API request with retry logic and rate limit handling."""
        url = f"{self.BASE_URL}{endpoint}"

        for attempt in range(max_retries):
            try:
                resp = requests.get(url, headers=self.headers, params=params,
                                    timeout=30)

                if resp.status_code == 429:
                    wait = 2 ** (attempt + 1)
                    logger.warning(f"  Rate limited, waiting {wait}s...")
                    time.sleep(wait)
                    continue

                if resp.status_code == 200:
                    return resp.json()

                logger.error(
                    f"  API error {resp.status_code}: {resp.text[:200]}"
                )
                return None

            except requests.exceptions.Timeout:
                logger.warning(f"  Request timeout (attempt {attempt + 1})")
                time.sleep(2 ** attempt)
            except requests.exceptions.RequestException as e:
                logger.error(f"  Request failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)

        return None

    def _parse_posts(self, data: dict, handle: str, competitor_name: str,
                     follower_count: Optional[int],
                     limit: int) -> List[CollectedPost]:
        """Parse RapidAPI response into CollectedPost objects."""
        posts = []
        items = data.get("data", {}).get("items", [])

        for item in items[:limit]:
            try:
                # Parse timestamp
                posted_at = None
                ts = item.get("taken_at")
                if ts:
                    posted_at = datetime.fromtimestamp(ts, tz=timezone.utc)

                # Determine media type
                media_type = self._detect_media_type(item)

                # Extract caption text
                caption_data = item.get("caption") or {}
                caption = caption_data.get("text", "") if isinstance(caption_data, dict) else ""

                # Extract hashtags and mentions from caption
                hashtags = re.findall(r"#(\w+)", caption)
                mentions = re.findall(r"@(\w+)", caption)

                # Get media URL
                media_url = (
                    item.get("image_versions2", {}).get("candidates", [{}])[0].get("url")
                    or item.get("thumbnail_url")
                )

                # Extract audio info from Reels/clips
                audio_id = None
                audio_name = None
                music_meta = item.get("music_metadata") or {}
                music_info = music_meta.get("music_info") or {}
                if music_info:
                    audio_id = str(music_info.get("music_id", "")) or None
                    audio_name = music_info.get("title")
                if not audio_id:
                    # Try clips_metadata path
                    clips_meta = item.get("clips_metadata") or {}
                    original_sound = clips_meta.get("original_sound_info") or {}
                    if original_sound:
                        audio_id = str(original_sound.get("audio_asset_id", "")) or None
                        audio_name = audio_name or original_sound.get("original_audio_title")

                # saves: try extraction (usually null for competitor posts,
                # but may be present for own-channel via Graph API)
                saves_raw = item.get("save_count")

                post = CollectedPost(
                    post_id=item.get("code", item.get("pk", "")),
                    competitor_name=competitor_name,
                    competitor_handle=handle,
                    platform="instagram",
                    post_url=f"https://www.instagram.com/p/{item.get('code', '')}/",
                    media_type=media_type,
                    caption=caption,
                    likes=item.get("like_count", 0),
                    comments=item.get("comment_count", 0),
                    saves=saves_raw,
                    shares=item.get("reshare_count"),
                    views=item.get("play_count") or item.get("view_count"),
                    posted_at=posted_at,
                    media_url=media_url,
                    hashtags=hashtags,
                    mentioned_accounts=mentions,
                    follower_count=follower_count,
                    audio_id=audio_id,
                    audio_name=audio_name,
                )
                posts.append(post)

            except Exception as e:
                logger.warning(f"  Error parsing post: {e}")
                continue

        return posts

    def _detect_media_type(self, item: dict) -> str:
        """Determine post type from API response."""
        media_type = item.get("media_type", 0)
        product_type = item.get("product_type", "")

        if product_type == "clips":
            return "reel"
        elif media_type == 8:
            return "carousel"
        elif media_type == 2:
            return "video"
        else:
            return "image"


# ── Apify Instagram Collector ──

class ApifyInstagramCollector(BaseCollector):
    """
    Fallback data source using Apify Instagram Scraper.

    Cost: ~$5 per 1,000 results.
    6 competitors * 12 posts = ~72 posts/run.
    """

    BASE_URL = "https://api.apify.com/v2"
    ACTOR_ID = "shu8hvrXbJbY3Eb9W"  # apify/instagram-post-scraper

    def __init__(self, api_token: str):
        if not api_token:
            raise ValueError(
                "APIFY_API_TOKEN is required. Get one at https://apify.com"
            )
        self.api_token = api_token

    def health_check(self) -> bool:
        """Test Apify API access."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/acts/{self.ACTOR_ID}",
                params={"token": self.api_token},
                timeout=10,
            )
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"Apify health check failed: {e}")
            return False

    def collect_posts(self, handle: str, competitor_name: str,
                      count: int = 12) -> List[CollectedPost]:
        """Fetch recent posts via Apify actor."""
        import time
        start_time = time.time()
        logger.info(f"  Fetching posts for @{handle} via Apify...")

        run_input = {
            "directUrls": [f"https://www.instagram.com/{handle}/"],
            "resultsType": "posts",
            "resultsLimit": count,
            "searchType": "user",
            "searchLimit": 1
        }

        try:
            # Start the actor run
            logger.debug(f"  Starting Apify actor run for @{handle} (resultsLimit={count})...")
            actor_start = time.time()
            resp = requests.post(
                f"{self.BASE_URL}/acts/{self.ACTOR_ID}/runs",
                params={"token": self.api_token},
                json=run_input,
                timeout=30,
            )
            resp.raise_for_status()
            run_data = resp.json().get("data", {})
            run_id = run_data.get("id")
            actor_elapsed = time.time() - actor_start
            logger.debug(f"  Actor run started in {actor_elapsed:.1f}s, run_id: {run_id}")

            if not run_id:
                logger.error(f"  Failed to start Apify actor run for @{handle}")
                logger.error(f"  Response: {resp.text[:200]}")
                return []

            # Wait for the run to complete
            wait_start = time.time()
            dataset_items = self._wait_for_results(run_id, handle)
            wait_elapsed = time.time() - wait_start
            logger.info(f"  Apify wait time for @{handle}: {wait_elapsed:.1f}s")

            parse_start = time.time()
            posts = self._parse_apify_posts(dataset_items, handle,
                                            competitor_name, count)
            parse_elapsed = time.time() - parse_start
            total_elapsed = time.time() - start_time

            logger.info(
                f"  Collected {len(posts)} posts from @{handle} "
                f"(total: {total_elapsed:.1f}s, wait: {wait_elapsed:.1f}s, parse: {parse_elapsed:.1f}s)"
            )
            return posts

        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 401:
                logger.error(f"  Apify authentication failed for @{handle}: Invalid API token")
            elif e.response.status_code == 429:
                logger.error(f"  Apify rate limit exceeded for @{handle}")
            elif e.response.status_code == 404:
                logger.error(f"  Apify actor not found or account does not exist: @{handle}")
            else:
                logger.error(f"  Apify HTTP error {e.response.status_code} for @{handle}: {e}")
            return []
        except requests.exceptions.Timeout:
            logger.error(f"  Apify request timeout for @{handle} (30s)")
            return []
        except Exception as e:
            logger.error(f"  Apify collection failed for @{handle}: {type(e).__name__}: {e}")
            return []

    def _wait_for_results(self, run_id: str, handle: str,
                          timeout_seconds: int = 600) -> List[dict]:
        """Poll for actor run completion and return results."""
        start = time.time()
        logger.info(f"  Waiting for Apify results for @{handle}... (max {timeout_seconds}s)")

        while time.time() - start < timeout_seconds:
            try:
                resp = requests.get(
                    f"{self.BASE_URL}/actor-runs/{run_id}",
                    params={"token": self.api_token},
                    timeout=10,
                )
                run_info = resp.json().get("data", {})
                status = run_info.get("status")

                if status == "SUCCEEDED":
                    dataset_id = run_info.get("defaultDatasetId")
                    logger.info(f"  Apify run succeeded for @{handle}, fetching dataset...")
                    return self._fetch_dataset(dataset_id)
                elif status in ("FAILED", "ABORTED", "TIMED-OUT"):
                    error_msg = run_info.get("statusMessage", "No error details provided")
                    logger.error(f"  Apify run {status} for @{handle}: {error_msg}")
                    return []

                # Still running, wait and check again
                elapsed = int(time.time() - start)
                logger.debug(f"  Apify run for @{handle} still running... ({elapsed}s elapsed)")
                time.sleep(5)
            except Exception as e:
                logger.warning(f"  Error checking run status for @{handle}: {e}")
                time.sleep(5)

        logger.error(f"  Apify run timed out for @{handle} after {timeout_seconds}s")
        return []

    def _fetch_dataset(self, dataset_id: str) -> List[dict]:
        """Fetch results from completed actor run."""
        try:
            resp = requests.get(
                f"{self.BASE_URL}/datasets/{dataset_id}/items",
                params={"token": self.api_token, "format": "json"},
                timeout=30,
            )
            return resp.json()
        except Exception as e:
            logger.error(f"  Failed to fetch dataset: {e}")
            return []

    def _parse_apify_posts(self, items: List[dict], handle: str,
                           competitor_name: str,
                           limit: int) -> List[CollectedPost]:
        """Parse Apify response into CollectedPost objects."""
        posts = []

        for item in items[:limit]:
            try:
                posted_at = None
                ts = item.get("timestamp")
                if ts:
                    posted_at = datetime.fromisoformat(
                        ts.replace("Z", "+00:00")
                    )

                caption = item.get("caption", "") or ""
                hashtags = re.findall(r"#(\w+)", caption)
                mentions = re.findall(r"@(\w+)", caption)

                # Extract audio info from Apify response
                music_info = item.get("musicInfo") or {}
                audio_id = str(music_info.get("id", "")) or None
                audio_name = music_info.get("title") or music_info.get("name")

                post = CollectedPost(
                    post_id=item.get("shortCode", item.get("id", "")),
                    competitor_name=competitor_name,
                    competitor_handle=handle,
                    platform="instagram",
                    post_url=item.get("url", f"https://www.instagram.com/p/{item.get('shortCode', '')}/"),
                    media_type=item.get("type", "image").lower(),
                    caption=caption,
                    likes=item.get("likesCount", 0),
                    comments=item.get("commentsCount", 0),
                    saves=item.get("savesCount"),
                    shares=item.get("sharesCount"),
                    views=item.get("videoViewCount"),
                    posted_at=posted_at,
                    media_url=item.get("displayUrl"),
                    hashtags=hashtags,
                    mentioned_accounts=mentions,
                    follower_count=item.get("ownerFollowerCount"),
                    audio_id=audio_id,
                    audio_name=audio_name,
                )
                posts.append(post)
            except Exception as e:
                logger.warning(f"  Error parsing Apify post: {e}")
                continue

        return posts


# ── Factory ──

def create_collector(source: Optional[str] = None) -> BaseCollector:
    """
    Create the appropriate Instagram collector based on config.

    Args:
        source: "rapidapi" or "apify". Defaults to COLLECTION_SOURCE env var.

    Returns:
        An Instagram collector instance.
    """
    source = source or config.COLLECTION_SOURCE

    if source == "rapidapi":
        # Use get_api_key to check database first, then fall back to env var
        api_key = config.get_api_key('rapidapi')
        return RapidAPIInstagramCollector(api_key=api_key)
    elif source == "apify":
        return ApifyInstagramCollector(api_token=config.APIFY_API_TOKEN)
    else:
        raise ValueError(
            f"Unknown collection source: '{source}'. Use 'rapidapi' or 'apify'."
        )
