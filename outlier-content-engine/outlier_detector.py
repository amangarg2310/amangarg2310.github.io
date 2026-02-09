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
# Saves and shares indicate high intent; likes are low-effort.
ENGAGEMENT_WEIGHTS = {
    "saves": 4,
    "shares": 3,
    "comments": 2,
    "likes": 1,
    "views": 0.5,
}


def calculate_weighted_engagement(likes: int, comments: int,
                                  saves: int, shares: int,
                                  views: int = 0) -> float:
    """Weighted engagement score — intent-heavy actions count more."""
    return (
        likes * ENGAGEMENT_WEIGHTS["likes"] +
        comments * ENGAGEMENT_WEIGHTS["comments"] +
        saves * ENGAGEMENT_WEIGHTS["saves"] +
        shares * ENGAGEMENT_WEIGHTS["shares"] +
        views * ENGAGEMENT_WEIGHTS["views"]
    )


def get_primary_driver(likes: int, comments: int,
                       saves: int, shares: int,
                       views: int = 0) -> str:
    """Return the engagement type contributing most weighted value."""
    contributions = {
        "likes": likes * ENGAGEMENT_WEIGHTS["likes"],
        "comments": comments * ENGAGEMENT_WEIGHTS["comments"],
        "saves": saves * ENGAGEMENT_WEIGHTS["saves"],
        "shares": shares * ENGAGEMENT_WEIGHTS["shares"],
        "views": views * ENGAGEMENT_WEIGHTS["views"],
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
        Run outlier detection across all competitors.

        Returns:
            Tuple of (list of outlier posts sorted by score, dict of baselines)
        """
        logger.info("Running outlier detection...")
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        baselines = {}
        all_outliers = []

        competitors = self.profile.get_competitor_handles("instagram")
        for comp in competitors:
            handle = comp["handle"]
            name = comp["name"]

            baseline = self._compute_baseline(conn, handle, name)
            if baseline is None:
                logger.warning(
                    f"  Skipping @{handle}: not enough data for baseline "
                    f"(need {self.thresholds.lookback_days} days of posts)"
                )
                continue

            baselines[handle] = baseline
            outliers = self._find_outliers(conn, handle, name, baseline)
            all_outliers.extend(outliers)

            logger.info(
                f"  @{handle}: {baseline.post_count} posts, "
                f"mean engagement {baseline.mean_engagement:.0f}, "
                f"found {len(outliers)} outliers"
            )

        # Sort by outlier score descending
        all_outliers.sort(key=lambda x: x.outlier_score, reverse=True)

        # Update the database with outlier flags
        self._update_outlier_flags(conn, all_outliers)

        conn.close()
        logger.info(f"Total outliers found: {len(all_outliers)}")
        return all_outliers, baselines

    def _compute_baseline(self, conn: sqlite3.Connection,
                          handle: str, name: str) -> Optional[CompetitorBaseline]:
        """Calculate engagement baseline for a competitor."""
        cutoff = (
            datetime.now(timezone.utc) -
            timedelta(days=self.thresholds.lookback_days)
        ).isoformat()

        rows = conn.execute("""
            SELECT likes, comments, saves, shares, views
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
            total = calculate_weighted_engagement(likes, comms, saves, shares, views)
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
                       baseline: CompetitorBaseline) -> List[OutlierPost]:
        """Identify outlier posts for a single competitor."""
        rows = conn.execute("""
            SELECT post_id, competitor_handle, competitor_name, platform,
                   caption, media_type, media_url, posted_at,
                   likes, comments, saves, shares, views
            FROM competitor_posts
            WHERE competitor_handle = ?
              AND brand_profile = ?
              AND COALESCE(is_own_channel, 0) = 0
            ORDER BY collected_at DESC
        """, (handle, self.profile.profile_name)).fetchall()

        outliers = []

        for row in rows:
            likes = row["likes"] or 0
            comms = row["comments"] or 0
            saves = row["saves"] or 0
            shares = row["shares"] or 0
            views = row["views"] or 0
            total_engagement = likes + comms + saves + shares
            weighted_eng = calculate_weighted_engagement(
                likes, comms, saves, shares, views
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

            # Check if this post qualifies as an outlier
            is_outlier = (
                engagement_multiplier >= self.thresholds.engagement_multiplier
                or std_devs_above >= self.thresholds.std_dev_threshold
            )

            if not is_outlier:
                continue

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

            post_url = f"https://www.instagram.com/p/{row['post_id']}/"

            outliers.append(OutlierPost(
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
                    likes, comms, saves, shares, views
                ),
                content_tags=content_tags,
            ))

        return outliers

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
        """Update the database with outlier flags and scores."""
        # Reset all outlier flags for this profile
        conn.execute("""
            UPDATE competitor_posts
            SET is_outlier = 0, outlier_score = NULL, content_tags = NULL,
                weighted_engagement_score = NULL, primary_engagement_driver = NULL
            WHERE brand_profile = ?
        """, (self.profile.profile_name,))

        # Set flags for detected outliers
        for outlier in outliers:
            conn.execute("""
                UPDATE competitor_posts
                SET is_outlier = 1,
                    outlier_score = ?,
                    content_tags = ?,
                    weighted_engagement_score = ?,
                    primary_engagement_driver = ?
                WHERE post_id = ?
                  AND brand_profile = ?
            """, (
                outlier.outlier_score,
                json.dumps(outlier.content_tags),
                outlier.weighted_engagement,
                outlier.primary_engagement_driver,
                outlier.post_id,
                self.profile.profile_name,
            ))

        conn.commit()
