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

    # Schema evolution — cross-domain references for knowledge graph
    conn.execute("""
        CREATE TABLE IF NOT EXISTS domain_references (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
            target_domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
            relationship TEXT,
            confidence REAL DEFAULT 1.0,
            detected_from TEXT DEFAULT 'synthesis',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(source_domain_id, target_domain_id)
        )
    """)
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_domain_refs_source ON domain_references(source_domain_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_domain_refs_target ON domain_references(target_domain_id)")
    except sqlite3.OperationalError:
        pass

    # Drop any unique index on domains.name (hierarchy allows same name at different levels)
    try:
        # Find and drop unique indexes on domains.name
        indexes = conn.execute("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='domains'").fetchall()
        for idx in indexes:
            idx_name = idx[0]
            # Check if it's a unique index on name column by trying to find it
            idx_info = conn.execute(f"PRAGMA index_info('{idx_name}')").fetchall()
            col_info = conn.execute(f"PRAGMA index_list('domains')").fetchall()
            for ci in col_info:
                if ci[1] == idx_name and ci[2] == 1:  # ci[2]=1 means unique
                    conn.execute(f"DROP INDEX IF EXISTS {idx_name}")
                    logger.info(f"Dropped unique index {idx_name} on domains")
                    break
    except sqlite3.OperationalError:
        pass

    # Schema evolution — structured claim extraction (Tier 1A)
    _add_column(conn, "insights", "evidence", "TEXT")
    _add_column(conn, "insights", "source_context", "TEXT")
    _add_column(conn, "insights", "confidence", "TEXT DEFAULT 'stated'")
    _add_column(conn, "insights", "topics", "TEXT")  # JSON array

    # Schema evolution — hierarchical synthesis levels (Tier 2A)
    _add_column(conn, "syntheses", "synthesis_level", "TEXT DEFAULT 'sub_topic'")

    # Schema evolution — cross-source convergence analysis (Tier 3C)
    _add_column(conn, "syntheses", "convergence_data", "TEXT")

    # Schema evolution — ingestion impact tracking (Tier 4B)
    _add_column(conn, "sources", "ingestion_impact", "TEXT")

    # Schema evolution — synthesis version history (Tier 4A)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS synthesis_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synthesis_id INTEGER NOT NULL,
            domain_id INTEGER NOT NULL,
            version_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            convergence_data TEXT,
            source_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (synthesis_id) REFERENCES syntheses(id) ON DELETE CASCADE,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
        )
    """)
    try:
        conn.execute("CREATE INDEX IF NOT EXISTS idx_synth_versions_domain ON synthesis_versions(domain_id, version_number DESC)")
    except sqlite3.OperationalError:
        pass

    # Schema evolution — taxonomy change tracking (Tier 3A/3B)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS taxonomy_changes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER NOT NULL,
            change_type TEXT NOT NULL,
            description TEXT NOT NULL,
            user_id INTEGER,
            dismissed INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
        )
    """)

    # Schema evolution — playbooks
    conn.execute("""
        CREATE TABLE IF NOT EXISTS playbooks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain_id INTEGER NOT NULL,
            user_id INTEGER,
            goal TEXT,
            experience TEXT,
            format_type TEXT,
            constraints TEXT,
            content TEXT NOT NULL,
            source_count INTEGER DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE CASCADE
        )
    """)

    # Deduplicate domains — parallel playlist ingestion could create duplicate
    # level-0/level-1 entries with the same (name, level, user_id). Keep the
    # lowest-id row, re-point children and sources to it, then delete extras.
    _deduplicate_domains(conn)

    # One-time taxonomy consolidation and icon refresh
    _consolidate_taxonomy(conn)
    _refresh_domain_icons(conn)

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


