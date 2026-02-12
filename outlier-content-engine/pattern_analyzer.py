"""
Pattern Analyzer - Detects content patterns from outlier posts.

Identifies:
- Content themes (educational, humor, product focus)
- Format patterns (reels, carousels, comparison posts)
- Engagement drivers (saves spike, high retention, viral shares)
- Hook types (question, shock value, curiosity gap)
"""

import sqlite3
from typing import List, Dict, Optional
from dataclasses import dataclass, asdict
from pathlib import Path
from collections import Counter
import config


@dataclass
class ContentPattern:
    """Represents a detected content pattern."""
    pattern_type: str  # "theme", "format", "driver", "hook"
    name: str  # "Educational Saves Spike", "Smoothie Format"
    description: str  # Explanation of the pattern
    metric: str  # "+350% Saves", "4.5x engagement"
    post_count: int  # Number of posts with this pattern
    example_posts: List[Dict]  # Sample posts demonstrating pattern

    def to_dict(self):
        return asdict(self)


@dataclass
class FranchisePattern:
    """Represents a recurring content franchise/series."""
    name: str  # "The 'Smoothie' Format"
    description: str  # What makes this format work
    retention_score: str  # "High Retention", "85% completion"
    post_count: int
    example_posts: List[Dict]

    def to_dict(self):
        return asdict(self)


