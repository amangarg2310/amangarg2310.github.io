"""Track ingested sources in a local SQLite database to avoid reprocessing."""

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from config.settings import SOURCE_REGISTRY_DB

logger = logging.getLogger(__name__)


class SourceRegistry:
    """Simple SQLite registry of ingested video sources."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or SOURCE_REGISTRY_DB
        self._init_db()

    def _init_db(self):
        with self._connect() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS sources (
                    video_id TEXT PRIMARY KEY,
                    url TEXT NOT NULL,
                    title TEXT,
                    channel TEXT,
                    channel_id TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    transcript_path TEXT,
                    ingested_at TEXT,
                    processed_at TEXT,
                    error TEXT,
                    metadata TEXT
                )
            """)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        return conn

    def register(
        self,
        video_id: str,
        url: str,
        title: Optional[str] = None,
        channel: Optional[str] = None,
        channel_id: Optional[str] = None,
    ) -> bool:
        """Register a new video source. Returns True if newly registered, False if already exists."""
        try:
            with self._connect() as conn:
                conn.execute(
                    """INSERT OR IGNORE INTO sources (video_id, url, title, channel, channel_id, status)
                       VALUES (?, ?, ?, ?, ?, 'pending')""",
                    (video_id, url, title, channel, channel_id),
                )
                return conn.total_changes > 0
        except sqlite3.Error as e:
            logger.error(f"Failed to register {video_id}: {e}")
            return False

    def mark_ingested(self, video_id: str, transcript_path: str):
        """Mark a video as successfully ingested (transcript fetched)."""
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                "UPDATE sources SET status = 'ingested', transcript_path = ?, ingested_at = ? WHERE video_id = ?",
                (transcript_path, now, video_id),
            )

    def mark_processed(self, video_id: str):
        """Mark a video as fully processed (insights extracted)."""
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                "UPDATE sources SET status = 'processed', processed_at = ? WHERE video_id = ?",
                (now, video_id),
            )

    def mark_error(self, video_id: str, error: str):
        """Mark a video as failed with an error message."""
        with self._connect() as conn:
            conn.execute(
                "UPDATE sources SET status = 'error', error = ? WHERE video_id = ?",
                (error, video_id),
            )

    def get_status(self, video_id: str) -> Optional[str]:
        """Get the current status of a video."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT status FROM sources WHERE video_id = ?", (video_id,)
            ).fetchone()
            return row["status"] if row else None

    def get_source(self, video_id: str) -> Optional[dict]:
        """Get full source record."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM sources WHERE video_id = ?", (video_id,)
            ).fetchone()
            return dict(row) if row else None

    def get_pending(self) -> list[dict]:
        """Get all videos with 'pending' status."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sources WHERE status = 'pending'"
            ).fetchall()
            return [dict(r) for r in rows]

    def get_ingested(self) -> list[dict]:
        """Get all videos with 'ingested' status (ready for processing)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM sources WHERE status = 'ingested'"
            ).fetchall()
            return [dict(r) for r in rows]

    def is_known(self, video_id: str) -> bool:
        """Check if a video is already in the registry."""
        return self.get_status(video_id) is not None

    def get_all(self) -> list[dict]:
        """Get all registered sources."""
        with self._connect() as conn:
            rows = conn.execute("SELECT * FROM sources ORDER BY ingested_at DESC").fetchall()
            return [dict(r) for r in rows]

    def stats(self) -> dict:
        """Return counts by status."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT status, COUNT(*) as count FROM sources GROUP BY status"
            ).fetchall()
            return {row["status"]: row["count"] for row in rows}
