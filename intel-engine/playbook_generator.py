"""
Strategic Playbook Generator — transforms domain knowledge into actionable plans.

Works for ANY vertical: business, cooking, fitness, gardening, music, etc.
Adapts language, metrics, and recommendations to match the domain's subject matter.
"""

import json
import logging
from openai import OpenAI
import config

logger = logging.getLogger(__name__)

PLAYBOOK_PROMPT = """You are a world-class strategic advisor. Create an actionable playbook from the knowledge below.

DOMAIN: {domain_name}
USER'S GOAL: {goal}
EXPERIENCE LEVEL: {experience}
FORMAT: {format_type}
CONSTRAINTS: {constraints}

DOMAIN SYNTHESIS (high-level overview):
{synthesis}

CONVERGENCE DATA (what multiple sources agree/disagree on):
{convergence}

KEY INSIGHTS ({insight_count} total, ranked by actionability):
{insights}

RULES:
1. Adapt your language to match this domain. A cooking playbook uses kitchen language. A fitness playbook uses training language. A coding playbook uses technical language. NEVER impose business jargon on non-business domains.
2. Every recommendation MUST cite its source: [Source: Title by Channel]
3. When multiple sources agree on a recommendation, mark it: ✓ Validated (N sources)
4. Single-source recommendations get lighter treatment: "Suggested by [Source]"
5. Include specific details from the insights: exact quantities, tool names, settings, steps
6. The "Mistakes to Avoid" section should pull from warning-type insights
7. Estimate realistic time and resources for each step
8. For safety-adjacent domains (fitness, nutrition, DIY, electrical), add an appropriate disclaimer
9. Format as clean markdown with clear section headers

GENERATE THE PLAYBOOK WITH THESE SECTIONS:

## Your {format_type}
(subtitle based on user's goal)

### At a Glance
2-3 sentences: what this playbook covers, expected outcome, confidence level based on source count

### What You'll Need
Equipment, tools, software, ingredients, or resources mentioned across the insights. Group by priority (essential vs nice-to-have).

### The Plan
{format_instructions}

### Quick Wins
2-3 things the user can do TODAY, right now, with zero setup. Pull from high-actionability insights.

### Mistakes to Avoid
Pull from warning/troubleshooting insights. What do sources say NOT to do?

### Where Sources Disagree
If convergence data shows disagreements, present both sides so the user can decide.

### Confidence Level
State how many sources informed this playbook and what the convergence looks like.
"This playbook draws from N sources. X recommendations are validated by multiple sources."
"""

FORMAT_INSTRUCTIONS = {
    'steps': "Numbered steps (5-7), each with: what to do, why (citing source), time estimate, success indicator. Order from first to last.",
    'weekly': "Weekly plan (4-8 weeks). Each week: focus area, specific actions, what done looks like. Build progressively from foundations to advanced.",
    'checklist': "Two sections: Get Ready (everything to acquire/set up) and Execute (ordered checklist of actions). Each item is specific and completable.",
    'decision': "Options comparison. For each option: pros, cons, best for, source citations. End with a recommendation based on the stated goal and constraints.",
    'learning': "Learning path from beginner to advanced. Phases (3-4), each with: concepts to learn, practice exercises, you are ready to move on when milestones.",
    'custom': "Follow the described format as closely as possible.",
}


def generate_playbook(domain_name: str, goal: str, experience: str, format_type: str,
                      constraints: str, synthesis_content: str, convergence_data: dict,
                      insights: list, source_count: int) -> str:
    """Generate a strategic playbook from domain knowledge.
    
    Args:
        domain_name: Name of the domain
        goal: User's stated goal
        experience: Experience level (beginner/some/intermediate/advanced/teaching)
        format_type: Playbook format (steps/weekly/checklist/decision/learning/custom)
        constraints: User's constraints (budget, time, tools, etc.)
        synthesis_content: Domain synthesis text
        convergence_data: Dict with agreements/disagreements
        insights: List of insight dicts (title, content, evidence, source_title, channel, etc.)
        source_count: Number of sources in the domain
    
    Returns:
        Markdown string of the generated playbook
    """
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    # Format convergence data
    conv_text = "No convergence data yet (need more sources for cross-validation)."
    if convergence_data:
        parts = []
        for a in convergence_data.get('agreements', []):
            parts.append(f"✓ AGREED: {a.get('claim', '')} (Sources: {', '.join(a.get('sources', []))})")
        for d in convergence_data.get('disagreements', []):
            views = d.get('views', [])
            view_text = ' vs '.join(f"{v.get('source','')}: {v.get('position','')}" for v in views)
            parts.append(f"⚡ DIFFER on {d.get('topic','')}: {view_text}")
        if parts:
            conv_text = "\n".join(parts)

    # Format insights — prioritize high-actionability, include evidence
    sorted_insights = sorted(insights, key=lambda x: (
        {'high': 3, 'medium': 2, 'low': 1}.get(x.get('actionability', 'medium'), 2),
    ), reverse=True)[:40]  # Cap at 40 to stay within token limits

    insight_lines = []
    for i, ins in enumerate(sorted_insights):
        source_label = ins.get('source_title', 'Unknown')
        channel = ins.get('channel', '')
        if channel and channel != source_label:
            source_label = f"{source_label} by {channel}"
        
        line = f"{i+1}. [{ins.get('insight_type', 'general')}] {ins.get('title', '')}: {ins.get('content', '')}"
        if ins.get('evidence'):
            line += f"\n   Evidence: {ins['evidence']}"
        line += f"\n   [Source: {source_label}] (actionability: {ins.get('actionability', 'medium')}, confidence: {ins.get('confidence', 'stated')})"
        insight_lines.append(line)

    insights_text = "\n\n".join(insight_lines) if insight_lines else "No insights available."

    # Get format-specific instructions
    format_instructions = FORMAT_INSTRUCTIONS.get(format_type, FORMAT_INSTRUCTIONS['steps'])

    # Build the prompt
    prompt = PLAYBOOK_PROMPT.format(
        domain_name=domain_name,
        goal=goal or f"Master {domain_name}",
        experience=experience or "some experience",
        format_type=format_type.replace('_', ' ').title() if format_type != 'custom' else 'Custom Format',
        constraints=constraints or "None specified",
        synthesis=synthesis_content[:3000] if synthesis_content else "No synthesis available yet.",
        convergence=conv_text,
        insights=insights_text,
        insight_count=len(sorted_insights),
        format_instructions=format_instructions,
    )

    client = OpenAI(api_key=api_key)

    response = config.rate_limited_call(
        client.chat.completions.create,
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You create actionable, source-cited playbooks from synthesized knowledge. Adapt your language to match the domain — never use business jargon for non-business topics. Be specific and practical."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.3,
        max_tokens=4000,
        timeout=90,
    )

    return response.choices[0].message.content.strip()