class PatternAnalyzer:
    """Analyzes outlier posts to detect patterns and franchises."""

    def __init__(self, vertical_name: str):
        self.vertical_name = vertical_name
        self.db_path = config.DB_PATH

    def analyze_patterns(self) -> Dict:
        """
        Analyze outliers for this vertical and return detected patterns.

        Returns dict with:
        - patterns: List[ContentPattern]
        - franchises: List[FranchisePattern]
        - top_drivers: List[str]  # ['saves', 'shares', 'comments']
        - summary: str  # Overall analysis summary
        """
        if not self.db_path.exists():
            return {"patterns": [], "franchises": [], "top_drivers": [], "summary": "", "outlier_count": 0}

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get outlier posts for this vertical
        outliers = conn.execute("""
            SELECT post_id, competitor_name, competitor_handle, platform,
                   caption, media_type, media_url, posted_at, likes, comments,
                   saves, shares, views, outlier_score, content_tags,
                   weighted_engagement_score, primary_engagement_driver,
                   audio_id, audio_name
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1
            ORDER BY outlier_score DESC
        """, (self.vertical_name,)).fetchall()

        conn.close()

        if not outliers:
            return {
                "patterns": [],
                "franchises": [],
                "top_drivers": [],
                "summary": "No outlier posts found yet. Run an analysis first!",
                "outlier_count": 0
            }

        # Analyze engagement drivers
        drivers = Counter()
        for post in outliers:
            if post['primary_engagement_driver']:
                drivers[post['primary_engagement_driver']] += 1

        # Detect content patterns
        patterns = self._detect_content_patterns(outliers, drivers)

        # Detect franchises (recurring formats)
        franchises = self._detect_franchises(outliers)

        # Generate summary
        summary = self._generate_summary(len(outliers), patterns, drivers)

        return {
            "patterns": [p.to_dict() for p in patterns],
            "franchises": [f.to_dict() for f in franchises],
            "top_drivers": [driver for driver, _ in drivers.most_common(3)],
            "summary": summary,
            "outlier_count": len(outliers)
        }

    def _detect_content_patterns(self, outliers, drivers: Counter) -> List[ContentPattern]:
        """Detect patterns from outlier posts."""
        patterns = []

        # Pattern 1: Saves-driven content (if dominant)
        saves_posts = [p for p in outliers if p['primary_engagement_driver'] == 'saves' and p['saves']]
        if len(saves_posts) >= 2:  # Lowered threshold for testing
            avg_saves = sum(p['saves'] for p in saves_posts) / len(saves_posts)
            top_save_post = max(saves_posts, key=lambda p: p['saves'] or 0)

            patterns.append(ContentPattern(
                pattern_type="driver",
                name="Educational Saves Spike",
                description=f"Posts focused on valuable, save-worthy content. {len(saves_posts)} posts saw exceptional save rates.",
                metric=f"Avg {int(avg_saves)} saves",
                post_count=len(saves_posts),
                example_posts=[self._format_post(top_save_post)]
            ))

        # Pattern 2: Shares-driven (viral spread)
        shares_posts = [p for p in outliers if p['primary_engagement_driver'] == 'shares' and p['shares']]
        if len(shares_posts) >= 2:
            avg_shares = sum(p['shares'] for p in shares_posts) / len(shares_posts)
            top_share_post = max(shares_posts, key=lambda p: p['shares'] or 0)

            patterns.append(ContentPattern(
                pattern_type="driver",
                name="Viral Share Format",
                description=f"Content designed for maximum shareability. {len(shares_posts)} posts achieved viral spread.",
                metric=f"Avg {int(avg_shares)} shares",
                post_count=len(shares_posts),
                example_posts=[self._format_post(top_share_post)]
            ))

        # Pattern 3: High-engagement videos (if video outliers dominant)
        video_posts = [p for p in outliers if p['media_type'] in ['video', 'reel']]
        if len(video_posts) >= len(outliers) * 0.5:  # If 50%+ are videos
            patterns.append(ContentPattern(
                pattern_type="format",
                name="Video Dominance",
                description=f"Video content massively outperforms static posts. {len(video_posts)} of {len(outliers)} outliers are videos.",
                metric=f"{int(len(video_posts)/len(outliers)*100)}% video",
                post_count=len(video_posts),
                example_posts=[self._format_post(video_posts[0])]
            ))

        # Pattern 4: Comments-driven (conversation starters)
        comments_posts = [p for p in outliers if p['primary_engagement_driver'] == 'comments']
        if len(comments_posts) >= 2:
            avg_comments = sum(p['comments'] for p in comments_posts) / len(comments_posts)
            top_comment_post = max(comments_posts, key=lambda p: p['comments'] or 0)

            patterns.append(ContentPattern(
                pattern_type="driver",
                name="Conversation Starter",
                description=f"Posts that spark discussion and community engagement. {len(comments_posts)} posts drove exceptional comment activity.",
                metric=f"Avg {int(avg_comments)} comments",
                post_count=len(comments_posts),
                example_posts=[self._format_post(top_comment_post)]
            ))

        return patterns

    def _detect_franchises(self, outliers) -> List[FranchisePattern]:
        """Detect recurring content franchises/series."""
        franchises = []

        # Detect by content tags (if multiple posts share tags)
        tag_groups = {}
        for post in outliers:
            if post['content_tags']:
                try:
                    import json
                    tags = json.loads(post['content_tags']) if isinstance(post['content_tags'], str) else post['content_tags']
                    if tags and isinstance(tags, list):
                        primary_tag = tags[0]
                        if primary_tag not in tag_groups:
                            tag_groups[primary_tag] = []
                        tag_groups[primary_tag].append(post)
                except:
                    pass

        # Create franchise for tags with 2+ posts (lowered threshold)
        for tag, posts in tag_groups.items():
            if len(posts) >= 2:
                franchises.append(FranchisePattern(
                    name=f"The '{tag}' Series",
                    description=f"Recurring {tag.lower()} content format that consistently performs well.",
                    retention_score="High Retention",
                    post_count=len(posts),
                    example_posts=[self._format_post(posts[0])]
                ))

        return franchises

    def _generate_summary(self, outlier_count: int, patterns: List[ContentPattern], drivers: Counter) -> str:
        """Generate a natural language summary of findings."""
        if outlier_count == 0:
            return "No analysis data yet."

        summary = f"I found **{outlier_count} outlier posts** in the last analysis. "

        if drivers:
            top_driver = drivers.most_common(1)[0][0]
            summary += f"The main engagement driver is **{top_driver}** - "

            if top_driver == 'saves':
                summary += "your audience is saving content for later, which means it's valuable and educational."
            elif top_driver == 'shares':
                summary += "people are spreading this content, which means it's highly shareable and resonates emotionally."
            elif top_driver == 'comments':
                summary += "these posts spark conversation and community engagement."
            elif top_driver == 'views':
                summary += "view retention is strong, meaning the content hooks people immediately."
            else:
                summary += "likes are the primary engagement metric."

        if patterns:
            summary += f"\n\nI detected **{len(patterns)} key patterns** in what's working right now."

        return summary

    def _format_post(self, post) -> Dict:
        """Format post data for examples."""
        return {
            "post_id": post['post_id'],
            "handle": post['competitor_handle'],
            "platform": post['platform'],
            "caption": post['caption'][:100] + "..." if post['caption'] and len(post['caption']) > 100 else post['caption'],
            "outlier_score": post['outlier_score'],
            "media_url": post['media_url']
        }


def analyze_vertical_patterns(vertical_name: str) -> Dict:
    """Convenience function to analyze patterns for a vertical."""
    analyzer = PatternAnalyzer(vertical_name)
    return analyzer.analyze_patterns()
