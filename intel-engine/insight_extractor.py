"""
Insight extraction — OpenAI GPT-4o-mini extracts structured insights from transcript chunks.

Uses GPT-4o-mini for high-volume extraction with generous rate limits.
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
- evidence: The supporting reasoning, data, or experience the source provided for this claim (1-2 sentences). What makes this credible?
- source_context: Brief context of who is speaking and why — e.g. "SaaS founder discussing scaling experience" or "Google engineer demoing new API"
- confidence: One of: stated (explicitly claimed), demonstrated (shown working), speculative (opinion/prediction), anecdotal (personal story)
- topics: Array of 1-3 specific topic tags for this insight — e.g. ["docker", "installation", "mac"]

CRITICAL: Prefer MORE insights with SPECIFIC detail over fewer insights with vague summaries.
Bad: "Users can set up daily briefs for topics of interest"
Good: "Set up a daily brief by creating a new task in OpenClaw with the prompt 'Research [topic] and summarize top 5 developments from the last 24h', set schedule to 7am daily, output to Telegram channel"

CONTENT CHUNK:
{chunk}

Return ONLY a JSON array, no markdown:
[{{"title": "...", "content": "...", "insight_type": "...", "actionability": "...", "key_quote": "...", "evidence": "...", "source_context": "...", "confidence": "...", "topics": ["...", "..."]}}]"""


def extract_insights(chunk: str, chunk_index: int = 0, errors: list = None) -> list[dict]:
    """Extract structured insights from a transcript chunk using OpenAI GPT-4o-mini.

    Retries up to 3 times with exponential backoff on failure.

    Args:
        errors: Optional list that receives per-chunk error dicts on failure.
                Each dict has 'chunk', 'error', and optionally 'response_preview'.
    """
    import time as _time

    api_key = config.get_api_key('openai')
    if not api_key:
        logger.error("OpenAI API key not configured")
        if errors is not None:
            errors.append({'chunk': chunk_index, 'error': 'OpenAI API key not configured'})
        return []

    client = OpenAI(api_key=api_key)
    import random as _random
    max_retries = 3

    for attempt in range(max_retries + 1):
        try:
            call_start = _time.time()
            with config.api_semaphore:
                response = client.chat.completions.create(
                    model=config.OPENAI_MODEL,
                    messages=[
                        {"role": "system", "content": "You extract detailed, granular, actionable knowledge from content (transcripts, articles, documents, notes). Capture specifics — steps, commands, tool names, configurations, exact values. Return only valid JSON arrays."},
                        {"role": "user", "content": EXTRACTION_PROMPT.format(chunk=chunk)},
                    ],
                    temperature=config.OPENAI_TEMPERATURE,
                    max_tokens=config.OPENAI_MAX_TOKENS,
                    timeout=120,
                )
            call_elapsed = _time.time() - call_start

            raw_content = response.choices[0].message.content.strip()
            finish_reason = response.choices[0].finish_reason  # 'stop' or 'length'
            if finish_reason == 'length':
                logger.warning(f"Chunk {chunk_index}: response truncated by max_tokens — attempting recovery")
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

            # Track when API succeeded but produced no valid insights
            if not valid and errors is not None:
                if not insights:
                    truncation_note = ' (response was TRUNCATED by max_tokens)' if finish_reason == 'length' else ''
                    errors.append({'chunk': chunk_index,
                                   'error': f'JSON parse failed or empty response{truncation_note}',
                                   'response_preview': raw_content[:300]})
                else:
                    errors.append({'chunk': chunk_index, 'error': f'All {len(insights)} parsed items failed validation'})

            logger.info(f"Chunk {chunk_index}: extracted {len(valid)} insights in {call_elapsed:.1f}s (attempt {attempt+1})")
            return valid

        except Exception as e:
            error_str = str(e)
            if attempt < max_retries:
                # Longer backoff for rate limits, shorter for other errors
                if '429' in error_str or 'rate' in error_str.lower() or 'overloaded' in error_str.lower():
                    wait = min(30, 5 * (2 ** attempt))  # 5s, 10s, 20s
                    logger.warning(f"Chunk {chunk_index}: rate limited (429), retrying in {wait:.1f}s (attempt {attempt+1}/{max_retries+1})")
                else:
                    wait = 2 ** (attempt + 1)  # 2s, 4s, 8s
                    logger.warning(f"Chunk {chunk_index}: {type(e).__name__}, retrying in {wait:.1f}s (attempt {attempt+1}/{max_retries+1})")
                wait += _random.uniform(0, 2)  # Jitter to prevent thundering herd
                _time.sleep(wait)
            else:
                logger.error(f"Chunk {chunk_index}: FAILED after {max_retries+1} attempts — {e}")
                if errors is not None:
                    errors.append({'chunk': chunk_index, 'error': f'API error after {max_retries + 1} attempts: {e}'})
                return []


def _parse_insights_json(content: str, chunk_index: int) -> list:
    """Parse GPT response as JSON array with multiple fallback strategies.

    Handles: clean JSON, markdown-fenced JSON, truncated responses (max_tokens exceeded).
    """
    # Strip markdown code fences (```json ... ``` or ``` ... ```)
    if content.startswith("```"):
        # Remove opening fence line (```json or ```)
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        # Remove closing fence if present (may be absent if truncated)
        if content.rstrip().endswith("```"):
            content = content.rstrip()[:-3]
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

    # Strategy 4: Truncation recovery — response was cut off by max_tokens.
    # Find the last complete JSON object and close the array.
    # Look for pattern: }, followed by optional whitespace, then incomplete object or EOF
    last_complete = content.rfind("}")
    if last_complete > 0 and "[" in content:
        candidate = content[:last_complete + 1].rstrip().rstrip(",") + "]"
        # Make sure it starts with [
        bracket_pos = candidate.find("[")
        if bracket_pos >= 0:
            candidate = candidate[bracket_pos:]
            try:
                result = json.loads(candidate)
                if isinstance(result, list) and len(result) > 0:
                    logger.info(f"Truncation recovery: salvaged {len(result)} insights from chunk {chunk_index}")
                    return result
            except (json.JSONDecodeError, TypeError):
                pass

    logger.warning(f"All JSON parse strategies failed for chunk {chunk_index}. Response: {content[:200]}...")
    return []
