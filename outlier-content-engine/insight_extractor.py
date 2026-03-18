"""
Insight extraction — uses GPT to extract structured insights from transcript chunks.

Each chunk is sent to GPT-4o-mini with a prompt that extracts:
- Key insights with titles and content
- Insight type classification
- Actionability rating
- Notable quotes
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

Return a JSON array of insights. Extract ALL meaningful insights — don't skip anything valuable.
If the transcript is casual/rambling, distill the core points being made.

TRANSCRIPT CHUNK:
{chunk}

Return ONLY a JSON array, no markdown formatting:
[{{"title": "...", "content": "...", "insight_type": "...", "actionability": "...", "key_quote": "..."}}]"""


def extract_insights(chunk: str, chunk_index: int = 0) -> list[dict]:
    """
    Extract structured insights from a transcript chunk using GPT.

    Args:
        chunk: Text chunk from transcript
        chunk_index: Position of this chunk in the full transcript

    Returns:
        List of insight dicts with title, content, insight_type, actionability, key_quote
    """
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
        # Clean up markdown code blocks if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        insights = json.loads(content)

        # Add chunk_index to each insight
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
