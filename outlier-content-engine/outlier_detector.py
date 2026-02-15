"""
Outlier Detector — identifies posts that significantly outperform.

Uses statistical analysis (mean/stdev) to flag posts that are
unusual relative to each competitor's own baseline. This approach
normalizes across different-sized accounts automatically.

Thresholds are read from the active brand profile, not hardcoded.
"""

import json
import logging
import re
import sqlite3
import statistics
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Optional, Tuple

import config
from profile_loader import BrandProfile, OutlierSettings, ContentTags

logger = logging.getLogger(__name__)

# ── Engagement Weights ──
# Platform-aware: Instagram lacks saves (private) and shares are spotty.
# TikTok returns all metrics. Weights adapt so the formula stays useful.
PLATFORM_WEIGHTS = {
    "tiktok": {
        "saves": 4,
        "shares": 3,
        "comments": 2,
        "likes": 1,
        "views": 0.5,
    },
    "instagram": {
        # saves=0 weight (always null from public API)
        # shares get moderate weight (only available on Reels)
        # comments promoted as the top signal
        "saves": 0,
        "shares": 2,
        "comments": 3,
        "likes": 1,
        "views": 0.5,
    },
    "facebook": {
        # Shares are king on Facebook (algorithmic reach amplifier)
        # Comments indicate genuine discussion
        # Saves not publicly available
        "saves": 0,
        "shares": 4,
        "comments": 3,
        "likes": 1,
        "views": 0.5,
    },
}

# Default fallback (used for unknown platforms)
DEFAULT_WEIGHTS = PLATFORM_WEIGHTS["instagram"]

# ── Per-Platform Outlier Thresholds ──
# Each platform has different engagement dynamics, so one-size-fits-all
# thresholds misfire:
#   - TikTok: Algorithm-driven. FYP can spike any post 10-50x overnight.
#     A 2x multiplier is noise, not signal. Need higher bar.
#   - Instagram: Follower-graph dependent. 2x is a genuine breakout.
#     Comments/saves are high-intent signals worth less filtering.
#   - Facebook: Shares drive algorithmic reach, but base audience is stable.
#     Between IG and TikTok in volatility.
#
# Values: (engagement_multiplier, std_dev_threshold, soft_multiplier, soft_std_devs)
#   - engagement_multiplier: strict pass minimum (how many X above brand mean)
#   - std_dev_threshold: strict pass std devs above mean
#   - soft_multiplier: soft floor for pass-2 (minimum representation)
#   - soft_std_devs: soft floor std devs for pass-2
PLATFORM_THRESHOLDS = {
    "instagram": {
        "engagement_multiplier": 2.0,
        "std_dev_threshold": 1.5,
        "soft_multiplier": 1.2,
        "soft_std_devs": 0.5,
    },
    "tiktok": {
        "engagement_multiplier": 3.5,   # Higher bar — FYP volatility
        "std_dev_threshold": 2.0,       # Need stronger statistical signal
        "soft_multiplier": 2.0,         # Even the soft floor is higher
        "soft_std_devs": 1.0,
    },
    "facebook": {
        "engagement_multiplier": 2.5,   # Moderate — share-driven spikes
        "std_dev_threshold": 1.5,
        "soft_multiplier": 1.5,
        "soft_std_devs": 0.5,
    },
}

DEFAULT_PLATFORM_THRESHOLDS = PLATFORM_THRESHOLDS["instagram"]


def get_weights(platform: str = "instagram") -> dict:
    """Return the weight dict for a given platform."""
    return PLATFORM_WEIGHTS.get(platform, DEFAULT_WEIGHTS)


def calculate_weighted_engagement(likes: int, comments: int,
                                  saves: int, shares: int,
                                  views: int = 0,
                                  platform: str = "instagram") -> float:
    """Weighted engagement score — adapts weights per platform."""
    w = get_weights(platform)
    return (
        likes * w["likes"] +
        comments * w["comments"] +
        saves * w["saves"] +
        shares * w["shares"] +
        views * w["views"]
    )


