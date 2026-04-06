"""Detect and surface expert disagreements within a domain."""

import json
import logging
import time
from typing import Optional

import anthropic

from config.settings import ANTHROPIC_API_KEY, PROMPTS_DIR_SYNTHESIS, PROCESSING_MODEL
from storage.vector_store import VectorStore

logger = logging.getLogger(__name__)


def detect_conflicts(
    domain: str,
    max_retries: int = 3,
) -> list[dict]:
    """Identify areas where experts disagree within a domain.

    Returns a list of conflict dicts with topic, side_a, side_b, synthesis.
    """
    store = VectorStore()
    insights = store.get_insights_by_domain(domain)

    if len(insights) < 2:
        logger.info(f"Not enough insights in {domain} to detect conflicts")
        return []

    # Prepare insights for the prompt
    clean_insights = []
    for i in insights:
        clean_insights.append({
            "title": i.get("title", ""),
            "content": i.get("content", ""),
            "expert_name": i.get("expert_name", ""),
            "insight_type": i.get("insight_type", ""),
            "sub_domain": i.get("sub_domain", ""),
        })

    prompt_template = (PROMPTS_DIR_SYNTHESIS / "detect_conflicts.txt").read_text()
    prompt = prompt_template.format(
        domain=domain,
        insights_json=json.dumps(clean_insights, indent=2),
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
            json_text = raw_text
            if "```json" in json_text:
                json_text = json_text.split("```json")[1].split("```")[0]
            elif "```" in json_text:
                json_text = json_text.split("```")[1].split("```")[0]

            conflicts = json.loads(json_text.strip())
            if not isinstance(conflicts, list):
                conflicts = [conflicts]

            logger.info(f"Detected {len(conflicts)} conflicts in {domain}")
            return conflicts

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error on conflict detection attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Rate limited, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))
            else:
                logger.error(f"Failed to detect conflicts: {e}")
                raise

    return []
