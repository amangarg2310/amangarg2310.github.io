"""
Insight Generator - Creates structured insights from pattern analysis for chat delivery.
"""

from typing import Dict, List
from pattern_analyzer import analyze_vertical_patterns


def generate_insights_for_vertical(vertical_name: str) -> Dict:
    """
    Generate structured insights from pattern analysis.

    Returns dict with formatted insights ready for chat delivery.
    """
    analysis = analyze_vertical_patterns(vertical_name)

    insights = {
        "has_insights": analysis['outlier_count'] > 0,
        "summary": analysis['summary'],
        "outlier_count": analysis['outlier_count'],
        "patterns": analysis['patterns'],
        "franchises": analysis['franchises'],
        "top_drivers": analysis['top_drivers']
    }

    return insights


def format_insights_for_chat(insights: Dict) -> str:
    """Format insights as markdown for chat display."""
    if not insights['has_insights']:
        return "No insights yet - run an analysis first!"

    message = f"**Analysis Complete!** 🎯\n\n{insights['summary']}\n\n"

    # Add pattern cards
    if insights['patterns']:
        message += "**📊 KEY PATTERNS**\n\n"
        for pattern in insights['patterns'][:3]:  # Show top 3
            message += f"**PATTERN: {pattern['name']}**\n"
            message += f"*{pattern['description']}*\n"
            message += f"📈 {pattern['metric']} | {pattern['post_count']} posts\n\n"

    # Add franchises
    if insights['franchises']:
        message += "**🎬 CONTENT FRANCHISES**\n\n"
        for franchise in insights['franchises'][:2]:  # Show top 2
            message += f"**FRANCHISE: {franchise['name']}**\n"
            message += f"*{franchise['description']}*\n"
            message += f"🔥 {franchise['retention_score']} | {franchise['post_count']} posts\n\n"

    message += "**View all outliers on the Outliers page** →"

    return message
