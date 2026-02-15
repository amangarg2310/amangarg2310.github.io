"""
Data Lifecycle Management for ScoutAI.

Handles:
1. 3-day automatic data cleanup
2. Competitive set change detection
3. Incremental analysis (keep old + add new outliers)
"""

import json
import logging
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import config

logger = logging.getLogger(__name__)


class DataLifecycleManager:
    """Manages data lifecycle and competitive set tracking."""

    def __init__(self, db_path=None):
        self.db_path = db_path or config.DB_PATH
        self.config_file = config.DATA_DIR / "lifecycle_config.json"

    def cleanup_old_data(self, days=3):
        """
        Delete posts and analysis data older than N days.

        Args:
            days: Number of days to keep (default 3)
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff_str = cutoff_date.isoformat()

        conn = sqlite3.connect(str(self.db_path))

        # Delete old posts
        result = conn.execute("""
            DELETE FROM competitor_posts
            WHERE collected_at < ?
        """, (cutoff_str,))
        posts_deleted = result.rowcount

        conn.commit()
        conn.close()

        if posts_deleted > 0:
            logger.info(f"Cleaned up {posts_deleted} posts older than {days} days")

        return posts_deleted

    def get_competitive_set_signature(self, vertical_name: str) -> Optional[str]:
        """
        Get a signature (sorted JSON array) of brand handles in a vertical.

        Args:
            vertical_name: Name of the vertical

        Returns:
            JSON string like '["brand1", "brand2", ...]' or None if vertical doesn't exist
        """
        from vertical_manager import VerticalManager

        vm = VerticalManager()
        vertical = vm.get_vertical(vertical_name)

        if not vertical:
            return None

        # Get all handles (Instagram and TikTok), sorted
        handles = set()
        for brand in vertical.brands:
            if brand.instagram_handle:
                handles.add(f"ig:{brand.instagram_handle}")
            if brand.tiktok_handle:
                handles.add(f"tt:{brand.tiktok_handle}")

        return json.dumps(sorted(list(handles)))

    def get_last_analysis_info(self, vertical_name: str) -> Optional[dict]:
        """
        Get information about the last analysis run for a vertical.

        Returns:
            dict with 'signature', 'timestamp', 'posts_analyzed' or None
        """
        if not self.config_file.exists():
            return None

        try:
            with open(self.config_file, 'r') as f:
                data = json.load(f)

            return data.get(vertical_name)
        except Exception as e:
            logger.warning(f"Failed to read lifecycle config: {e}")
            return None

    def save_analysis_info(self, vertical_name: str, signature: str, posts_analyzed: int):
        """
        Save information about the current analysis run.

        Args:
            vertical_name: Name of the vertical
            signature: Competitive set signature
            posts_analyzed: Number of posts analyzed
        """
        data = {}
        if self.config_file.exists():
            try:
                with open(self.config_file, 'r') as f:
                    data = json.load(f)
            except:
                pass

        data[vertical_name] = {
            "signature": signature,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "posts_analyzed": posts_analyzed
        }

        try:
            with open(self.config_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.warning(f"Failed to save lifecycle config: {e}")

    def should_clear_data(self, vertical_name: str) -> bool:
        """
        Determine if we should clear existing data before analysis.

        Returns True if:
        - Competitive set has changed (different brands)
        - Last analysis was more than 3 days ago
        - No previous analysis exists

        Returns False if:
        - Same competitive set within 3 days (keep existing + add new)
        """
        current_signature = self.get_competitive_set_signature(vertical_name)
        if not current_signature:
            return True  # Vertical doesn't exist

        last_analysis = self.get_last_analysis_info(vertical_name)
        if not last_analysis:
            return True  # No previous analysis

        # Check if competitive set changed
        if last_analysis.get("signature") != current_signature:
            logger.info(f"Competitive set changed for {vertical_name} - will clear old data")
            return True

        # Check if last analysis was more than 3 days ago
        try:
            last_run = datetime.fromisoformat(last_analysis["timestamp"])
            age = datetime.now(timezone.utc) - last_run

            if age > timedelta(days=3):
                logger.info(f"Last analysis was {age.days} days ago - will clear old data")
                return True
        except Exception as e:
            logger.warning(f"Failed to parse last analysis timestamp: {e}")
            return True

        logger.info(f"Same competitive set within 3 days - will keep existing data and add new")
        return False

    def clear_vertical_data(self, vertical_name: str):
        """
        Clear all posts and analysis data for a vertical.
        Creates a blank canvas.

        Args:
            vertical_name: Name of the vertical to clear
        """
        conn = sqlite3.connect(str(self.db_path))

        # Delete all posts for this vertical (including archived)
        result = conn.execute("""
            DELETE FROM competitor_posts
            WHERE brand_profile = ?
        """, (vertical_name,))
        deleted = result.rowcount

        conn.commit()
        conn.close()

        logger.info(f"Cleared {deleted} posts for vertical '{vertical_name}' (blank canvas)")

        return deleted
