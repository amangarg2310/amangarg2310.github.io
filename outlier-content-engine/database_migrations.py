"""
Database migrations for Vertical Management System.

Adds tables for verticals, vertical_brands, api_credentials, and email_subscriptions.
Safe to run multiple times (idempotent).
"""

import os
import sqlite3
import logging
from pathlib import Path
import config

logger = logging.getLogger(__name__)


def run_vertical_migrations(db_path=None):
    """
    Add vertical management tables to the database.
    Safe to call multiple times - only creates tables if they don't exist.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Running vertical management migrations...")

    # Create new tables
    conn.executescript("""
        -- API credentials (admin-managed)
        CREATE TABLE IF NOT EXISTS api_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT UNIQUE NOT NULL,  -- 'apify', 'openai'
            api_key TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Verticals (user-created categories)
        CREATE TABLE IF NOT EXISTS verticals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,  -- 'Streetwear', 'Luxury Fashion'
            description TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Brands within verticals
        CREATE TABLE IF NOT EXISTS vertical_brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vertical_name TEXT NOT NULL,
            brand_name TEXT,  -- optional display name
            instagram_handle TEXT,  -- nullable for TikTok/FB-only brands
            tiktok_handle TEXT,
            added_at TEXT NOT NULL,
            FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE
        );

        -- Email subscriptions (team members)
        CREATE TABLE IF NOT EXISTS email_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vertical_name TEXT,  -- NULL = all verticals
            email TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE SET NULL
        );

        -- General app configuration (key-value store)
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- Competitor posts (main data table)
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
            is_own_channel INTEGER DEFAULT 0,
            audio_id TEXT,
            audio_name TEXT,
            is_trending_audio INTEGER DEFAULT 0,
            weighted_engagement_score REAL,
            primary_engagement_driver TEXT,
            outlier_timeframe TEXT,
            ai_analysis TEXT,
            archived INTEGER DEFAULT 0,
            UNIQUE(post_id, platform, brand_profile)
        );

        -- Index for faster vertical lookups
        CREATE INDEX IF NOT EXISTS idx_vertical_brands_vertical
            ON vertical_brands(vertical_name);
        CREATE INDEX IF NOT EXISTS idx_email_subs_vertical
            ON email_subscriptions(vertical_name);
        CREATE INDEX IF NOT EXISTS idx_posts_competitor_date
            ON competitor_posts(competitor_handle, collected_at);
        CREATE INDEX IF NOT EXISTS idx_posts_outlier
            ON competitor_posts(is_outlier);
        CREATE INDEX IF NOT EXISTS idx_posts_profile
            ON competitor_posts(brand_profile);
        CREATE INDEX IF NOT EXISTS idx_posts_own_channel
            ON competitor_posts(is_own_channel);
        CREATE INDEX IF NOT EXISTS idx_posts_audio
            ON competitor_posts(audio_id);
        CREATE INDEX IF NOT EXISTS idx_posts_archived
            ON competitor_posts(archived);
    """)

    conn.commit()
    conn.close()

    logger.info("Vertical management migrations complete")


def seed_api_keys_from_env(db_path=None):
    """
    One-time migration: Move API keys from .env to database.
    Only runs if database has no API keys yet.
    """
    from datetime import datetime, timezone

    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    # Check if API keys already exist
    existing = conn.execute("SELECT COUNT(*) FROM api_credentials").fetchone()[0]
    if existing > 0:
        logger.info("API keys already in database, skipping seed")
        conn.close()
        return

    logger.info("Seeding API keys from environment variables...")
    now = datetime.now(timezone.utc).isoformat()

    # Migrate keys if they exist in env
    apify_token = os.getenv("APIFY_API_TOKEN")
    if apify_token:
        conn.execute("""
            INSERT INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('apify', ?, ?, ?)
        """, (apify_token, now, now))
        logger.info("  Migrated APIFY_API_TOKEN")

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        conn.execute("""
            INSERT INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('openai', ?, ?, ?)
        """, (openai_key, now, now))
        logger.info("  Migrated OPENAI_API_KEY")

    conn.commit()
    conn.close()
    logger.info("API key seeding complete")


def add_archived_column_to_posts(db_path=None):
    """
    Add archived column to competitor_posts table for soft delete functionality.
    Safe to call multiple times.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Adding archived column to competitor_posts...")

    try:
        # Try to add the column
        conn.execute("""
            ALTER TABLE competitor_posts
            ADD COLUMN archived INTEGER DEFAULT 0
        """)
        conn.commit()
        logger.info("  Added archived column")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            logger.info("  archived column already exists, skipping")
        else:
            raise

    # Create index for faster filtering
    try:
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_posts_archived
            ON competitor_posts(archived)
        """)
        conn.commit()
        logger.info("  Created index on archived column")
    except Exception as e:
        logger.warning(f"  Failed to create index: {e}")

    conn.close()
    logger.info("archived column migration complete")


def add_facebook_handle_column(db_path=None):
    """
    Add facebook_handle column to vertical_brands table.
    Safe to call multiple times.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    try:
        conn.execute("""
            ALTER TABLE vertical_brands
            ADD COLUMN facebook_handle TEXT
        """)
        conn.commit()
        logger.info("  Added facebook_handle column to vertical_brands")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            logger.info("  facebook_handle column already exists, skipping")
        else:
            raise
    finally:
        conn.close()


