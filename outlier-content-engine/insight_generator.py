"""
Insight Generator - Creates structured insights from pattern analysis for chat delivery.

Generates:
- Vertical-level insights (patterns, franchises, drivers)
- Per-post insights (why it worked, hook analysis, actionable lessons)
- Actionable recommendations for the user's own content strategy
"""

from typing import Dict, List
from pattern_analyzer import analyze_vertical_patterns


def generate_insights_for_vertical(vertical_name: str) -> Dict:
    """
    Generate structured insights from pattern analysis.

    Returns dict with formatted insights ready for chat and card delivery.
    """
    analysis = analyze_vertical_patterns(vertical_name)

    return {
        "has_insights": analysis['outlier_count'] > 0,
        "summary": analysis['summary'],
        "outlier_count": analysis['outlier_count'],
        "patterns": analysis['patterns'],
        "franchises": analysis['franchises'],
        "top_drivers": analysis['top_drivers'],
        "post_insights": analysis.get('post_insights', {}),
        "recommendations": analysis.get('recommendations', []),
    }


def format_insights_for_chat(insights: Dict) -> str:
    """Format insights as markdown for chat display."""
    if not insights['has_insights']:
        return "No insights yet - run an analysis first!"

    message = f"**Analysis Complete!**\n\n{insights['summary']}\n\n"

    # Patterns
    if insights['patterns']:
        message += "**KEY PATTERNS**\n\n"
        for pattern in insights['patterns'][:3]:
            message += f"**{pattern['name']}**\n"
            message += f"*{pattern['description']}*\n"
            message += f"{pattern['metric']} | {pattern['post_count']} posts\n"
            if pattern.get('actionable_takeaway'):
                message += f"Action: {pattern['actionable_takeaway']}\n"
            message += "\n"

    # Recommendations
    if insights.get('recommendations'):
        message += "**WHAT TO DO NEXT**\n\n"
        for rec in insights['recommendations'][:3]:
            message += f"**{rec['title']}**\n"
            message += f"*{rec['description']}*\n"
            for action in rec.get('actions', [])[:3]:
                message += f"  - {action}\n"
            message += "\n"

    # Franchises
    if insights['franchises']:
        message += "**CONTENT FRANCHISES**\n\n"
        for franchise in insights['franchises'][:2]:
            message += f"**{franchise['name']}**\n"
            message += f"*{franchise['description']}*\n"
            message += f"{franchise['retention_score']} | {franchise['post_count']} posts\n\n"

    return message


def get_post_insight_summary(post_id: str, insights: Dict) -> str:
    """Get a short insight summary for a specific post (for card display)."""
    post_insights = insights.get('post_insights', {})
    post = post_insights.get(post_id)

    if not post:
        return ""

    parts = []
    if post.get('why_it_worked'):
        parts.append(post['why_it_worked'][0])  # First reason
    if post.get('actionable_lesson'):
        parts.append(post['actionable_lesson'])

    return " ".join(parts)