def _deduplicate_domains(conn):
    """Merge duplicate domains created by parallel playlist ingestion.

    Keeps the lowest-id row for each (name, level, user_id) group,
    re-points child domains and sources to the kept row, then deletes extras.
    """
    try:
        dupes = conn.execute("""
            SELECT name, level, user_id, MIN(id) as keep_id, GROUP_CONCAT(id) as all_ids, COUNT(*) as cnt
            FROM domains
            GROUP BY name COLLATE NOCASE, level, user_id
            HAVING cnt > 1
        """).fetchall()

        for row in dupes:
            keep_id = row[3]  # MIN(id)
            all_ids = [int(x) for x in row[4].split(',')]
            remove_ids = [x for x in all_ids if x != keep_id]
            if not remove_ids:
                continue

            placeholders = ','.join('?' * len(remove_ids))

            # Re-point child domains (parent_id) to the kept row
            conn.execute(
                f"UPDATE domains SET parent_id = ? WHERE parent_id IN ({placeholders})",
                [keep_id] + remove_ids,
            )
            # Re-point sources to the kept row
            conn.execute(
                f"UPDATE sources SET domain_id = ? WHERE domain_id IN ({placeholders})",
                [keep_id] + remove_ids,
            )
            # Re-point insights to the kept row
            conn.execute(
                f"UPDATE insights SET domain_id = ? WHERE domain_id IN ({placeholders})",
                [keep_id] + remove_ids,
            )
            # Re-point syntheses to the kept row
            conn.execute(
                f"UPDATE syntheses SET domain_id = ? WHERE domain_id IN ({placeholders})",
                [keep_id] + remove_ids,
            )
            # Re-point synthesis_versions to the kept row
            try:
                conn.execute(
                    f"UPDATE synthesis_versions SET domain_id = ? WHERE domain_id IN ({placeholders})",
                    [keep_id] + remove_ids,
                )
            except sqlite3.OperationalError:
                pass  # Table may not exist on very old DBs
            # Re-point taxonomy_changes to the kept row
            try:
                conn.execute(
                    f"UPDATE taxonomy_changes SET domain_id = ? WHERE domain_id IN ({placeholders})",
                    [keep_id] + remove_ids,
                )
            except sqlite3.OperationalError:
                pass
            # Re-point domain_references (has UNIQUE constraint — use OR IGNORE + cleanup)
            try:
                conn.execute(
                    f"UPDATE OR IGNORE domain_references SET source_domain_id = ? WHERE source_domain_id IN ({placeholders})",
                    [keep_id] + remove_ids,
                )
                conn.execute(
                    f"DELETE FROM domain_references WHERE source_domain_id IN ({placeholders})",
                    remove_ids,
                )
                conn.execute(
                    f"UPDATE OR IGNORE domain_references SET target_domain_id = ? WHERE target_domain_id IN ({placeholders})",
                    [keep_id] + remove_ids,
                )
                conn.execute(
                    f"DELETE FROM domain_references WHERE target_domain_id IN ({placeholders})",
                    remove_ids,
                )
                # Remove self-referencing rows created by re-pointing
                conn.execute("DELETE FROM domain_references WHERE source_domain_id = target_domain_id")
            except sqlite3.OperationalError:
                pass
            # Delete the duplicates
            conn.execute(
                f"DELETE FROM domains WHERE id IN ({placeholders})",
                remove_ids,
            )
            # Repair counts for the kept domain
            actual = conn.execute("""
                SELECT COUNT(DISTINCT s.id), COUNT(DISTINCT i.id)
                FROM sources s LEFT JOIN insights i ON i.source_id = s.id
                WHERE s.domain_id = ?
            """, (keep_id,)).fetchone()
            if actual:
                conn.execute(
                    "UPDATE domains SET source_count = ?, insight_count = ? WHERE id = ?",
                    (actual[0], actual[1], keep_id),
                )
            conn.commit()
            logger.info(f"Deduplicated domain '{row[0]}' level={row[1]}: kept id={keep_id}, removed {remove_ids}")

    except sqlite3.OperationalError as e:
        logger.warning(f"Domain deduplication skipped: {e}")


