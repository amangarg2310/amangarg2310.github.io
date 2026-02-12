"""
Recommendation Engine - Generates specific post suggestions based on patterns.
"""

from typing import Dict, List
import openai
import config


def generate_recommendations(vertical_name: str, patterns: List[Dict], top_drivers: List[str]) -> List[Dict]:
    """
    Generate specific post recommendations based on detected patterns.

    Returns list of recommendation dicts with:
    - title: Recommendation name
    - description: Why this will work
    - action_item: Specific thing to do
    - hook_example: Example hook/opening
    """
    if not patterns:
        return []

    recommendations = []

    # Generate based on top engagement driver
    if top_drivers:
        driver = top_drivers[0]

        if driver == 'saves':
            recommendations.append({
                "title": "Educational Value Posts",
                "description": "Create tutorial-style content that people want to save for later reference.",
                "action_item": "Make a 'How To' or 'Tips' post",
                "hook_example": "Save this for later! Here's how to..."
            })

        elif driver == 'shares':
            recommendations.append({
                "title": "Relatable & Shareable",
                "description": "Content that people tag friends in or share to their stories.",
                "action_item": "Create a 'Tag someone who...' post",
                "hook_example": "Tag someone who needs to see this 😂"
            })

        elif driver == 'comments':
            recommendations.append({
                "title": "Ask Your Audience",
                "description": "Pose questions that spark discussion and opinions.",
                "action_item": "Create a poll or 'This or That' post",
                "hook_example": "What do you think? Comment below 👇"
            })

    return recommendations[:2]  # Return top 2


def format_recommendations_for_chat(recommendations: List[Dict]) -> str:
    """Format recommendations for chat display."""
    if not recommendations:
        return ""

    message = "**💡 RECOMMENDATIONS**\n\n"

    for rec in recommendations:
        message += f"**{rec['title']}**\n"
        message += f"*{rec['description']}*\n"
        message += f"✅ Action: {rec['action_item']}\n"
        message += f"💬 Hook: \"{rec['hook_example']}\"\n\n"

    return message