def get_primary_driver(likes: int, comments: int,
                       saves: int, shares: int,
                       views: int = 0,
                       platform: str = "instagram") -> str:
    """Return the engagement type contributing most weighted value."""
    w = get_weights(platform)
    contributions = {
        "likes": likes * w["likes"],
        "comments": comments * w["comments"],
        "saves": saves * w["saves"],
        "shares": shares * w["shares"],
        "views": views * w["views"],
    }
    return max(contributions, key=contributions.get)


@dataclass
class CompetitorBaseline:
    """Engagement baseline stats for a single competitor."""
    handle: str
    name: str
    post_count: int
    mean_likes: float
    mean_comments: float
    mean_engagement: float  # likes + comments combined
    std_engagement: float
    median_engagement: float


@dataclass
class OutlierPost:
    """A post flagged as an outlier with scoring details."""
    post_id: str
    competitor_handle: str
    competitor_name: str
    platform: str
    caption: Optional[str]
    media_type: str
    post_url: str
    posted_at: Optional[str]
    likes: int
    comments: int
    saves: Optional[int]
    shares: Optional[int]
    views: Optional[int]
    total_engagement: int
    engagement_multiplier: float  # how many X above mean
    std_devs_above: float         # how many sigma above mean
    outlier_score: float          # composite ranking score
    weighted_engagement: float = 0.0
    primary_engagement_driver: str = ""
    content_tags: List[str] = field(default_factory=list)


