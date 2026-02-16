"""
Insight Generator - Creates a consolidated competitive intelligence report.

Synthesizes:
- AI per-post analysis (hook breakdowns, visual strategy, emotional triggers)
- Statistical patterns (engagement drivers, format dominance)
- Cross-cutting themes across multiple outlier posts
- Specific, actionable playbook items derived from real post data

Instead of fragmented pattern cards, produces ONE coherent report.
"""

import json
import sqlite3
from typing import Dict, List
from collections import Counter

import config
from pattern_analyzer import analyze_vertical_patterns


def generate_insights_for_vertical(vertical_name: str) -> Dict:
    """
    Generate a consolidated competitive intelligence report.

    Combines template-based pattern analysis with AI per-post analysis
    to produce cross-cutting macro insights.
    """
    analysis = analyze_vertical_patterns(vertical_name)

    if analysis['outlier_count'] == 0:
        return {
            "has_insights": False,
            "summary": "No outlier posts found yet. Run an analysis first!",
            "outlier_count": 0,
            "report_sections": [],
            "post_insights": {},
            "recommendations": [],
            # Keep legacy fields for backward compat
            "patterns": [],
            "franchises": [],
            "top_drivers": [],
        }

    # Gather AI-analyzed posts from DB for deeper synthesis
    ai_posts = _get_ai_analyzed_posts(vertical_name)

    # Synthesize cross-cutting insights from AI analysis
    report_sections = _build_report_sections(
        ai_posts=ai_posts,
        patterns=analysis['patterns'],
        franchises=analysis['franchises'],
        drivers=analysis['top_drivers'],
        outlier_count=analysis['outlier_count'],
        recommendations=analysis.get('recommendations', []),
    )

    summary = _build_executive_summary(
        ai_posts, analysis['outlier_count'], analysis['top_drivers']
    )

    return {
        "has_insights": True,
        "summary": summary,
        "outlier_count": analysis['outlier_count'],
        "report_sections": report_sections,
        "post_insights": analysis.get('post_insights', {}),
        "recommendations": analysis.get('recommendations', []),
        # Legacy fields
        "patterns": analysis['patterns'],
        "franchises": analysis['franchises'],
        "top_drivers": analysis['top_drivers'],
    }


