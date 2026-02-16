"""
Trend Radar Scorer -- velocity-based trend scoring engine.

Calculates velocity (growth rate normalized to time), acceleration,
and a composite score to surface the top N actionable trends.

Core insight: velocity beats volume. A sound with 500 uses growing at
400%/hour is a better signal than one with 50,000 uses that peaked yesterday.
"""

import logging
import math
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import config

logger = logging.getLogger(__name__)


class TrendRadarScorer:
    """
    Scores tracked sounds/hashtags by velocity and returns ranked trends.
    """

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH

    def get_top_trends(self, limit: int = 10, lookback_hours: int = 72) -> list:
        """
        Score all tracked items and return the top N by composite score.

        Args:
            limit: Number of top trends to return.
            lookback_hours: How far back to look for snapshots (default 72h).

        Returns list of trend dicts with rank, velocity, composite_score, etc.
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        history = self._get_snapshot_history(conn, lookback_hours)

        if not history:
            conn.close()
            return []

        # Collect all avg_engagement values for percentile ranking
        all_engagements = []
        for item_data in history.values():
            snaps = item_data["snapshots"]
            if snaps:
                all_engagements.append(snaps[-1]["avg_engagement"])

        scored = []
        for (item_type, item_id), item_data in history.items():
            snaps = item_data["snapshots"]
            if not snaps:
                continue

            latest = snaps[-1]
            earliest = snaps[0]

            velocity = self._compute_velocity(snaps)
            acceleration = self._compute_acceleration(snaps)

            current_usage = latest["usage_count"]
            outlier_count = latest["outlier_count"]
            outlier_correlation = outlier_count / max(current_usage, 1)
            avg_engagement = latest["avg_engagement"]

            # Hours since first seen in this lookback window
            first_ts = _parse_ts(earliest["ts"])
            now = datetime.now(timezone.utc)
            recency_hours = max((now - first_ts).total_seconds() / 3600, 0.1)

            composite = self._compute_composite_score(
                velocity=velocity,
                acceleration=acceleration,
                outlier_correlation=outlier_correlation,
                avg_engagement=avg_engagement,
                recency_hours=recency_hours,
                snapshot_count=len(snaps),
                all_engagements=all_engagements,
            )

            phase = self._classify_phase(velocity, acceleration, len(snaps))
            strength = self._classify_signal_strength(composite, len(snaps))

            # Format velocity as human-readable label
            velocity_label = self._format_velocity(velocity)

            # Look up top post URL from competitor_posts
            top_post_url = None
            top_post_handle = None
            if latest.get("top_post_id"):
                post_row = conn.execute("""
                    SELECT post_url, competitor_handle FROM competitor_posts
                    WHERE post_id = ? AND brand_profile = ?
                    LIMIT 1
                """, (latest["top_post_id"], self.brand_profile)).fetchone()
                if post_row:
                    top_post_url = post_row["post_url"]
                    top_post_handle = f"@{post_row['competitor_handle']}"

            scored.append({
                "item_type": item_type,
                "item_id": item_id,
                "item_name": item_data["item_name"] or item_id,
                "current_usage": current_usage,
                "velocity": round(velocity, 4),
                "velocity_label": velocity_label,
                "acceleration": round(acceleration, 4),
                "composite_score": round(composite, 1),
                "outlier_correlation": round(outlier_correlation, 2),
                "avg_engagement": round(avg_engagement),
                "recency_hours": round(recency_hours, 1),
                "top_post_id": latest.get("top_post_id"),
                "top_post_url": top_post_url,
                "top_post_handle": top_post_handle,
                "snapshot_count": len(snaps),
                "phase": phase,
                "signal_strength": strength,
            })

        conn.close()

        # Sort by composite score descending, take top N
        scored.sort(key=lambda x: x["composite_score"], reverse=True)
        top = scored[:limit]

        # Assign ranks
        for i, trend in enumerate(top, 1):
            trend["rank"] = i

        return top

    def _get_snapshot_history(self, conn, lookback_hours: int) -> Dict:
        """
        Fetch all snapshots within the lookback window, grouped by (item_type, item_id).
        """
        cutoff = (
            datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
        ).isoformat()

        rows = conn.execute("""
            SELECT item_type, item_id, item_name,
                   snapshot_timestamp, usage_count, outlier_count,
                   total_engagement, avg_engagement, top_post_id
            FROM trend_radar_snapshots
            WHERE brand_profile = ?
              AND snapshot_timestamp >= ?
            ORDER BY snapshot_timestamp ASC
        """, (self.brand_profile, cutoff)).fetchall()

        history = {}
        for row in rows:
            key = (row["item_type"], row["item_id"])
            if key not in history:
                history[key] = {
                    "item_name": row["item_name"],
                    "snapshots": [],
                }
            history[key]["snapshots"].append({
                "ts": row["snapshot_timestamp"],
                "usage_count": row["usage_count"],
                "outlier_count": row["outlier_count"],
                "total_engagement": row["total_engagement"],
                "avg_engagement": row["avg_engagement"] or 0,
                "top_post_id": row["top_post_id"],
            })

        return history

    def _compute_velocity(self, snapshots: list) -> float:
        """
        Compute normalized velocity (growth rate per hour).

        Uses linear regression of usage_count vs hours_elapsed,
        then normalizes by mean_usage to get percentage growth per hour.
        """
        n = len(snapshots)
        if n < 2:
            return 0.0

        first_ts = _parse_ts(snapshots[0]["ts"])
        points = []
        for snap in snapshots:
            ts = _parse_ts(snap["ts"])
            hours = max((ts - first_ts).total_seconds() / 3600, 0)
            points.append((hours, snap["usage_count"]))

        # If all timestamps are the same, can't compute velocity
        if points[-1][0] == 0:
            return 0.0

        x = [p[0] for p in points]
        y = [p[1] for p in points]

        mean_x = sum(x) / n
        mean_y = sum(y) / n

        numerator = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
        denominator = sum((x[i] - mean_x) ** 2 for i in range(n))

        if denominator == 0:
            return 0.0

        slope = numerator / denominator

        # Normalize by mean to get percentage growth per hour
        if mean_y > 0:
            return slope / mean_y
        return 0.0

    def _compute_acceleration(self, snapshots: list) -> float:
        """
        Is the velocity itself increasing? (second derivative)

        Splits snapshots into first half / second half, computes
        velocity for each, returns the difference.
        """
        n = len(snapshots)
        if n < 4:
            return 0.0

        mid = n // 2
        v_first = self._compute_velocity(snapshots[:mid])
        v_second = self._compute_velocity(snapshots[mid:])
        return v_second - v_first

    def _compute_composite_score(self, velocity: float, acceleration: float,
                                  outlier_correlation: float, avg_engagement: float,
                                  recency_hours: float, snapshot_count: int,
                                  all_engagements: list) -> float:
        """
        Combine signals into a single 0-100 composite score.

        Weights:
            velocity        40% -- growth rate is the primary signal
            outlier_corr    20% -- correlation with high-performing posts
            engagement      15% -- absolute engagement quality
            recency         15% -- newer trends score higher
            acceleration    10% -- trends gaining momentum score higher
        """
        velocity_score = _sigmoid(velocity * 2) * 100
        outlier_score = min(outlier_correlation * 100, 100)

        # Percentile rank of avg_engagement among all tracked items
        if all_engagements and len(all_engagements) > 1:
            below = sum(1 for e in all_engagements if e < avg_engagement)
            engagement_score = (below / len(all_engagements)) * 100
        else:
            engagement_score = 50.0

        # Exponential decay: newer = higher
        recency_score = math.exp(-recency_hours / 48) * 100

        acceleration_score = _sigmoid(acceleration * 5) * 100

        composite = (
            velocity_score * 0.40
            + outlier_score * 0.20
            + engagement_score * 0.15
            + recency_score * 0.15
            + acceleration_score * 0.10
        )

        return min(max(composite, 0), 100)

    def _classify_phase(self, velocity: float, acceleration: float,
                        snapshot_count: int) -> str:
        """Classify the trend's lifecycle phase."""
        if snapshot_count < 2:
            return "emerging"
        if velocity <= 0:
            return "declining"
        if velocity > 0.1 and acceleration < -0.05:
            return "peaking"
        return "rising"

    def _classify_signal_strength(self, composite_score: float,
                                   snapshot_count: int) -> str:
        """Human-readable signal strength."""
        if composite_score >= 70 and snapshot_count >= 3:
            return "strong"
        if composite_score >= 40:
            return "moderate"
        return "emerging"

    def _format_velocity(self, velocity: float) -> str:
        """Format velocity as a human-readable label."""
        # Convert per-hour to per-day for readability
        per_day = velocity * 24
        if per_day >= 1:
            return f"+{per_day * 100:.0f}%/day"
        elif velocity > 0:
            return f"+{velocity * 100:.1f}%/hr"
        elif velocity == 0:
            return "stable"
        else:
            per_day_neg = abs(per_day)
            return f"-{per_day_neg * 100:.0f}%/day"


def _sigmoid(x: float) -> float:
    """Standard sigmoid function, clamped for numerical stability."""
    x = max(min(x, 20), -20)
    return 1.0 / (1.0 + math.exp(-x))


def _parse_ts(ts_str: str) -> datetime:
    """Parse an ISO 8601 timestamp string to a UTC datetime."""
    ts_str = ts_str.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(ts_str)
    except ValueError:
        # Fallback: try without timezone
        dt = datetime.fromisoformat(ts_str.replace("+00:00", ""))
        return dt.replace(tzinfo=timezone.utc)