def _consolidate_taxonomy(conn):
    """One-time audit: merge small categories, fix name collisions, assign better structure.

    Runs idempotently — checks if merges are needed before executing.
    Uses the same merge pattern as _deduplicate_domains: re-point children/sources/insights.
    """
    try:
        # Find level-0 categories with 0 or 1 child domains — candidates for merging
        small_cats = conn.execute("""
            SELECT p.id, p.name, COUNT(d.id) as child_count
            FROM domains p
            LEFT JOIN domains d ON d.parent_id = p.id AND d.level = 1
            WHERE p.level = 0
            GROUP BY p.id
            HAVING child_count <= 1
        """).fetchall()

        if not small_cats:
            return

        # Find the largest level-0 category to use as merge target
        largest = conn.execute("""
            SELECT p.id, p.name, COUNT(d.id) as child_count
            FROM domains p
            LEFT JOIN domains d ON d.parent_id = p.id AND d.level = 1
            WHERE p.level = 0
            GROUP BY p.id
            ORDER BY child_count DESC
            LIMIT 1
        """).fetchone()

        if not largest:
            return

        target_id = largest[0]
        target_name = largest[1]

        for cat in small_cats:
            cat_id, cat_name, child_count = cat[0], cat[1], cat[2]
            if cat_id == target_id:
                continue  # Don't merge the target into itself

            # Merge: move all level-1 children of this small category to the target
            conn.execute(
                "UPDATE domains SET parent_id = ?, path = REPLACE(path, ?, ?) WHERE parent_id = ? AND level = 1",
                (target_id, f"/{cat_name}/", f"/{target_name}/", cat_id),
            )

            # Move any sources directly attached to this category
            conn.execute(
                "UPDATE sources SET domain_id = ? WHERE domain_id = ?",
                (target_id, cat_id),
            )
            conn.execute(
                "UPDATE insights SET domain_id = ? WHERE domain_id = ?",
                (target_id, cat_id),
            )

            # Move level-2 sub-topics that were children of this category
            conn.execute(
                "UPDATE domains SET parent_id = ? WHERE parent_id = ? AND level = 2",
                (target_id, cat_id),
            )

            # Delete the empty category
            conn.execute("DELETE FROM domains WHERE id = ?", (cat_id,))
            logger.info(f"Taxonomy consolidation: merged category \'{cat_name}\' → \'{target_name}\'")

        # Fix name collisions: level-0 and level-1 with the same name
        collisions = conn.execute("""
            SELECT p.id as parent_id, p.name, d.id as domain_id
            FROM domains p
            JOIN domains d ON d.parent_id = p.id
            WHERE p.level = 0 AND d.level = 1
              AND p.name = d.name COLLATE NOCASE
        """).fetchall()

        for col in collisions:
            parent_id, name, domain_id = col[0], col[1], col[2]
            # Move sources from the level-1 duplicate up to the level-0 parent
            conn.execute(
                "UPDATE sources SET domain_id = ? WHERE domain_id = ?",
                (parent_id, domain_id),
            )
            conn.execute(
                "UPDATE insights SET domain_id = ? WHERE domain_id = ?",
                (parent_id, domain_id),
            )
            # Move sub-topics from level-1 to level-0
            conn.execute(
                "UPDATE domains SET parent_id = ? WHERE parent_id = ? AND level = 2",
                (parent_id, domain_id),
            )
            # Delete the level-1 duplicate
            conn.execute("DELETE FROM domains WHERE id = ?", (domain_id,))
            logger.info(f"Taxonomy consolidation: fixed name collision \'{name}\' — collapsed level-1 into level-0")

        # Repair counts for all domains
        conn.execute("""
            UPDATE domains SET
                source_count = (SELECT COUNT(*) FROM sources WHERE domain_id = domains.id),
                insight_count = (SELECT COUNT(*) FROM insights WHERE domain_id = domains.id)
        """)

        conn.commit()
        logger.info("Taxonomy consolidation complete")

    except sqlite3.OperationalError as e:
        logger.warning(f"Taxonomy consolidation skipped: {e}")


