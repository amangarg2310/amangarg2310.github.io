"""
Insight extraction — GPT extracts structured insights from transcript chunks.
"""

import json
import logging
from openai import OpenAI

import config

logger = logging.getLogger(__name__)

EXTRACTION_PROMPT = """You are an expert knowledge analyst. Extract structured insights from this transcript chunk.

For each distinct insight, provide:
- title: A clear, concise title (5-10 words)
- content: The full insight explained clearly (2-4 sentences)
- insight_type: One of: strategy, tactic, framework, case_study, principle, warning, tool, metric
- actionability: One of: high (immediately actionable), medium (needs context), low (theoretical)
- key_quote: The most impactful direct quote from this section (if any)

Return a JSON array of insights. Extract ALL meaningful insights.
If the transcript is casual/rambling, distill the core points.

TRANSCRIPT CHUNK:
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
                {"role": "system", "content": "You extract structured knowledge from transcripts. Return only valid JSON arrays."},
                {"role": "user", "content": EXTRACTION_PROMPT.format(chunk=chunk)},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        content = response.choices[0].message.content.strip()
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        insights = json.loads(content)
        for insight in insights:
            insight['chunk_index'] = chunk_index

        logger.info(f"Extracted {len(insights)} insights from chunk {chunk_index}")
        return insights

    except (json.JSONDecodeError, TypeError) as e:
        logger.warning(f"Failed to parse GPT response for chunk {chunk_index}: {e}")
        return []
    except Exception as e:
        logger.error(f"Insight extraction failed for chunk {chunk_index}: {e}")
        return []