def _get_ai_analyzed_posts(vertical_name: str) -> List[Dict]:
    """Fetch posts that have AI analysis stored."""
    try:
        conn = sqlite3.connect(str(config.DB_PATH))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT post_id, competitor_handle, platform, caption, media_type,
                   likes, comments, saves, shares, views,
                   outlier_score, primary_engagement_driver, ai_analysis
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1 AND ai_analysis IS NOT NULL
                  AND COALESCE(archived, 0) = 0
            ORDER BY outlier_score DESC
            LIMIT 30
        """, (vertical_name,)).fetchall()
        conn.close()

        posts = []
        for row in rows:
            try:
                ai = json.loads(row['ai_analysis']) if row['ai_analysis'] else {}
            except (json.JSONDecodeError, TypeError):
                ai = {}
            posts.append({**dict(row), "ai": ai})
        return posts
    except Exception:
        return []


def _build_executive_summary(ai_posts: List[Dict], outlier_count: int,
                              top_drivers: List[str]) -> str:
    """Build a concise executive summary paragraph."""
    summary = f"I found **{outlier_count} outlier posts** in your competitive set."

    if ai_posts:
        # Extract the most common content patterns from AI analysis
        patterns = Counter()
        hooks = Counter()
        for p in ai_posts:
            ai = p.get("ai", {})
            if ai.get("content_pattern"):
                patterns[ai["content_pattern"]] += 1
            if ai.get("hook_type"):
                hooks[ai["hook_type"]] += 1

        if patterns:
            top_pattern, top_count = patterns.most_common(1)[0]
            summary += f" The dominant format is **{top_pattern}** ({top_count} posts)."

        if top_drivers:
            driver_label = top_drivers[0]
            driver_explain = {
                'saves': "bookmarking content worth returning to",
                'shares': "spreading content to friends and followers",
                'comments': "sparking real conversation",
                'views': "strong hooks driving watch-through",
                'likes': "broad visual appeal",
            }
            summary += f" The top engagement driver is **{driver_label}** — {driver_explain.get(driver_label, 'leading metric')}."
    elif top_drivers:
        summary += f" Top engagement driver: **{top_drivers[0]}**."

    return summary


def _build_report_sections(ai_posts: List[Dict], patterns: List[Dict],
                            franchises: List[Dict], drivers: List[str],
                            outlier_count: int, recommendations: List[Dict]) -> List[Dict]:
    """
    Build consolidated report sections from AI analysis + pattern data.

    Returns a list of sections, each with title, content lines, and optional examples.
    """
    sections = []

    # ── Section 1: What's winning — synthesize content patterns from AI ──
    if ai_posts:
        content_patterns = Counter()
        hook_types = Counter()
        emotional_triggers = Counter()
        visual_strategies = []

        for p in ai_posts:
            ai = p.get("ai", {})
            if ai.get("content_pattern"):
                content_patterns[ai["content_pattern"]] += 1
            if ai.get("hook_type"):
                hook_types[ai["hook_type"]] += 1
            if ai.get("emotional_trigger"):
                # Normalize to short label
                trigger = ai["emotional_trigger"]
                # Take first phrase before " — " or " - " for grouping
                short = trigger.split(" — ")[0].split(" - ")[0].strip().lower()
                if len(short) < 50:
                    emotional_triggers[short] += 1
            if ai.get("visual_strategy"):
                visual_strategies.append({
                    "handle": p.get("competitor_handle", ""),
                    "strategy": ai["visual_strategy"][:200],
                })

        if content_patterns:
            lines = []
            for pattern_name, count in content_patterns.most_common(5):
                # Find an example post for this pattern
                example = next(
                    (p for p in ai_posts if p.get("ai", {}).get("content_pattern") == pattern_name),
                    None
                )
                example_note = ""
                if example:
                    handle = example.get("competitor_handle", "")
                    score = example.get("outlier_score", 0)
                    example_note = f" (e.g. @{handle}, score {score:.1f})"
                lines.append(f"**{pattern_name}** — {count} post{'s' if count > 1 else ''}{example_note}")

            sections.append({
                "title": "Winning Content Formats",
                "icon": "formats",
                "lines": lines,
            })

        if hook_types:
            hook_labels = {
                'question': 'Question hooks — open with a question to stop the scroll',
                'curiosity_gap': 'Curiosity gaps — create tension that compels reading/watching',
                'shock': 'Shock/controversy — bold claims that demand attention',
                'educational': 'Educational hooks — promise practical value upfront',
                'story': 'Story hooks — personal narratives that pull in emotionally',
                'statement': 'Bold statements — authoritative assertions',
                'hot_take': 'Hot takes — opinion-led, debate-provoking',
                'pov': 'POV framing — first-person perspective',
            }
            lines = []
            for hook, count in hook_types.most_common(4):
                label = hook_labels.get(hook, hook.replace('_', ' ').title())
                lines.append(f"**{label}** — {count} post{'s' if count > 1 else ''}")
            sections.append({
                "title": "Hook Strategies That Work",
                "icon": "hooks",
                "lines": lines,
            })

        if emotional_triggers and len(emotional_triggers) >= 2:
            lines = []
            for trigger, count in emotional_triggers.most_common(4):
                lines.append(f"**{trigger.title()}** — {count} post{'s' if count > 1 else ''}")
            sections.append({
                "title": "Psychological Triggers",
                "icon": "psychology",
                "lines": lines,
            })

    # ── Section 2: Engagement driver breakdown from stats ──
    if patterns:
        driver_patterns = [p for p in patterns if p.get('pattern_type') == 'driver']
        format_patterns = [p for p in patterns if p.get('pattern_type') in ('format', 'theme')]

        if driver_patterns:
            lines = []
            for dp in driver_patterns[:3]:
                lines.append(f"**{dp['name']}** ({dp['metric']}) — {dp['description']}")
                if dp.get('actionable_takeaway'):
                    lines.append(f"  → {dp['actionable_takeaway']}")
            sections.append({
                "title": "Engagement Drivers",
                "icon": "drivers",
                "lines": lines,
            })

        if format_patterns:
            lines = [f"**{p['name']}** ({p['metric']}) — {p['description']}" for p in format_patterns[:2]]
            sections.append({
                "title": "Format & Style Patterns",
                "icon": "formats",
                "lines": lines,
            })

    # ── Section 3: Actionable playbook ──
    if recommendations:
        lines = []
        for rec in recommendations[:3]:
            priority_label = "🔴" if rec.get('priority') == 'high' else "🟡"
            lines.append(f"{priority_label} **{rec['title']}**")
            lines.append(f"  {rec['description']}")
            for action in rec.get('actions', [])[:3]:
                lines.append(f"  • {action}")
        sections.append({
            "title": "Your Playbook",
            "icon": "playbook",
            "lines": lines,
        })

    # ── Section 4: Specific creative briefs (top 3 from AI) ──
    briefs = []
    for p in ai_posts[:3]:
        ai = p.get("ai", {})
        brief = ai.get("brand_creative_brief", {})
        if brief and brief.get("one_line_summary"):
            briefs.append({
                "source_handle": p.get("competitor_handle", ""),
                "source_pattern": ai.get("content_pattern", ""),
                "concept": brief.get("one_line_summary", ""),
                "hook_line": brief.get("hook_line", ""),
                "format": brief.get("format", ""),
                "why": brief.get("why_this_works_for_us", ""),
                "fit_score": brief.get("brand_fit_score"),
            })

    if briefs:
        lines = []
        for i, b in enumerate(briefs, 1):
            lines.append(f"**{i}. {b['concept']}**")
            if b.get("source_handle"):
                lines.append(f"  Inspired by @{b['source_handle']}'s {b.get('source_pattern', 'post')}")
            if b.get("hook_line"):
                lines.append(f'  Hook: "{b["hook_line"]}"')
            if b.get("format"):
                lines.append(f"  Format: {b['format']}")
            if b.get("why"):
                lines.append(f"  Why: {b['why'][:150]}")
        sections.append({
            "title": "Content Ideas for You",
            "icon": "ideas",
            "lines": lines,
        })

    return sections


def format_insights_for_chat(insights: Dict) -> str:
    """Format insights as markdown for chat display."""
    if not insights.get('has_insights'):
        return "No insights yet - run an analysis first!"

    message = f"{insights['summary']}\n\n"

    for section in insights.get('report_sections', []):
        message += f"**{section['title'].upper()}**\n\n"
        for line in section.get('lines', []):
            message += f"{line}\n"
        message += "\n"

    return message


def get_post_insight_summary(post_id: str, insights: Dict) -> str:
    """Get a short insight summary for a specific post (for card display)."""
    post_insights = insights.get('post_insights', {})
    post = post_insights.get(post_id)

    if not post:
        return ""

    parts = []
    if post.get('why_it_worked'):
        parts.append(post['why_it_worked'][0])
    if post.get('actionable_lesson'):
        parts.append(post['actionable_lesson'])

    return " ".join(parts)
