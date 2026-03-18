"""Extract structured insights from transcript chunks using Claude API."""

import json
import logging
import time
from pathlib import Path
from typing import Optional

import anthropic

from config.settings import ANTHROPIC_API_KEY, PROCESSING_MODEL, PROMPTS_DIR_PROCESSING

logger = logging.getLogger(__name__)


def _load_prompt(name: str) -> str:
    """Load a prompt template from the prompts directory."""
    path = PROMPTS_DIR_PROCESSING / name
    return path.read_text()


def extract_insights(
    chunk_text: str,
    expert_name: str = "Unknown",
    channel_name: str = "Unknown",
    video_title: str = "",
    max_retries: int = 3,
) -> list[dict]:
    """Send a transcript chunk to Claude and extract structured insights.

    Returns a list of insight dicts.
    """
    prompt_template = _load_prompt("extract_insights.txt")
    prompt = prompt_template.format(
        expert_name=expert_name,
        channel_name=channel_name,
        video_title=video_title,
        transcript_chunk=chunk_text,
    )

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=PROCESSING_MODEL,
                max_tokens=4096,
                messages=[{"role": "user", "content": prompt}],
            )

            raw_text = response.content[0].text

            # Parse JSON from response (handle markdown code blocks)
            json_text = raw_text
            if "```json" in json_text:
                json_text = json_text.split("```json")[1].split("```")[0]
            elif "```" in json_text:
                json_text = json_text.split("```")[1].split("```")[0]

            insights = json.loads(json_text.strip())

            if not isinstance(insights, list):
                insights = [insights]

            logger.info(f"Extracted {len(insights)} insights from chunk")
            return insights

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error on attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))
            else:
                logger.error(f"Failed to parse insights after {max_retries} attempts")
                return []

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Rate limited, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Retry {attempt + 1}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to extract insights: {e}")
                raise


def process_video_chunks(
    chunks: list[dict],
    expert_name: str = "Unknown",
    channel_name: str = "Unknown",
    video_title: str = "",
    video_id: str = "",
    source_url: str = "",
    rate_limit_delay: float = 1.0,
) -> list[dict]:
    """Process all chunks from a video, adding source metadata to each insight."""
    all_insights = []

    for chunk in chunks:
        insights = extract_insights(
            chunk_text=chunk["text"],
            expert_name=expert_name,
            channel_name=channel_name,
            video_title=video_title,
        )

        for insight in insights:
            insight["source_video_id"] = video_id
            insight["source_url"] = source_url
            insight["source_title"] = video_title
            insight["expert_name"] = expert_name
            insight["expert_channel"] = channel_name
            if "start_time" in chunk:
                mins = int(chunk["start_time"] // 60)
                secs = int(chunk["start_time"] % 60)
                insight["timestamp_start"] = f"{mins:02d}:{secs:02d}"
            if "end_time" in chunk:
                mins = int(chunk["end_time"] // 60)
                secs = int(chunk["end_time"] % 60)
                insight["timestamp_end"] = f"{mins:02d}:{secs:02d}"

        all_insights.extend(insights)
        time.sleep(rate_limit_delay)

    logger.info(f"Extracted {len(all_insights)} total insights from {len(chunks)} chunks")
    return all_insights
