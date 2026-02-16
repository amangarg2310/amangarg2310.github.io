"""
Trend Radar Collector -- aggregates sound/hashtag usage snapshots from DB.

Called after each TikTok collection + outlier detection run. Reads from
the existing competitor_posts table and writes point-in-time snapshots to
trend_radar_snapshots. Zero additional API calls.
"""

import logging
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from typing import Dict

import config

logger = logging.getLogger(__name__)


class TrendRadarCollector:
    """
    Aggregates sound/hashtag counts from already-collected TikTok posts.

    Called after each collection run to create a point-in-time snapshot.
    Zero additional API calls -- reads entirely from competitor_posts.
    """

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH

    def capture_snapshot(self) -> Dict:
        """
        Aggregate current sound and hashtag usage into a snapshot.

        Returns:
            {
                "sounds_tracked": int,
                "hashtags_tracked": int,
                "snapshot_timestamp": str,
            }
        """
        now = datetime.now(timezone.utc)
        # Hour precision so multiple runs/day create distinct data points
        snapshot_ts = now.replace(minute=0, second=0, microsecond=0).isoformat()
        collected_at = now.isoformat()

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout = 5000")

        try:
            sounds = self._aggregate_sounds(conn, snapshot_ts, collected_at)
            hashtags = self._aggregate_hashtags(conn, snapshot_ts, collected_at)
            conn.commit()
        finally:
            conn.close()

        return {
            "sounds_tracked": sounds,
            "hashtags_tracked": hashtags,
            "snapshot_timestamp": snapshot_ts,
        }

    def _aggregate_sounds(self, conn, snapshot_ts: str, collected_at: str) -> int:
        """
        Aggregate audio_id counts from TikTok posts and upsert snapshots.
        Returns count of sounds tracked.
        """
        rows = conn.execute("""
            SELECT audio_id, audio_name,
                   COUNT(*) as usage_count,
                   SUM(CASE WHEN is_outlier = 1 THEN 1 ELSE 0 END) as outlier_count,
                   SUM(COALESCE(likes,0) + COALESCE(comments,0)
                       + COALESCE(saves,0) + COALESCE(shares,0)) as total_engagement,
                   AVG(COALESCE(likes,0) + COALESCE(comments,0)
                       + COALESCE(saves,0) + COALESCE(shares,0)) as avg_engagement
            FROM competitor_posts
            WHERE brand_profile = ?
              AND platform = 'tiktok'
              AND audio_id IS NOT NULL AND audio_id != ''
              AND COALESCE(archived, 0) = 0
              AND COALESCE(is_own_channel, 0) = 0
            GROUP BY audio_id
            HAVING usage_count >= 2
        """, (self.brand_profile,)).fetchall()

        tracked = 0
        for row in rows:
            # Find top post for this sound
            top = conn.execute("""
                SELECT post_id FROM competitor_posts
                WHERE brand_profile = ? AND audio_id = ?
                  AND COALESCE(archived, 0) = 0
                ORDER BY (COALESCE(likes,0) + COALESCE(comments,0)
                          + COALESCE(saves,0) + COALESCE(shares,0)) DESC
                LIMIT 1
            """, (self.brand_profile, row["audio_id"])).fetchone()

            top_post_id = top["post_id"] if top else None

            conn.execute("""
                INSERT INTO trend_radar_snapshots
                    (brand_profile, snapshot_timestamp, item_type, item_id,
                     item_name, usage_count, outlier_count, total_engagement,
                     avg_engagement, top_post_id, collected_at)
                VALUES (?, ?, 'sound', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(brand_profile, snapshot_timestamp, item_type, item_id)
                DO UPDATE SET
                    item_name = excluded.item_name,
                    usage_count = excluded.usage_count,
                    outlier_count = excluded.outlier_count,
                    total_engagement = excluded.total_engagement,
                    avg_engagement = excluded.avg_engagement,
                    top_post_id = excluded.top_post_id,
                    collected_at = excluded.collected_at
            """, (
                self.brand_profile, snapshot_ts,
                row["audio_id"], row["audio_name"],
                row["usage_count"], row["outlier_count"],
                int(row["total_engagement"] or 0),
                round(row["avg_engagement"] or 0, 2),
                top_post_id, collected_at,
            ))
            tracked += 1

        logger.info(f"  Trend Radar: {tracked} sounds snapshot captured")
        return tracked

    def _aggregate_hashtags(self, conn, snapshot_ts: str, collected_at: str) -> int:
        """
        Extract hashtags from TikTok post captions, aggregate, and upsert snapshots.
        Returns count of hashtags tracked.
        """
        rows = conn.execute("""
            SELECT id, post_id, caption, is_outlier,
                   COALESCE(likes,0) + COALESCE(comments,0)
                       + COALESCE(saves,0) + COALESCE(shares,0) as engagement
            FROM competitor_posts
            WHERE brand_profile = ?
              AND platform = 'tiktok'
              AND caption IS NOT NULL AND caption != ''
              AND COALESCE(archived, 0) = 0
              AND COALESCE(is_own_channel, 0) = 0
        """, (self.brand_profile,)).fetchall()

        # Extract hashtags from all captions
        hashtag_posts = {}  # hashtag -> list of {post_id, engagement, is_outlier}
        for row in rows:
            tags = re.findall(r'#(\w+)', row["caption"])
            for tag in tags:
                tag_lower = tag.lower()
                if tag_lower not in hashtag_posts:
                    hashtag_posts[tag_lower] = {
                        "display_name": tag,
                        "posts": [],
                    }
                hashtag_posts[tag_lower]["posts"].append({
                    "post_id": row["post_id"],
                    "engagement": row["engagement"],
                    "is_outlier": row["is_outlier"],
                })

        # Filter to hashtags with 2+ uses and upsert
        tracked = 0
        for tag_lower, data in hashtag_posts.items():
            posts = data["posts"]
            if len(posts) < 2:
                continue

            usage_count = len(posts)
            outlier_count = sum(1 for p in posts if p["is_outlier"])
            total_engagement = sum(p["engagement"] for p in posts)
            avg_engagement = total_engagement / usage_count if usage_count else 0

            # Top post by engagement
            best = max(posts, key=lambda p: p["engagement"])

            conn.execute("""
                INSERT INTO trend_radar_snapshots
                    (brand_profile, snapshot_timestamp, item_type, item_id,
                     item_name, usage_count, outlier_count, total_engagement,
                     avg_engagement, top_post_id, collected_at)
                VALUES (?, ?, 'hashtag', ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(brand_profile, snapshot_timestamp, item_type, item_id)
                DO UPDATE SET
                    item_name = excluded.item_name,
                    usage_count = excluded.usage_count,
                    outlier_count = excluded.outlier_count,
                    total_engagement = excluded.total_engagement,
                    avg_engagement = excluded.avg_engagement,
                    top_post_id = excluded.top_post_id,
                    collected_at = excluded.collected_at
            """, (
                self.brand_profile, snapshot_ts,
                tag_lower, data["display_name"],
                usage_count, outlier_count,
                int(total_engagement),
                round(avg_engagement, 2),
                best["post_id"], collected_at,
            ))
            tracked += 1

        logger.info(f"  Trend Radar: {tracked} hashtags snapshot captured")
        return tracked
