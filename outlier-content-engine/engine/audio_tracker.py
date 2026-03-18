"""
Audio Tracker — detects trending audio across competitor outlier posts.

Identifies audio tracks that appear in multiple high-performing posts,
signaling a trending sound that the brand should consider using.
"""

import logging
import sqlite3
from collections import Counter
from typing import List, Dict, Optional

import config
from profile_loader import BrandProfile

logger = logging.getLogger(__name__)


class AudioTracker:
    """Tracks audio/sound usage patterns across competitor posts."""

    def __init__(self, profile: BrandProfile, db_path=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH

    def detect_trending_audio(self, outliers=None) -> Dict:
        """
        Detect trending audio across outlier posts and all recent posts.

        Returns dict with trending_audio list and audio_diversity_score.
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get audio usage across all recent posts (last 30 days)
        all_audio = conn.execute("""
            SELECT audio_id, audio_name,
                   COUNT(*) as usage_count,
                   SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) as outlier_count,
                   AVG(COALESCE(likes,0) + COALESCE(comments,0) +
                       COALESCE(saves,0) + COALESCE(shares,0)) as avg_engagement
            FROM competitor_posts
            WHERE brand_profile = ?
              AND audio_id IS NOT NULL
              AND audio_id != ''
              AND is_own_channel = 0
            GROUP BY audio_id
            HAVING usage_count >= 2
            ORDER BY outlier_count DESC, avg_engagement DESC
            LIMIT 20
        """, (self.profile.profile_name,)).fetchall()

        conn.close()

        trending = []
        for row in all_audio:
            trending.append({
                "audio_id": row["audio_id"],
                "audio_name": row["audio_name"] or "Unknown",
                "usage_count": row["usage_count"],
                "outlier_count": row["outlier_count"],
                "avg_engagement": round(row["avg_engagement"] or 0),
            })

        # Flag trending audio in DB
        if trending:
            self._flag_trending_in_db(
                [t["audio_id"] for t in trending if t["outlier_count"] >= 2]
            )

        # Audio diversity: how many unique audio tracks among outliers
        outlier_audio_count = sum(
            1 for t in trending if t["outlier_count"] > 0
        )
        total_outlier_count = len(outliers) if outliers else 1

        return {
            "trending_audio": trending,
            "audio_diversity_score": round(
                outlier_audio_count / max(total_outlier_count, 1), 2
            ),
            "total_unique_audio": len(trending),
        }

    def get_audio_insights(self) -> List[Dict]:
        """Get summarized audio insights for reporting."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        rows = conn.execute("""
            SELECT audio_id, audio_name,
                   COUNT(*) as total_uses,
                   SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) as in_outliers,
                   GROUP_CONCAT(DISTINCT competitor_handle) as used_by
            FROM competitor_posts
            WHERE brand_profile = ?
              AND audio_id IS NOT NULL AND audio_id != ''
              AND is_own_channel = 0
              AND is_trending_audio = 1
            GROUP BY audio_id
            ORDER BY in_outliers DESC
            LIMIT 10
        """, (self.profile.profile_name,)).fetchall()

        conn.close()
        return [dict(row) for row in rows]

    def _flag_trending_in_db(self, audio_ids: List[str]) -> None:
        """Mark posts with trending audio in the database."""
        if not audio_ids:
            return

        conn = sqlite3.connect(str(self.db_path))

        # Reset all trending flags first
        conn.execute("""
            UPDATE competitor_posts
            SET is_trending_audio = 0
            WHERE brand_profile = ?
        """, (self.profile.profile_name,))

        # Set trending for matching audio IDs
        placeholders = ",".join("?" * len(audio_ids))
        conn.execute(f"""
            UPDATE competitor_posts
            SET is_trending_audio = 1
            WHERE brand_profile = ?
              AND audio_id IN ({placeholders})
        """, [self.profile.profile_name] + audio_ids)

        conn.commit()
        conn.close()
        logger.info(f"  Flagged {len(audio_ids)} trending audio tracks")