def fix_post_unique_constraint(db_path=None):
    """
    Fix UNIQUE(post_id, platform) → UNIQUE(post_id, platform, brand_profile).

    The old constraint caused INSERT OR IGNORE to silently skip posts when
    the same handle appeared in multiple verticals/profiles. Adding
    brand_profile to the unique key isolates data per vertical.

    Safe to call multiple times — checks the schema first.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    # Check if migration is needed by inspecting the CREATE TABLE statement
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='competitor_posts'"
    ).fetchone()

    if not row:
        logger.info("  competitor_posts table does not exist yet, skipping unique constraint fix")
        conn.close()
        return

    create_sql = row[0]
    # If brand_profile is already in the unique constraint, skip
    if "UNIQUE(post_id,platform,brand_profile)" in create_sql.replace(" ", ""):
        logger.info("  competitor_posts already has 3-column unique constraint, skipping")
        conn.close()
        return

    logger.info("Fixing competitor_posts UNIQUE constraint to include brand_profile...")

    try:
        conn.executescript("""
            -- Rebuild table with corrected unique constraint
            CREATE TABLE IF NOT EXISTS competitor_posts_new (
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
                is_own_channel INTEGER DEFAULT 0,
                audio_id TEXT,
                audio_name TEXT,
                is_trending_audio INTEGER DEFAULT 0,
                weighted_engagement_score REAL,
                primary_engagement_driver TEXT,
                outlier_timeframe TEXT,
                ai_analysis TEXT,
                archived INTEGER DEFAULT 0,
                UNIQUE(post_id, platform, brand_profile)
            );

            -- Copy all existing data
            INSERT OR IGNORE INTO competitor_posts_new
                SELECT id, post_id, brand_profile, platform, competitor_name,
                       competitor_handle, posted_at, caption, media_type, media_url,
                       likes, comments, saves, shares, views, follower_count,
                       estimated_engagement_rate, is_outlier, outlier_score,
                       content_tags, collected_at,
                       COALESCE(is_own_channel, 0),
                       audio_id, audio_name,
                       COALESCE(is_trending_audio, 0),
                       weighted_engagement_score, primary_engagement_driver,
                       outlier_timeframe, ai_analysis,
                       COALESCE(archived, 0)
                FROM competitor_posts;

            -- Swap tables
            DROP TABLE competitor_posts;
            ALTER TABLE competitor_posts_new RENAME TO competitor_posts;

            -- Recreate indexes
            CREATE INDEX IF NOT EXISTS idx_posts_competitor_date
                ON competitor_posts(competitor_handle, collected_at);
            CREATE INDEX IF NOT EXISTS idx_posts_outlier
                ON competitor_posts(is_outlier);
            CREATE INDEX IF NOT EXISTS idx_posts_profile
                ON competitor_posts(brand_profile);
            CREATE INDEX IF NOT EXISTS idx_posts_own_channel
                ON competitor_posts(is_own_channel);
            CREATE INDEX IF NOT EXISTS idx_posts_audio
                ON competitor_posts(audio_id);
            CREATE INDEX IF NOT EXISTS idx_posts_archived
                ON competitor_posts(archived);
        """)
        logger.info("  competitor_posts UNIQUE constraint updated successfully")
    except Exception as e:
        logger.error(f"  Failed to fix unique constraint: {e}")
        conn.rollback()

    conn.close()


def fix_vertical_brands_nullable(db_path=None):
    """
    Make instagram_handle nullable in vertical_brands so TikTok/FB-only brands can exist.
    Also drops the old UNIQUE(vertical_name, instagram_handle) constraint since NULL
    instagram_handle would cause issues with it.
    Safe to call multiple times — checks schema first.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='vertical_brands'"
    ).fetchone()

    if not row:
        conn.close()
        return

    create_sql = row[0]
    # If instagram_handle is already nullable (NOT NULL not present), skip
    if "instagram_handle TEXT," in create_sql or "instagram_handleTEXT," in create_sql.replace(" ", ""):
        logger.info("  vertical_brands.instagram_handle already nullable, skipping")
        conn.close()
        return

    # Only migrate if NOT NULL is present
    if "NOT NULL" not in create_sql.split("instagram_handle")[1].split(",")[0]:
        logger.info("  vertical_brands.instagram_handle already nullable, skipping")
        conn.close()
        return

    logger.info("Making vertical_brands.instagram_handle nullable...")

    try:
        # Check if facebook_handle column exists
        cols = [info[1] for info in conn.execute("PRAGMA table_info(vertical_brands)").fetchall()]
        has_facebook = "facebook_handle" in cols

        if has_facebook:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS vertical_brands_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vertical_name TEXT NOT NULL,
                    brand_name TEXT,
                    instagram_handle TEXT,
                    tiktok_handle TEXT,
                    facebook_handle TEXT,
                    added_at TEXT NOT NULL,
                    FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE
                );
                INSERT OR IGNORE INTO vertical_brands_new
                    SELECT id, vertical_name, brand_name, instagram_handle,
                           tiktok_handle, facebook_handle, added_at
                    FROM vertical_brands;
                DROP TABLE vertical_brands;
                ALTER TABLE vertical_brands_new RENAME TO vertical_brands;
            """)
        else:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS vertical_brands_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    vertical_name TEXT NOT NULL,
                    brand_name TEXT,
                    instagram_handle TEXT,
                    tiktok_handle TEXT,
                    added_at TEXT NOT NULL,
                    FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE
                );
                INSERT OR IGNORE INTO vertical_brands_new
                    SELECT id, vertical_name, brand_name, instagram_handle,
                           tiktok_handle, added_at
                    FROM vertical_brands;
                DROP TABLE vertical_brands;
                ALTER TABLE vertical_brands_new RENAME TO vertical_brands;
            """)
        logger.info("  vertical_brands.instagram_handle is now nullable")
    except Exception as e:
        logger.error(f"  Failed to fix vertical_brands schema: {e}")

    conn.close()