class OutlierDetector:
    """
    Detects outlier posts across all competitors in the active profile.

    Process:
    1. Compute per-competitor engagement baselines
    2. Flag posts exceeding configured thresholds
    3. Rank outliers by composite score
    4. Tag content with keyword-based categories
    """

    def __init__(self, profile: BrandProfile, db_path=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH
        self.thresholds = profile.get_outlier_thresholds()
        self.content_tags = profile.get_content_tags()

    def detect(self) -> Tuple[List[OutlierPost], Dict[str, CompetitorBaseline]]:
        """
        Run dual-window outlier detection across all competitors.

        Computes outliers for both 30-day and 3-month windows, flags each
        post with which window(s) it qualifies in, and returns the union.

        Returns:
            Tuple of (list of outlier posts sorted by score, dict of baselines from 30d window)
        """
        logger.info("Running dual-window outlier detection (30d + 3mo)...")
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Detect outliers for both windows
        outliers_30d, baselines_30d = self._detect_for_window(conn, lookback_days=30)
        outliers_3mo, baselines_3mo = self._detect_for_window(conn, lookback_days=90)

        logger.info(f"  30d window: {len(outliers_30d)} outliers")
        logger.info(f"  3mo window: {len(outliers_3mo)} outliers")

        # Build per-post window map: post_id -> set of windows
        post_windows = {}
        for o in outliers_30d:
            post_windows.setdefault(o.post_id, set()).add("30d")
        for o in outliers_3mo:
            post_windows.setdefault(o.post_id, set()).add("3mo")

        # Merge into a single list (use the higher score if in both windows)
        merged = {}
        for o in outliers_30d + outliers_3mo:
            if o.post_id not in merged or o.outlier_score > merged[o.post_id].outlier_score:
                merged[o.post_id] = o

        all_outliers = sorted(merged.values(), key=lambda x: x.outlier_score, reverse=True)

        # Update DB with outlier flags and window info
        self._update_outlier_flags_dual(conn, all_outliers, post_windows)

        conn.close()
        logger.info(f"Total unique outliers: {len(all_outliers)}")
        return all_outliers, baselines_30d

    def _detect_for_window(self, conn: sqlite3.Connection,
                           lookback_days: int) -> Tuple[List[OutlierPost], Dict[str, CompetitorBaseline]]:
        """
        Run outlier detection for a specific lookback window.

        Returns:
            Tuple of (outlier list, baselines dict) for this window.
        """
        baselines = {}
        all_outliers = []

        # Collect competitors from all supported platforms
        seen_handles = set()
        combined = []
        for platform in ("instagram", "tiktok", "facebook"):
            for comp in self.profile.get_competitor_handles(platform):
                if comp["handle"] not in seen_handles:
                    combined.append(comp)
                    seen_handles.add(comp["handle"])

        for comp in combined:
            handle = comp["handle"]
            name = comp["name"]

            baseline = self._compute_baseline(conn, handle, name,
                                              lookback_days=lookback_days)
            if baseline is None:
                continue

            baselines[handle] = baseline
            outliers = self._find_outliers(conn, handle, name, baseline,
                                          lookback_days=lookback_days)
            all_outliers.extend(outliers)

        all_outliers.sort(key=lambda x: x.outlier_score, reverse=True)
        return all_outliers, baselines

    def _compute_baseline(self, conn: sqlite3.Connection,
                          handle: str, name: str,
                          lookback_days: int = None) -> Optional[CompetitorBaseline]:
        """Calculate engagement baseline for a competitor within a lookback window."""
        days = lookback_days or self.thresholds.lookback_days
        cutoff = (
            datetime.now(timezone.utc) -
            timedelta(days=days)
        ).isoformat()

        rows = conn.execute("""
            SELECT likes, comments, saves, shares, views, platform
            FROM competitor_posts
            WHERE competitor_handle = ?
              AND brand_profile = ?
              AND collected_at >= ?
              AND COALESCE(is_own_channel, 0) = 0
        """, (handle, self.profile.profile_name, cutoff)).fetchall()

        if len(rows) < 3:
            # Need at least 3 data points for meaningful statistics
            return None

        engagements = []
        likes_list = []
        comments_list = []

        for row in rows:
            likes = row["likes"] or 0
            comms = row["comments"] or 0
            saves = row["saves"] or 0
            shares = row["shares"] or 0
            views = row["views"] or 0
            platform = row["platform"] or "instagram"
            total = calculate_weighted_engagement(
                likes, comms, saves, shares, views, platform=platform
            )
            engagements.append(total)
            likes_list.append(likes)
            comments_list.append(comms)

        mean_eng = statistics.mean(engagements)
        std_eng = statistics.stdev(engagements) if len(engagements) > 1 else 0

        return CompetitorBaseline(
            handle=handle,
            name=name,
            post_count=len(rows),
            mean_likes=statistics.mean(likes_list),
            mean_comments=statistics.mean(comments_list),
            mean_engagement=mean_eng,
            std_engagement=std_eng,
            median_engagement=statistics.median(engagements),
        )

    def _find_outliers(self, conn: sqlite3.Connection,
                       handle: str, name: str,
                       baseline: CompetitorBaseline,
                       lookback_days: int = None) -> List[OutlierPost]:
        """Identify outlier posts for a single competitor within a lookback window.

        Uses two-pass detection with per-platform thresholds:
          Pass 1: Apply platform-specific strict thresholds (e.g., TikTok 3.5x vs IG 2.0x)
          Pass 2: If brand has <2 outliers, take top posts above a softer floor
                  to ensure minimum brand representation (at least 2 posts per brand).

        Platform-aware: TikTok gets higher thresholds because FYP algorithm
        creates higher natural variance; Instagram thresholds are lower because
        engagement is more follower-graph-dependent and predictable.
        """
        days = lookback_days or self.thresholds.lookback_days
        cutoff = (
            datetime.now(timezone.utc) -
            timedelta(days=days)
        ).isoformat()

        rows = conn.execute("""
            SELECT post_id, competitor_handle, competitor_name, platform,
                   caption, media_type, media_url, posted_at,
                   likes, comments, saves, shares, views
            FROM competitor_posts
            WHERE competitor_handle = ?
              AND brand_profile = ?
              AND COALESCE(is_own_channel, 0) = 0
              AND collected_at >= ?
            ORDER BY collected_at DESC
        """, (handle, self.profile.profile_name, cutoff)).fetchall()

        # Detect dominant platform for this handle's posts
        platform_counts = {}
        for row in rows:
            p = row["platform"] or "instagram"
            platform_counts[p] = platform_counts.get(p, 0) + 1
        dominant_platform = max(platform_counts, key=platform_counts.get) if platform_counts else "instagram"

        # Get platform-specific thresholds (fall back to profile defaults for unknown)
        pt = PLATFORM_THRESHOLDS.get(dominant_platform, DEFAULT_PLATFORM_THRESHOLDS)
        min_multiplier = pt["engagement_multiplier"]
        min_std_devs = pt["std_dev_threshold"]
        soft_multiplier = pt["soft_multiplier"]
        soft_std_devs = pt["soft_std_devs"]
        min_outliers_per_brand = 2

        logger.debug(
            f"  {handle} ({dominant_platform}): thresholds "
            f"{min_multiplier}x / {min_std_devs}σ "
            f"(soft: {soft_multiplier}x / {soft_std_devs}σ)"
        )

        # Collect all candidates with their metrics
        candidates = []

        for row in rows:
            likes = row["likes"] or 0
            comms = row["comments"] or 0
            saves = row["saves"] or 0
            shares = row["shares"] or 0
            views = row["views"] or 0
            platform = row["platform"] or "instagram"
            total_engagement = likes + comms + saves + shares
            weighted_eng = calculate_weighted_engagement(
                likes, comms, saves, shares, views, platform=platform
            )

            # Skip if baseline mean is 0 (avoid division by zero)
            if baseline.mean_engagement == 0:
                continue

            engagement_multiplier = weighted_eng / baseline.mean_engagement

            # Calculate standard deviations above mean (using weighted)
            if baseline.std_engagement > 0:
                std_devs_above = (
                    (weighted_eng - baseline.mean_engagement) /
                    baseline.std_engagement
                )
            else:
                std_devs_above = 0.0

            # Composite score: weight multiplier more (intuitive in reports)
            outlier_score = (
                0.6 * engagement_multiplier +
                0.4 * max(std_devs_above, 0)
            )

            # Tag the content
            caption = row["caption"] or ""
            content_tags = self._tag_content(
                caption, row["media_type"] or ""
            )

            if platform == "tiktok":
                post_url = f"https://www.tiktok.com/@{handle}/video/{row['post_id']}"
            elif platform == "facebook":
                post_url = f"https://www.facebook.com/{handle}/posts/{row['post_id']}"
            else:
                post_url = f"https://www.instagram.com/p/{row['post_id']}/"

            post = OutlierPost(
                post_id=row["post_id"],
                competitor_handle=handle,
                competitor_name=name,
                platform=row["platform"] or "instagram",
                caption=caption,
                media_type=row["media_type"] or "image",
                post_url=post_url,
                posted_at=row["posted_at"],
                likes=likes,
                comments=comms,
                saves=row["saves"],
                shares=row["shares"],
                views=row["views"],
                total_engagement=total_engagement,
                engagement_multiplier=round(engagement_multiplier, 2),
                std_devs_above=round(std_devs_above, 2),
                outlier_score=round(outlier_score, 2),
                weighted_engagement=round(weighted_eng, 2),
                primary_engagement_driver=get_primary_driver(
                    likes, comms, saves, shares, views,
                    platform=platform,
                ),
                content_tags=content_tags,
            )
            candidates.append(post)

        # ── Two-Pass Outlier Selection ──

        # Pass 1 (strict): Apply configured thresholds
        strong_outliers = [
            p for p in candidates
            if p.engagement_multiplier >= min_multiplier
            and p.std_devs_above >= min_std_devs
        ]

        # Pass 2 (min-representation): Ensure at least 2 outliers per brand
        if len(strong_outliers) < min_outliers_per_brand and len(candidates) >= 3:
            strong_ids = {p.post_id for p in strong_outliers}
            # Pick top posts above the soft floor that weren't already selected
            remaining = [
                p for p in candidates
                if p.post_id not in strong_ids
                and p.engagement_multiplier >= soft_multiplier
                and p.std_devs_above >= soft_std_devs
            ]
            remaining.sort(key=lambda x: x.outlier_score, reverse=True)
            needed = min_outliers_per_brand - len(strong_outliers)
            strong_outliers.extend(remaining[:needed])

        return strong_outliers

    def _tag_content(self, caption: str, media_type: str) -> List[str]:
        """
        Simple keyword-based content tagging from caption text.
        This is a fast heuristic pass — the LLM does deeper analysis later.
        """
        tags = []
        caption_lower = caption.lower()

        # Tag by format
        if media_type:
            tags.append(f"format:{media_type}")

        # Caption length category
        word_count = len(caption.split())
        if word_count < 50:
            tags.append("caption:short")
        elif word_count < 150:
            tags.append("caption:medium")
        else:
            tags.append("caption:long")

        # Match against profile's content themes using keywords
        theme_keywords = {
            "drop announcement": ["drop", "dropping", "available now",
                                  "out now", "releasing", "launch", "new arrival"],
            "styling": ["style", "styling", "outfit", "wear", "fit",
                        "look", "how to wear"],
            "culture/nostalgia": ["culture", "nostalgia", "heritage",
                                  "roots", "history", "classic", "vintage",
                                  "throwback", "memory"],
            "brand story": ["story", "journey", "founded", "mission",
                            "our story", "why we", "beginning"],
            "collaboration": ["collab", "collaboration", "x ", " x ",
                              "featuring", "feat.", "partner"],
            "behind the scenes": ["behind the scenes", "bts", "making of",
                                  "process", "studio", "workshop"],
        }

        for theme, keywords in theme_keywords.items():
            if any(kw in caption_lower for kw in keywords):
                tags.append(f"theme:{theme}")

        # Hook type detection
        if caption.strip().endswith("?") or "?" in caption[:100]:
            tags.append("hook:question")
        if caption.strip().startswith(("The ", "This ", "Every ", "We ")):
            tags.append("hook:statement")
        if any(w in caption_lower[:50] for w in ["meet ", "introducing", "new"]):
            tags.append("hook:product_showcase")

        return tags

    def _update_outlier_flags(self, conn: sqlite3.Connection,
                              outliers: List[OutlierPost]) -> None:
        """Update the database with outlier flags and scores (legacy single-window)."""
        self._update_outlier_flags_dual(
            conn, outliers,
            {o.post_id: {"30d"} for o in outliers}
        )

    def _update_outlier_flags_dual(self, conn: sqlite3.Connection,
                                   outliers: List[OutlierPost],
                                   post_windows: Dict[str, set]) -> None:
        """Update the database with outlier flags, scores, and timeframe windows."""
        # Reset all outlier flags for this profile
        conn.execute("""
            UPDATE competitor_posts
            SET is_outlier = 0, outlier_score = NULL, content_tags = NULL,
                weighted_engagement_score = NULL, primary_engagement_driver = NULL,
                outlier_timeframe = NULL
            WHERE brand_profile = ?
        """, (self.profile.profile_name,))

        # Set flags for detected outliers
        for outlier in outliers:
            windows = post_windows.get(outlier.post_id, set())
            if "30d" in windows and "3mo" in windows:
                timeframe = "both"
            elif "30d" in windows:
                timeframe = "30d"
            else:
                timeframe = "3mo"

            conn.execute("""
                UPDATE competitor_posts
                SET is_outlier = 1,
                    outlier_score = ?,
                    content_tags = ?,
                    weighted_engagement_score = ?,
                    primary_engagement_driver = ?,
                    outlier_timeframe = ?
                WHERE post_id = ?
                  AND brand_profile = ?
            """, (
                outlier.outlier_score,
                json.dumps(outlier.content_tags),
                outlier.weighted_engagement,
                outlier.primary_engagement_driver,
                timeframe,
                outlier.post_id,
                self.profile.profile_name,
            ))

        conn.commit()
