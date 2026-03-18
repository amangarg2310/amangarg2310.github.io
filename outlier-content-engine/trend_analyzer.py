"""
Trend Analyzer — detects rising and declining content patterns over time.

Captures pattern frequency snapshots after each analysis run, then computes
velocity (linear regression slope) across weekly snapshots to identify
what's trending up or down.

No LLM calls — purely statistical with template-based narratives.
"""

import json
import logging
import sqlite3
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import config

logger = logging.getLogger(__name__)


class TrendAnalyzer:
    """Detects rising and declining content patterns over time."""

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH

    def capture_snapshot(self) -> None:
        """
        Capture today's pattern frequencies from current outliers.

        Called after each analysis run (from main.py pipeline).
        Tallies hook_types, content_patterns, formats, and emotional_triggers
        from ai_analysis JSON of current outlier posts.
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get all outlier posts with AI analysis for this profile
        rows = conn.execute("""
            SELECT ai_analysis, media_type, outlier_score
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_outlier = 1
              AND COALESCE(is_own_channel, 0) = 0
              AND ai_analysis IS NOT NULL
        """, (self.brand_profile,)).fetchall()

        if not rows:
            conn.close()
            logger.info("No outlier posts with AI analysis — skipping trend snapshot")
            return

        # Tally frequencies
        hook_types = Counter()
        content_patterns = Counter()
        formats = Counter()
        triggers = Counter()
        scores = []

        for row in rows:
            # Count format from media_type column
            fmt = row["media_type"] or "unknown"
            formats[fmt] += 1

            if row["outlier_score"]:
                scores.append(row["outlier_score"])

            # Parse AI analysis JSON
            try:
                analysis = json.loads(row["ai_analysis"])
            except (json.JSONDecodeError, TypeError):
                continue

            hook = analysis.get("hook_type", "")
            if hook:
                hook_types[hook] += 1

            pattern = analysis.get("content_pattern", "")
            if pattern:
                content_patterns[pattern] += 1

            trigger = analysis.get("emotional_trigger", "")
            if trigger:
                triggers[trigger] += 1

        # Build snapshot data
        snapshot_data = {
            "hook_types": dict(hook_types),
            "content_patterns": dict(content_patterns),
            "formats": dict(formats),
            "triggers": dict(triggers),
        }

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        now = datetime.now(timezone.utc).isoformat()
        avg_score = sum(scores) / len(scores) if scores else 0

        # Upsert snapshot (one per day per profile)
        try:
            conn.execute("""
                INSERT INTO trend_snapshots
                    (brand_profile, snapshot_date, snapshot_data, outlier_count,
                     avg_outlier_score, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(brand_profile, snapshot_date)
                DO UPDATE SET snapshot_data = ?, outlier_count = ?,
                             avg_outlier_score = ?, created_at = ?
            """, (
                self.brand_profile, today, json.dumps(snapshot_data),
                len(rows), avg_score, now,
                json.dumps(snapshot_data), len(rows), avg_score, now,
            ))
            conn.commit()
            logger.info(
                f"Trend snapshot captured: {len(rows)} outliers, "
                f"{len(hook_types)} hook types, {len(content_patterns)} patterns"
            )
        except Exception as e:
            logger.warning(f"Failed to save trend snapshot: {e}")
        finally:
            conn.close()

    def get_trends(self, lookback_weeks: int = 4) -> Dict:
        """
        Compare recent snapshots to detect rising/declining patterns.

        Returns:
            {
                "rising": [{"name": str, "type": str, "velocity": float, "current_count": int}],
                "stable": [...],
                "declining": [...],
                "prediction": str,
                "snapshot_count": int,
            }
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        cutoff = (
            datetime.now(timezone.utc) - timedelta(weeks=lookback_weeks)
        ).strftime("%Y-%m-%d")

        rows = conn.execute("""
            SELECT snapshot_date, snapshot_data, outlier_count
            FROM trend_snapshots
            WHERE brand_profile = ?
              AND snapshot_date >= ?
            ORDER BY snapshot_date ASC
        """, (self.brand_profile, cutoff)).fetchall()
        conn.close()

        if len(rows) < 2:
            return {
                "rising": [],
                "stable": [],
                "declining": [],
                "prediction": "Not enough data yet — run analysis again in a few days to see trends.",
                "snapshot_count": len(rows),
            }

        # Parse snapshots
        snapshots = []
        for row in rows:
            try:
                data = json.loads(row["snapshot_data"])
                data["_date"] = row["snapshot_date"]
                snapshots.append(data)
            except (json.JSONDecodeError, TypeError):
                continue

        # Compute velocity for each pattern across all dimensions
        all_items = []

        for dimension in ("hook_types", "content_patterns", "formats", "triggers"):
            # Collect all unique keys across snapshots
            all_keys = set()
            for snap in snapshots:
                all_keys.update(snap.get(dimension, {}).keys())

            for key in all_keys:
                counts = [snap.get(dimension, {}).get(key, 0) for snap in snapshots]
                velocity = self._compute_velocity(counts)
                current = counts[-1] if counts else 0

                all_items.append({
                    "name": key,
                    "type": dimension.rstrip("s"),  # "hook_type", "content_pattern", etc.
                    "velocity": round(velocity, 3),
                    "current_count": current,
                })

        # Classify: rising (>15%), declining (<-15%), stable
        rising = sorted(
            [i for i in all_items if i["velocity"] > 0.15],
            key=lambda x: x["velocity"], reverse=True
        )
        declining = sorted(
            [i for i in all_items if i["velocity"] < -0.15],
            key=lambda x: x["velocity"]
        )
        stable = [i for i in all_items if -0.15 <= i["velocity"] <= 0.15]

        # Build narrative
        prediction = self._build_prediction(rising[:3], declining[:2])

        return {
            "rising": rising[:5],
            "stable": stable[:5],
            "declining": declining[:5],
            "prediction": prediction,
            "snapshot_count": len(snapshots),
        }

    def _compute_velocity(self, counts: List[int]) -> float:
        """
        Simple linear regression slope over sequential counts.

        Returns normalized velocity (percentage change per period).
        Positive = rising, negative = declining, near-zero = stable.
        """
        n = len(counts)
        if n < 2:
            return 0.0

        x = list(range(n))
        y = counts

        mean_x = sum(x) / n
        mean_y = sum(y) / n

        numerator = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
        denominator = sum((x[i] - mean_x) ** 2 for i in range(n))

        if denominator == 0:
            return 0.0

        slope = numerator / denominator

        # Normalize by mean to get percentage velocity
        if mean_y > 0:
            return slope / mean_y
        return slope

    def _build_prediction(self, rising: List[Dict], declining: List[Dict]) -> str:
        """Build a template-based prediction narrative."""
        parts = []

        for item in rising:
            pct = abs(item["velocity"]) * 100
            parts.append(
                f"{item['name']} ({item['type']}) is gaining momentum "
                f"(+{pct:.0f}% per snapshot)"
            )

        for item in declining:
            pct = abs(item["velocity"]) * 100
            parts.append(
                f"{item['name']} ({item['type']}) is fading "
                f"(-{pct:.0f}% per snapshot)"
            )

        if not parts:
            return "Patterns are relatively stable across recent analysis runs."

        return ". ".join(parts) + "."
