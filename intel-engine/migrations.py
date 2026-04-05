"""
Database migrations for the Domain Intelligence Engine.
Safe to run multiple times (idempotent).
"""

import sqlite3
import logging
import os
from pathlib import Path
import config

logger = logging.getLogger(__name__)


def run_migrations(db_path=None):
    """Create all tables. Safe to call multiple times."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))

    logger.info("Running Domain Intelligence Engine migrations...")

    conn.executescript("""
        -- API credentials
        CREATE TABLE IF NOT EXISTS api_credentials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            service TEXT UNIQUE NOT NULL,
            api_key TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Users
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            display_name TEXT,
            created_at TEXT NOT NULL
        );

        -- Knowledge domains (hierarchical)
        CREATE TABLE IF NOT EXISTS domains (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL COLLATE NOCASE,
            description TEXT,
            icon TEXT DEFAULT '📚',
            source_count INTEGER DEFAULT 0,
            insight_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        -- Ingested sources
        CREATE TABLE IF NOT EXISTS sources (
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
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL
        );

        -- Extracted insights
        CREATE TABLE IF NOT EXISTS insights (
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
            FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
        );

        -- Synthesized domain knowledge
        CREATE TABLE IF NOT EXISTS syntheses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            source_count INTEGER DEFAULT 0,
            insight_count INTEGER DEFAULT 0,
            version INTEGER DEFAULT 1,
            created_at TEXT NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
        );

        -- Usage tracking
        CREATE TABLE IF NOT EXISTS usage_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            service TEXT NOT NULL,
            action TEXT NOT NULL,
            tokens_in INTEGER DEFAULT 0,
            tokens_out INTEGER DEFAULT 0,
            estimated_cost REAL DEFAULT 0,
            created_at TEXT NOT NULL
        );

        -- General config
        CREATE TABLE IF NOT EXISTS app_config (
            key TEXT PRIMARY KEY,
            value TEXT
        );

        -- Indexes (only on columns defined in CREATE TABLE above)
        CREATE INDEX IF NOT EXISTS idx_sources_domain ON sources(domain_id);
        CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
        CREATE INDEX IF NOT EXISTS idx_insights_domain ON insights(domain_id);
        CREATE INDEX IF NOT EXISTS idx_insights_source ON insights(source_id);
        CREATE INDEX IF NOT EXISTS idx_syntheses_domain ON syntheses(domain_id, version DESC);
        CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_logs(user_id, created_at);
    """)

    # Schema evolution — add columns for multi-source support
    _add_column(conn, "sources", "source_type", "TEXT DEFAULT 'youtube'")
    _add_column(conn, "sources", "file_path", "TEXT")
    _add_column(conn, "sources", "original_filename", "TEXT")

    # Schema evolution — domain hierarchy
    _add_column(conn, "domains", "parent_id", "INTEGER")
    _add_column(conn, "domains", "level", "INTEGER DEFAULT 0")
    _add_column(conn, "domains", "path", "TEXT")

    # Schema evolution — user ownership
    _add_column(conn, "domains", "user_id", "INTEGER")
    _add_column(conn, "sources", "user_id", "INTEGER")

    # Indexes on columns added via ALTER TABLE (must come after _add_column)
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_domains_parent ON domains(parent_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_domains_user ON domains(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id)")
    except sqlite3.OperationalError:
        pass

    # Schema evolution — vector embeddings for RAG
    _add_column(conn, "insights", "embedding", "TEXT")

    # Schema evolution — visual generation + suggested questions
    _add_column(conn, "syntheses", "visual_html", "TEXT")
    _add_column(conn, "syntheses", "suggested_questions", "TEXT")

    conn.commit()

    # FTS5 virtual table for keyword search (separate from executescript)
    _create_fts5(conn)

    conn.close()
    logger.info("Migrations complete")


def _create_fts5(conn):
    """Create FTS5 virtual table and sync triggers for keyword search."""
    try:
        conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS insights_fts USING fts5(
                title, content, content=insights, content_rowid=id
            )
        """)
        # Triggers to keep FTS in sync
        conn.executescript("""
            CREATE TRIGGER IF NOT EXISTS insights_fts_insert AFTER INSERT ON insights BEGIN
                INSERT INTO insights_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
            END;
            CREATE TRIGGER IF NOT EXISTS insights_fts_delete AFTER DELETE ON insights BEGIN
                INSERT INTO insights_fts(insights_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
            END;
            CREATE TRIGGER IF NOT EXISTS insights_fts_update AFTER UPDATE ON insights BEGIN
                INSERT INTO insights_fts(insights_fts, rowid, title, content) VALUES('delete', old.id, old.title, old.content);
                INSERT INTO insights_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
            END;
        """)
        conn.commit()
        # Backfill FTS for any existing insights not yet indexed
        conn.execute("""
            INSERT OR IGNORE INTO insights_fts(rowid, title, content)
            SELECT id, title, content FROM insights
        """)
        conn.commit()
    except sqlite3.OperationalError as e:
        logger.warning(f"FTS5 setup: {e}")


def _add_column(conn, table: str, column: str, definition: str):
    """Add a column if it doesn't exist (SQLite has no IF NOT EXISTS for ALTER)."""
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        logger.info(f"Added column {table}.{column}")
    except sqlite3.OperationalError as e:
        if "duplicate column" not in str(e).lower():
            raise


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_migrations()
    print("✓ Migrations complete")