def add_scoring_tables(db_path=None):
    """
    Add tables for content scoring, trend tracking, and gap analysis.
    Safe to call multiple times (CREATE IF NOT EXISTS).
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Running scoring system migrations...")

    conn.executescript("""
        -- Periodic pattern frequency snapshots for trend detection
        CREATE TABLE IF NOT EXISTS trend_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            snapshot_data TEXT NOT NULL,
            outlier_count INTEGER DEFAULT 0,
            avg_outlier_score REAL,
            created_at TEXT NOT NULL,
            UNIQUE(brand_profile, snapshot_date)
        );

        CREATE INDEX IF NOT EXISTS idx_trend_snapshots_profile_date
            ON trend_snapshots(brand_profile, snapshot_date);

        -- Scored content concepts (iteration chain via parent_score_id)
        CREATE TABLE IF NOT EXISTS content_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            concept_text TEXT NOT NULL,
            hook_line TEXT,
            format_choice TEXT,
            platform TEXT,
            score_data TEXT NOT NULL,
            overall_score REAL NOT NULL,
            predicted_engagement_range TEXT,
            optimization_suggestions TEXT,
            version INTEGER DEFAULT 1,
            parent_score_id INTEGER,
            scored_at TEXT NOT NULL,
            FOREIGN KEY (parent_score_id) REFERENCES content_scores(id)
        );

        CREATE INDEX IF NOT EXISTS idx_content_scores_profile
            ON content_scores(brand_profile, scored_at DESC);

        -- Cache for own-brand gap analysis (24h TTL)
        CREATE TABLE IF NOT EXISTS gap_analysis_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            computed_at TEXT NOT NULL,
            gap_data TEXT NOT NULL,
            own_post_count INTEGER,
            competitor_outlier_count INTEGER,
            UNIQUE(brand_profile)
        );
    """)

    conn.commit()
    conn.close()
    logger.info("Scoring system migrations complete")


def add_users_table(db_path=None):
    """
    Add users table for Google OAuth authentication.
    Safe to call multiple times (CREATE IF NOT EXISTS).
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            google_id TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            name TEXT,
            picture TEXT,
            created_at TEXT NOT NULL,
            last_login TEXT NOT NULL
        )
    """)

    conn.commit()
    conn.close()
    logger.info("Users table migration complete")


def add_trend_radar_tables(db_path=None):
    """
    Add trend_radar_snapshots table for velocity-based trend detection.
    Safe to call multiple times (CREATE IF NOT EXISTS).
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Running trend radar migrations...")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS trend_radar_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_profile TEXT NOT NULL,
            snapshot_timestamp TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_id TEXT NOT NULL,
            item_name TEXT,
            usage_count INTEGER NOT NULL DEFAULT 0,
            outlier_count INTEGER NOT NULL DEFAULT 0,
            total_engagement INTEGER DEFAULT 0,
            avg_engagement REAL DEFAULT 0,
            top_post_id TEXT,
            collected_at TEXT NOT NULL,
            UNIQUE(brand_profile, snapshot_timestamp, item_type, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_trend_radar_profile_ts
            ON trend_radar_snapshots(brand_profile, snapshot_timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_trend_radar_item
            ON trend_radar_snapshots(item_type, item_id, brand_profile);
    """)

    conn.commit()
    conn.close()
    logger.info("Trend radar migrations complete")


def add_vertical_brands_unique_index(db_path=None):
    """
    Add a unique index on vertical_brands to prevent duplicate brand entries.
    Uses case-insensitive partial unique indexes so "Streetwear"/"streetwear" are treated
    as the same vertical. Safe to call multiple times.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Adding unique indexes to vertical_brands...")

    # Remove any existing duplicate rows before creating unique index
    # Use LOWER() for case-insensitive dedup
    try:
        conn.execute("""
            DELETE FROM vertical_brands
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM vertical_brands
                GROUP BY LOWER(vertical_name), LOWER(COALESCE(instagram_handle, '')), LOWER(COALESCE(tiktok_handle, ''))
            )
        """)
        dupes_removed = conn.total_changes
        if dupes_removed > 0:
            logger.info(f"  Removed {dupes_removed} duplicate brand entries")
        conn.commit()
    except Exception as e:
        logger.warning(f"  Dedup cleanup failed (non-critical): {e}")

    # Drop old case-sensitive indexes if they exist, then create case-insensitive ones
    for idx_name in ['idx_vertical_brands_ig_unique', 'idx_vertical_brands_tt_unique']:
        try:
            conn.execute(f"DROP INDEX IF EXISTS {idx_name}")
            conn.commit()
        except Exception:
            pass

    # Create case-insensitive unique index for Instagram handles
    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_vertical_brands_ig_unique
            ON vertical_brands(vertical_name COLLATE NOCASE, instagram_handle COLLATE NOCASE)
            WHERE instagram_handle IS NOT NULL
        """)
        conn.commit()
        logger.info("  Created case-insensitive unique index on (vertical_name, instagram_handle)")
    except sqlite3.OperationalError as e:
        if "already exists" in str(e).lower():
            logger.info("  Instagram unique index already exists")
        else:
            logger.warning(f"  Failed to create IG unique index: {e}")

    # Create case-insensitive unique index for TikTok handles
    try:
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_vertical_brands_tt_unique
            ON vertical_brands(vertical_name COLLATE NOCASE, tiktok_handle COLLATE NOCASE)
            WHERE tiktok_handle IS NOT NULL
        """)
        conn.commit()
        logger.info("  Created case-insensitive unique index on (vertical_name, tiktok_handle)")
    except sqlite3.OperationalError as e:
        if "already exists" in str(e).lower():
            logger.info("  TikTok unique index already exists")
        else:
            logger.warning(f"  Failed to create TT unique index: {e}")

    conn.close()
    logger.info("Vertical brands unique index migration complete")


def consolidate_vertical_name_casing(db_path=None):
    """
    Merge verticals that differ only by casing (e.g. 'streetwear' + 'Streetwear').
    Keeps the most recently updated entry, migrates all brands and posts to it,
    and deletes the duplicates. Safe to call multiple times.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    logger.info("Checking for case-variant vertical duplicates...")

    # Find groups of verticals that differ only by casing
    groups = conn.execute("""
        SELECT LOWER(name) as lower_name, COUNT(*) as cnt
        FROM verticals
        GROUP BY LOWER(name)
        HAVING COUNT(*) > 1
    """).fetchall()

    if not groups:
        conn.close()
        logger.info("  No case-variant duplicates found")
        return

    for group in groups:
        lower_name = group['lower_name']

        # Get all variants, keep the most recently updated one
        variants = conn.execute("""
            SELECT name, updated_at FROM verticals
            WHERE LOWER(name) = ?
            ORDER BY updated_at DESC
        """, (lower_name,)).fetchall()

        keep_name = variants[0]['name']
        drop_names = [v['name'] for v in variants[1:]]

        logger.info(f"  Consolidating: keeping '{keep_name}', merging {drop_names}")

        for drop_name in drop_names:
            # Move brands to the kept vertical name
            conn.execute("""
                UPDATE vertical_brands SET vertical_name = ?
                WHERE vertical_name = ? AND vertical_name != ?
            """, (keep_name, drop_name, keep_name))

            # Move posts to the kept vertical name
            conn.execute("""
                UPDATE competitor_posts SET brand_profile = ?
                WHERE brand_profile = ? AND brand_profile != ?
            """, (keep_name, drop_name, keep_name))

            # Delete the duplicate vertical row
            conn.execute("DELETE FROM verticals WHERE name = ?", (drop_name,))

            logger.info(f"    Merged '{drop_name}' → '{keep_name}'")

    conn.commit()
    conn.close()

    # Re-run unique index dedup since merging may have created duplicates in vertical_brands
    add_vertical_brands_unique_index(db_path)
    logger.info("Vertical name consolidation complete")


if __name__ == "__main__":
    # Run all migrations
    logging.basicConfig(level=logging.INFO)

    run_vertical_migrations()
    add_facebook_handle_column()
    fix_post_unique_constraint()
    add_scoring_tables()
    add_users_table()
    add_trend_radar_tables()
    add_vertical_brands_unique_index()
    consolidate_vertical_name_casing()
    seed_api_keys_from_env()

    print("✓ Migrations complete")