def _refresh_domain_icons(conn):
    """Assign contextual icons to all domains with generic/wrong icons.

    Two-tier approach:
    1. Curated name→icon map for known domains (researched, contextual)
    2. Smart keyword matching with longest-match-first ordering
    """
    # Tier 1: Exact name matches (case-insensitive) — hand-researched
    CURATED_ICONS = {
        # AI & Claude ecosystem
        'artificial intelligence': '🤖',
        'claude code': '💻',
        'claude co-work': '🤝',
        'claude agent teams': '🧑‍🤝‍🧑',
        'rag ai agent': '🔍',
        'ai design': '🎨',
        'ai tools': '🤖',
        'ai tools setup': '⚙️',
        # Content & knowledge tools
        'note-taking tools': '📝',
        'notebooklm integration': '📓',
        # Ethics & philosophy
        'animal ethics': '🐾',
        # Finance & trading
        'stock trading': '📈',
        # Apps & mobile
        'app development': '📲',
        'mobile app validation': '✅',
        'app branding': '🏷️',
        'budgeting app': '💰',
        'mobile technology': '📱',
        # Projects / brands
        'openclaw': '🦞',
    }

    # Tier 2: Keyword matching — sorted longest first so specific beats generic
    ICON_KEYWORDS = [
        # Multi-word (most specific) first
        ('artificial intelligence', '🤖'), ('machine learning', '🤖'),
        ('real estate', '🏠'), ('note-taking', '📝'), ('open source', '🔓'),
        ('social media', '📱'), ('web development', '🌐'),
        ('content creation', '🎬'), ('data science', '📊'),
        ('mobile dev', '📱'),
        # Single-word (broader)
        ('claude', '🤖'), ('gpt', '🤖'), ('llm', '🤖'),
        ('agent', '🤖'), ('ai', '🤖'),
        ('mobile', '📱'), ('phone', '📱'), ('ios', '📱'), ('android', '📱'),
        ('app', '📲'),
        ('trading', '📈'), ('stock', '📈'), ('finance', '💰'),
        ('invest', '💰'), ('budget', '💰'),
        ('animal', '🐾'), ('pet', '🐾'), ('wildlife', '🦁'),
        ('ethic', '⚖️'), ('moral', '⚖️'),
        ('design', '🎨'), ('branding', '🏷️'), ('ux', '✨'),
        ('code', '💻'), ('programming', '💻'), ('development', '💻'),
        ('notebook', '📓'), ('note', '📝'), ('writing', '✍️'),
        ('search', '🔍'), ('rag', '🔍'), ('retrieval', '🔍'),
        ('data', '📊'), ('analytics', '📊'),
        ('video', '🎬'), ('content', '🎬'),
        ('security', '🔒'), ('cyber', '🔒'),
        ('web', '🌐'), ('startup', '🚀'), ('growth', '🚀'),
        ('psychology', '🧠'), ('marketing', '📣'),
        ('collaboration', '🤝'), ('co-work', '🤝'), ('team', '👥'),
        ('validation', '✅'), ('testing', '🧪'),
        ('integration', '🔗'), ('automation', '⚡'),
        ('education', '🎓'), ('learning', '🎓'),
        ('health', '💪'), ('fitness', '💪'),
        ('cooking', '🍳'), ('food', '🍽️'),
        ('music', '🎵'), ('gaming', '🎮'),
        ('photo', '📷'), ('science', '🔬'),
        ('history', '🏛️'), ('philosophy', '💭'),
        ('strategy', '♟️'), ('negotiation', '🤝'),
        ('career', '🎯'), ('productivity', '⏱️'),
    ]

    try:
        # Broaden scope: fix ALL domains with generic/wrong icons
        domains = conn.execute(
            "SELECT id, name, description FROM domains WHERE icon IN ('📚', '📂', '🔧', '⚙️') OR icon IS NULL"
        ).fetchall()

        if not domains:
            return

        updated = 0
        for d in domains:
            name_lower = d[1].lower().strip()
            desc = (d[2] or '').lower()
            icon = None

            # Tier 1: Exact curated match
            if name_lower in CURATED_ICONS:
                icon = CURATED_ICONS[name_lower]

            # Tier 2: Keyword match (longest first — already sorted)
            if not icon:
                for keyword, emoji in ICON_KEYWORDS:
                    if keyword in name_lower or keyword in desc:
                        icon = emoji
                        break

            # Fallback: knowledge lightbulb (better than folder/book)
            if not icon:
                icon = '💡'

            conn.execute("UPDATE domains SET icon = ? WHERE id = ?", (icon, d[0]))
            updated += 1

        conn.commit()
        logger.info(f"Refreshed icons for {updated} domains")

    except sqlite3.OperationalError as e:
        logger.warning(f"Icon refresh skipped: {e}")


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
