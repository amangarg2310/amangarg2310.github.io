"""
Database migrations for the Domain Intelligence Engine.

Adds tables for domains, youtube_sources, domain_insights, and domain_syntheses.
Safe to run multiple times (idempotent).
"""

import sqlite3
import logging
from pathlib import Path
import config

logger = logging.getLogger(__name__)


def run_intel_migrations(db_path=None):
    """Create Domain Intelligence Engine tables. Safe to call multiple times."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Running Domain Intelligence Engine migrations...")

    conn.executescript("""
        -- Knowledge domains (auto-created from video content)
        CREATE TABLE IF NOT EXISTS intel_domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL COLLATE NOCASE,
            description TEXT,
            icon TEXT DEFAULT '📚',
            source_count INTEGER DEFAULT 0,
            insight_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Ingested YouTube videos
        CREATE TABLE IF NOT EXISTS intel_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT UNIQUE NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            channel TEXT,
            thumbnail TEXT,
            duration_seconds INTEGER,
            transcript TEXT,
            domain_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_at TEXT NOT NULL,
            processed_at TEXT,
            FOREIGN KEY (domain_id) REFERENCES intel_domains(id) ON DELETE SET NULL
        );

        -- Extracted insights from video transcripts
        CREATE TABLE IF NOT EXISTS intel_insights (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_id INTEGER NOT NULL,
            domain_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            insight_type TEXT DEFAULT 'general',
            actionability TEXT DEFAULT 'medium',
            key_quotes TEXT,
            chunk_index INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (source_id) REFERENCES intel_sources(id) ON DELETE CASCADE,
            FOREIGN KEY (domain_id) REFERENCES intel_domains(id) ON DELETE CASCADE
        );

        -- Synthesized domain knowledge (compounds over time)
        CREATE TABLE IF NOT EXISTS intel_syntheses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            source_count INTEGER DEFAULT 0,
            insight_count INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES intel_domains(id) ON DELETE CASCADE
        );

        -- Chat history for domain queries
        CREATE TABLE IF NOT EXISTS intel_chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES intel_domains(id) ON DELETE CASCADE
        );

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_intel_sources_domain
            ON intel_sources(domain_id);
        CREATE INDEX IF NOT EXISTS idx_intel_sources_status
            ON intel_sources(status);
        CREATE INDEX IF NOT EXISTS idx_intel_insights_domain
            ON intel_insights(domain_id);
        CREATE INDEX IF NOT EXISTS idx_intel_insights_source
            ON intel_insights(source_id);
        CREATE INDEX IF NOT EXISTS idx_intel_syntheses_domain
            ON intel_syntheses(domain_id, version DESC);
    """)

    conn.commit()
    conn.close()
    logger.info("Domain Intelligence Engine migrations complete")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_intel_migrations()
    print("✓ Intel migrations complete")
