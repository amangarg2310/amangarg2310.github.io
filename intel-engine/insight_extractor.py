"""
Insight extraction — GPT extracts structured insights from transcript chunks.
"""

import json
import logging
import re
from openai import OpenAI

import config

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are an expert technical note-taker. Your job is to extract GRANULAR, SPECIFIC, ACTIONABLE knowledge from this content — the kind of detail someone would need to actually DO what's being described.

This could be from a video transcript, article, document, or notes. Capture the SPECIFICS, not just summaries:
- Exact tool names, versions, settings, configurations mentioned
- Step-by-step procedures (the actual steps, not "users can set up X")
- Specific commands, parameters, URLs, file paths, menu locations
- Concrete numbers, thresholds, recommended values
- Workarounds, gotchas, and "what NOT to do" warnings
- Specific examples and use cases described
- Comparisons between approaches (with the speaker's recommendation and WHY)

For each distinct insight, provide:
- title: A clear, specific title (5-12 words) — e.g. "Install OpenClaw via Docker on Mac" not "Installation Process"
- content: The FULL practical detail — include specific steps, exact names, config values, commands. Write as if someone needs to follow along without watching the video. Can be 3-8 sentences. Do NOT summarize vaguely — be specific.
- insight_type: One of: how_to, setup, config, workflow, tool, warning, comparison, tip, concept, troubleshooting
- actionability: One of: high (specific steps to follow), medium (needs adaptation), low (background knowledge)
- key_quote: The most useful direct quote from this section (if any)

CRITICAL: Prefer MORE insights with SPECIFIC detail over fewer insights with vague summaries.
Bad: "Users can set up daily briefs for topics of interest"
Good: "Set up a daily brief by creating a new task in OpenClaw with the prompt 'Research [topic] and summarize top 5 developments from the last 24h', set schedule to 7am daily, output to Telegram channel"

CONTENT CHUNK:
{chunk}

Return ONLY a JSON array, no markdown:
[{{"title": "...", "content": "...", "insight_type": "...", "actionability": "...", "key_quote": "..."}}]"""


def extract_insights(chunk: str, chunk_index: int = 0) -> list[dict]:
    """Extract structured insights from a transcript chunk using GPT."""
    api_key = config.get_api_key('openai')
    if not api_key:
        logger.error("OpenAI API key not configured")
        return []

    client = OpenAI(api_key=api_key)

    try:
        response = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You extract detailed, granular, actionable knowledge from content (transcripts, articles, documents, notes). Capture specifics — steps, commands, tool names, configurations, exact values. Return only valid JSON arrays."},
                {"role": "user", "content": EXTRACTION_PROMPT.format(chunk=chunk)},
            ],
            temperature=0.3,
            max_tokens=4000,
        )

        raw_content = response.choices[0].message.content.strip()
        insights = _parse_insights_json(raw_content, chunk_index)

        # Validate and filter insights
        valid = []
        for insight in insights:
            if not isinstance(insight, dict):
                continue
            if not insight.get('title') or not insight.get('content'):
                continue
            insight['chunk_index'] = chunk_index
            valid.append(insight)

        logger.info(f"Extracted {len(valid)} insights from chunk {chunk_index}")
        return valid

    except Exception as e:
        logger.error(f"Insight extraction failed for chunk {chunk_index}: {e}")
        return []


def _parse_insights_json(content: str, chunk_index: int) -> list:
    """Parse GPT response as JSON array with multiple fallback strategies."""
    # Strip markdown code fences
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    # Strategy 1: direct JSON parse
    try:
        result = json.loads(content)
        if isinstance(result, list):
            return result
        if isinstance(result, dict):
            return [result]  # Single insight, wrap in array
    except (json.JSONDecodeError, TypeError):
        pass

    # Strategy 2: regex extract JSON array
    match = re.search(r'\[.*\]', content, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, list):
                return result
        except (json.JSONDecodeError, TypeError):
            pass

    # Strategy 3: regex extract JSON object (single insight)
    match = re.search(r'\{.*\}', content, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group())
            if isinstance(result, dict):
                return [result]
        except (json.JSONDecodeError, TypeError):
            pass

    logger.warning(f"All JSON parse strategies failed for chunk {chunk_index}. Response: {content[:200]}...")
    return []
