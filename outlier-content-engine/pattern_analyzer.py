"""
Pattern Analyzer - Detects content patterns from outlier posts.

Identifies:
- Content themes (educational, humor, product focus)
- Format patterns (reels, carousels, comparison posts)
- Engagement drivers (saves spike, high retention, viral shares)
- Hook types (question, shock value, curiosity gap)
- Per-post analysis: WHY each post performed and what to learn from it
"""

import json
import sqlite3
from typing import List, Dict
from dataclasses import dataclass, asdict
from collections import Counter
import config


@dataclass
class ContentPattern:
    """Represents a detected content pattern."""
    pattern_type: str  # "theme", "format", "driver", "hook"
    name: str
    description: str
    metric: str
    post_count: int
    example_posts: List[Dict]
    actionable_takeaway: str = ""

    def to_dict(self):
        return asdict(self)


@dataclass
class FranchisePattern:
    """Represents a recurring content franchise/series."""
    name: str
    description: str
    retention_score: str
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
        - top_drivers: List[str]
        - summary: str
        - post_insights: Dict[post_id -> insight_dict]
        - recommendations: List[Dict]
        """
        if not self.db_path.exists():
            return self._empty_result()

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

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
            return self._empty_result()

        drivers = Counter()
        for post in outliers:
            if post['primary_engagement_driver']:
                drivers[post['primary_engagement_driver']] += 1

        # Per-post deep analysis
        post_insights = {}
        for post in outliers:
            post_insights[post['post_id']] = self._analyze_single_post(post)

        patterns = self._detect_content_patterns(outliers, drivers)
        franchises = self._detect_franchises(outliers)
        recommendations = self._generate_recommendations(outliers, patterns, drivers)
        summary = self._generate_summary(len(outliers), patterns, drivers, recommendations)

        return {
            "patterns": [p.to_dict() for p in patterns],
            "franchises": [f.to_dict() for f in franchises],
            "top_drivers": [driver for driver, _ in drivers.most_common(3)],
            "summary": summary,
            "outlier_count": len(outliers),
            "post_insights": post_insights,
            "recommendations": recommendations,
        }

    def _analyze_single_post(self, post) -> Dict:
        """Deep analysis of a single outlier post — WHY it performed."""
        caption = post['caption'] or ""
        likes = post['likes'] or 0
        comments = post['comments'] or 0
        saves = post['saves'] or 0
        shares = post['shares'] or 0
        views = post['views'] or 0
        media_type = post['media_type'] or "image"
        driver = post['primary_engagement_driver'] or ""

        insight = {
            "why_it_worked": [],
            "hook_analysis": "",
            "visual_strategy": "",
            "messaging_style": "",
            "engagement_breakdown": {},
            "actionable_lesson": "",
        }

        # Hook Analysis
        hook = self._detect_hook_type(caption)
        insight["hook_analysis"] = hook

        # Visual Strategy
        visual_map = {
            'video': "Video/Reel — algorithmic boost and higher reach via discovery feeds.",
            'reel': "Video/Reel — algorithmic boost and higher reach via discovery feeds.",
            'carousel': "Carousel — drives saves and extended time-on-post. Each slide deepens engagement.",
        }
        insight["visual_strategy"] = visual_map.get(media_type, "Single image — immediate visual impact. Works best with strong imagery or typography.")

        # Messaging Style
        insight["messaging_style"] = self._analyze_messaging(caption)

        # Engagement Breakdown
        total = likes + comments + saves + shares
        if total > 0:
            insight["engagement_breakdown"] = {
                "likes_pct": round(likes / total * 100),
                "comments_pct": round(comments / total * 100),
                "saves_pct": round(saves / total * 100) if saves else 0,
                "shares_pct": round(shares / total * 100) if shares else 0,
            }

        # Why It Worked (composite reasons)
        reasons = []

        driver_reasons = {
            'saves': f"High save rate ({saves:,} saves) — content is valuable enough to bookmark. Signals educational or aspirational value.",
            'shares': f"Viral share velocity ({shares:,} shares) — people actively spread this. Signals emotional resonance or relatability.",
            'comments': f"Comment magnet ({comments:,} comments) — sparked real conversation. Signals opinion-provoking content.",
            'views': f"View retention ({views:,} views) — strong hook kept people watching. Effective opening 1-3 seconds.",
        }
        if driver in driver_reasons:
            reasons.append(driver_reasons[driver])

        if hook.get("type") and hook["type"] != "none":
            reasons.append(f"Hook: {hook['type']} — {hook['explanation']}")

        if media_type in ('video', 'reel') and views and likes:
            eng_rate = (likes + comments) / max(views, 1) * 100
            if eng_rate > 5:
                reasons.append(f"Strong view-to-engagement ratio ({eng_rate:.1f}%) — resonated beyond passive watching.")

        caption_len = len(caption)
        if caption_len > 300:
            reasons.append("Long-form caption (storytelling) — deepens emotional connection, drives saves.")
        elif 0 < caption_len < 50:
            reasons.append("Ultra-short caption — lets the visual speak. Works when imagery is strong.")

        insight["why_it_worked"] = reasons

        # Actionable Lesson
        lesson_parts = []
        if driver == 'saves':
            lesson_parts.append("Create save-worthy content: tutorials, guides, tips, or reference material")
        elif driver == 'shares':
            lesson_parts.append("Make shareable content: relatable moments, humor, or 'tag a friend' hooks")
        elif driver == 'comments':
            lesson_parts.append("Spark conversation: ask opinions, create debate, or use 'this or that' format")
        if media_type in ('video', 'reel'):
            lesson_parts.append("Use video format for reach")
        if hook.get("type") == "question":
            lesson_parts.append("Open with a question to stop the scroll")
        elif hook.get("type") == "curiosity_gap":
            lesson_parts.append("Use curiosity gaps in your hooks")

        if lesson_parts:
            insight["actionable_lesson"] = ". ".join(lesson_parts) + "."

        return insight

    def _detect_hook_type(self, caption: str) -> Dict:
        """Analyze the opening hook of a caption."""
        if not caption:
            return {"type": "none", "explanation": "No caption — visual-only post."}

        first_line = caption.split('\n')[0].strip()[:200]

        if '?' in first_line:
            return {"type": "question", "text": first_line,
                    "explanation": "Opens with a question — triggers curiosity and encourages comments."}

        if any(w in first_line.lower() for w in ['top', 'best', 'worst', '5 ', '3 ', '10 ', '7 ']):
            return {"type": "listicle", "text": first_line,
                    "explanation": "Number/list hook — clear promise of structured value. Drives saves."}

        if any(w in first_line.lower() for w in ['never', 'stop', "don't", 'warning', 'mistake', 'wrong', 'truth', 'secret', 'shocking']):
            return {"type": "curiosity_gap", "text": first_line,
                    "explanation": "Curiosity gap — creates tension that compels people to read/watch more."}

        if any(w in first_line.lower() for w in ['how to', 'how i', 'tutorial', 'step by step', 'guide', 'learn']):
            return {"type": "educational", "text": first_line,
                    "explanation": "Educational hook — promises practical value. Drives saves and shares."}

        if any(w in first_line.lower() for w in ['i just', 'i was', 'story time', 'so i', 'when i', 'this is']):
            return {"type": "story", "text": first_line,
                    "explanation": "Story hook — personal narrative pulls people in emotionally."}

        return {"type": "statement", "text": first_line,
                "explanation": "Direct statement — bold assertion that establishes authority."}

    def _analyze_messaging(self, caption: str) -> str:
        """Analyze the messaging style of a caption."""
        if not caption:
            return "No caption — relies purely on visual impact."

        length = len(caption)
        has_cta = any(w in caption.lower() for w in ['link in bio', 'shop now', 'tap', 'click', 'comment', 'save this', 'share'])
        has_hashtags = '#' in caption
        has_mentions = '@' in caption
        line_count = caption.count('\n') + 1

        parts = []
        if length < 50:
            parts.append("Minimal caption")
        elif length < 150:
            parts.append("Concise copy")
        elif length < 500:
            parts.append("Medium-length storytelling")
        else:
            parts.append("Long-form narrative")

        if has_cta:
            parts.append("includes a call-to-action")
        if has_hashtags:
            parts.append("uses hashtags for discovery")
        if has_mentions:
            parts.append("tags other accounts for reach")
        if line_count > 3:
            parts.append("uses line breaks for readability")

        return ". ".join(parts) + "."

    def _detect_content_patterns(self, outliers, drivers: Counter) -> List[ContentPattern]:
        """Detect patterns from outlier posts."""
        patterns = []

        saves_posts = [p for p in outliers if p['primary_engagement_driver'] == 'saves' and p['saves']]
        if len(saves_posts) >= 2:
            avg_saves = sum(p['saves'] for p in saves_posts) / len(saves_posts)
            top = max(saves_posts, key=lambda p: p['saves'] or 0)
            patterns.append(ContentPattern(
                pattern_type="driver", name="Save-Worthy Content",
                description=f"{len(saves_posts)} posts drove exceptional saves. Your audience bookmarks this — typically educational, aspirational, or reference material.",
                metric=f"Avg {int(avg_saves):,} saves", post_count=len(saves_posts),
                example_posts=[self._format_post(top)],
                actionable_takeaway="Create tutorial-style content, tips lists, or style guides. Add 'Save this for later' CTAs."
            ))

        shares_posts = [p for p in outliers if p['primary_engagement_driver'] == 'shares' and p['shares']]
        if len(shares_posts) >= 2:
            avg_shares = sum(p['shares'] for p in shares_posts) / len(shares_posts)
            top = max(shares_posts, key=lambda p: p['shares'] or 0)
            patterns.append(ContentPattern(
                pattern_type="driver", name="Viral Share Format",
                description=f"{len(shares_posts)} posts achieved exceptional shares. Shared content = free distribution.",
                metric=f"Avg {int(avg_shares):,} shares", post_count=len(shares_posts),
                example_posts=[self._format_post(top)],
                actionable_takeaway="Make content people send to friends: humor, relatable moments, 'tag someone who...' hooks."
            ))

        video_posts = [p for p in outliers if p['media_type'] in ['video', 'reel']]
        if len(video_posts) >= len(outliers) * 0.5 and len(video_posts) >= 3:
            patterns.append(ContentPattern(
                pattern_type="format", name="Video Dominance",
                description=f"{len(video_posts)} of {len(outliers)} outliers are video/reels. The algorithm favors video for discovery.",
                metric=f"{int(len(video_posts)/len(outliers)*100)}% video", post_count=len(video_posts),
                example_posts=[self._format_post(video_posts[0])],
                actionable_takeaway="Prioritize Reels/TikTok. Hook in 1-3 seconds. Use trending audio."
            ))

        comments_posts = [p for p in outliers if p['primary_engagement_driver'] == 'comments']
        if len(comments_posts) >= 2:
            avg_comments = sum(p['comments'] for p in comments_posts) / len(comments_posts)
            top = max(comments_posts, key=lambda p: p['comments'] or 0)
            patterns.append(ContentPattern(
                pattern_type="driver", name="Conversation Starters",
                description=f"{len(comments_posts)} posts sparked exceptional discussion. Comments boost algorithmic reach.",
                metric=f"Avg {int(avg_comments):,} comments", post_count=len(comments_posts),
                example_posts=[self._format_post(top)],
                actionable_takeaway="Ask questions, create debate, share hot takes, or use 'this or that' format."
            ))

        # Caption length pattern
        captioned = [p for p in outliers if p['caption']]
        long_cap = [p for p in captioned if len(p['caption']) > 300]
        short_cap = [p for p in captioned if len(p['caption']) < 80]

        if len(long_cap) > len(short_cap) and len(long_cap) >= 3:
            patterns.append(ContentPattern(
                pattern_type="theme", name="Long-Form Captions Win",
                description=f"{len(long_cap)} of {len(captioned)} captioned outliers use long-form storytelling (300+ chars). Story captions drive saves and comments.",
                metric=f"{len(long_cap)} long-form posts", post_count=len(long_cap),
                example_posts=[self._format_post(long_cap[0])],
                actionable_takeaway="Write longer, story-driven captions. Share context, narratives, or detailed explanations."
            ))
        elif len(short_cap) > len(long_cap) and len(short_cap) >= 3:
            patterns.append(ContentPattern(
                pattern_type="theme", name="Punchy Short Captions",
                description=f"{len(short_cap)} outliers use ultra-short captions. Brevity lets strong visuals speak.",
                metric=f"{len(short_cap)} minimal captions", post_count=len(short_cap),
                example_posts=[self._format_post(short_cap[0])],
                actionable_takeaway="Let visuals do the heavy lifting. Use one-liners or bold statements."
            ))

        return patterns

    def _detect_franchises(self, outliers) -> List[FranchisePattern]:
        """Detect recurring content franchises/series."""
        franchises = []
        tag_groups = {}

        for post in outliers:
            if post['content_tags']:
                try:
                    tags = json.loads(post['content_tags']) if isinstance(post['content_tags'], str) else post['content_tags']
                    if tags and isinstance(tags, list):
                        primary_tag = tags[0]
                        tag_groups.setdefault(primary_tag, []).append(post)
                except Exception:
                    pass

        for tag, posts in tag_groups.items():
            if len(posts) >= 2:
                brands = len(set(p['competitor_handle'] for p in posts))
                franchises.append(FranchisePattern(
                    name=f"The '{tag}' Series",
                    description=f"Recurring {tag.lower()} format that consistently performs across {brands} brand{'s' if brands > 1 else ''}.",
                    retention_score="High Retention", post_count=len(posts),
                    example_posts=[self._format_post(posts[0])]
                ))

        return franchises

    def _generate_recommendations(self, outliers, patterns: List[ContentPattern], drivers: Counter) -> List[Dict]:
        """Generate specific, actionable recommendations."""
        recs = []
        if not outliers:
            return recs

        if drivers:
            top_driver, count = drivers.most_common(1)[0]
            driver_recs = {
                'saves': {
                    "title": "Create Save-Worthy Content",
                    "description": f"{count} of your competitors' top posts are saves-driven. Your audience wants content worth bookmarking.",
                    "actions": ["Post a 'how to' guide or tutorial", "Create a checklist or tips carousel", "Add 'Save this for later' CTA"]
                },
                'shares': {
                    "title": "Make Shareable Content",
                    "description": f"{count} top posts went viral through shares. Shared content = free distribution.",
                    "actions": ["Create relatable content people tag friends in", "Try humor or meme-style content", "Use 'send this to someone who...' hooks"]
                },
                'comments': {
                    "title": "Spark More Conversation",
                    "description": f"{count} top posts are comment magnets. Comments boost algorithmic distribution.",
                    "actions": ["End captions with a compelling question", "Post opinion-provoking content", "Try 'this or that' or poll-style content"]
                },
            }
            if top_driver in driver_recs:
                recs.append({"priority": "high", **driver_recs[top_driver]})

        video_count = sum(1 for p in outliers if p['media_type'] in ['video', 'reel'])
        if video_count > len(outliers) * 0.6:
            recs.append({
                "priority": "high", "title": "Double Down on Video",
                "description": f"{video_count} of {len(outliers)} outliers are video. The algorithm rewards video with 2-3x reach.",
                "actions": ["Post 3-4 Reels/TikToks per week", "Hook viewers in first 1-3 seconds", "Use trending audio for discovery"]
            })

        comp_counts = Counter(p['competitor_handle'] for p in outliers)
        if comp_counts:
            top_comp, comp_count = comp_counts.most_common(1)[0]
            if comp_count >= 3:
                recs.append({
                    "priority": "medium", "title": f"Study @{top_comp}'s Playbook",
                    "description": f"@{top_comp} has {comp_count} outlier posts — the most in your set. Their strategy is resonating.",
                    "actions": [f"Analyze @{top_comp}'s posting frequency", "Note their visual style and caption tone", "Identify formats you can adapt"]
                })

        return recs

    def _generate_summary(self, outlier_count: int, patterns: List[ContentPattern],
                          drivers: Counter, recommendations: List[Dict]) -> str:
        """Generate a natural language summary."""
        if outlier_count == 0:
            return "No analysis data yet."

        summary = f"I found **{outlier_count} outlier posts** in your competitive set. "

        if drivers:
            top_driver = drivers.most_common(1)[0][0]
            explanations = {
                'saves': "people are bookmarking this content — focus on creating save-worthy material.",
                'shares': "content is going viral through sharing — focus on emotionally resonant content.",
                'comments': "posts are sparking conversation — focus on opinion-provoking content.",
                'views': "view retention is strong — focus on your opening 1-3 seconds.",
                'likes': "broad appeal content is performing — focus on visually striking posts.",
            }
            summary += f"The dominant driver is **{top_driver}** — " + explanations.get(top_driver, "this metric leads engagement.")

        if patterns:
            summary += f"\n\nI detected **{len(patterns)} key patterns** in what's working."
        if recommendations:
            summary += f" Here are **{len(recommendations)} recommendations** for your next posts."

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

    def _empty_result(self) -> Dict:
        return {
            "patterns": [], "franchises": [], "top_drivers": [],
            "summary": "No outlier posts found yet. Run an analysis first!",
            "outlier_count": 0, "post_insights": {}, "recommendations": [],
        }


def analyze_vertical_patterns(vertical_name: str) -> Dict:
    """Convenience function to analyze patterns for a vertical."""
    analyzer = PatternAnalyzer(vertical_name)
    return analyzer.analyze_patterns()
