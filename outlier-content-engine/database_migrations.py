"""
Database migrations for Vertical Management System.

Adds tables for verticals, vertical_brands, api_credentials, and email_subscriptions.
Safe to run multiple times (idempotent).
"""

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
            service TEXT UNIQUE NOT NULL,  -- 'rapidapi', 'openai', 'tiktok'
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
            instagram_handle TEXT NOT NULL,
            tiktok_handle TEXT,
            added_at TEXT NOT NULL,
            FOREIGN KEY (vertical_name) REFERENCES verticals(name) ON DELETE CASCADE,
            UNIQUE(vertical_name, instagram_handle)
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

        -- Index for faster vertical lookups
        CREATE INDEX IF NOT EXISTS idx_vertical_brands_vertical
            ON vertical_brands(vertical_name);
        CREATE INDEX IF NOT EXISTS idx_email_subs_vertical
            ON email_subscriptions(vertical_name);
    """)

    conn.commit()
    conn.close()

    logger.info("Vertical management migrations complete")


def migrate_profile_to_vertical(profile_name: str, db_path=None):
    """
    Migrate an existing YAML profile to the vertical system.
    Reads profile YAML and creates corresponding vertical + brands.
    """
    from profile_loader import load_profile
    from datetime import datetime, timezone

    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    try:
        profile = load_profile(profile_name)
        logger.info(f"Migrating profile '{profile_name}' to vertical...")

        # Create vertical
        now = datetime.now(timezone.utc).isoformat()
        conn.execute("""
            INSERT OR IGNORE INTO verticals (name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?)
        """, (
            profile.name,
            f"{profile.vertical} - Migrated from profile",
            now,
            now
        ))

        # Add all competitors as brands
        for comp in profile.competitors:
            instagram = comp.handles.get('instagram')
            tiktok = comp.handles.get('tiktok')

            if instagram:
                conn.execute("""
                    INSERT OR IGNORE INTO vertical_brands
                    (vertical_name, brand_name, instagram_handle, tiktok_handle, added_at)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    profile.name,
                    comp.name,
                    instagram,
                    tiktok,
                    now
                ))

        conn.commit()
        logger.info(f"Successfully migrated '{profile_name}' with {len(profile.competitors)} brands")

    except Exception as e:
        logger.error(f"Failed to migrate profile '{profile_name}': {e}")
        conn.rollback()
    finally:
        conn.close()


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
    if config.RAPIDAPI_KEY:
        conn.execute("""
            INSERT INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('rapidapi', ?, ?, ?)
        """, (config.RAPIDAPI_KEY, now, now))
        logger.info("  Migrated RAPIDAPI_KEY")

    if config.OPENAI_API_KEY:
        conn.execute("""
            INSERT INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('openai', ?, ?, ?)
        """, (config.OPENAI_API_KEY, now, now))
        logger.info("  Migrated OPENAI_API_KEY")

    if config.TIKTOK_RAPIDAPI_KEY and config.TIKTOK_RAPIDAPI_KEY != config.RAPIDAPI_KEY:
        conn.execute("""
            INSERT INTO api_credentials (service, api_key, created_at, updated_at)
            VALUES ('tiktok', ?, ?, ?)
        """, (config.TIKTOK_RAPIDAPI_KEY, now, now))
        logger.info("  Migrated TIKTOK_RAPIDAPI_KEY")

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
    if "UNIQUE(post_id, platform, brand_profile)" in create_sql.replace(" ", ""):
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


if __name__ == "__main__":
    # Run all migrations
    logging.basicConfig(level=logging.INFO)

    run_vertical_migrations()
    add_facebook_handle_column()
    fix_post_unique_constraint()
    seed_api_keys_from_env()

    # Optionally migrate existing profile
    import sys
    if len(sys.argv) > 1:
        profile_name = sys.argv[1]
        migrate_profile_to_vertical(profile_name)

    print("✓ Migrations complete")
