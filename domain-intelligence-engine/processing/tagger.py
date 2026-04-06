"""Assign domain buckets and metadata tags to insights."""

import json
import logging
import time
from pathlib import Path
from typing import Optional

import anthropic
import yaml

from config.settings import ANTHROPIC_API_KEY, CONFIG_DIR, PROCESSING_MODEL, PROMPTS_DIR_PROCESSING

logger = logging.getLogger(__name__)


def load_domains() -> dict:
    """Load domain definitions from domains.yaml."""
    with open(CONFIG_DIR / "domains.yaml") as f:
        return yaml.safe_load(f)["domains"]


def tag_insights(
    insights: list[dict],
    max_retries: int = 3,
) -> list[dict]:
    """Tag a batch of insights with domain and sub_domain using Claude.

    Modifies insights in-place and returns them.
    """
    domains = load_domains()

    domain_descriptions = "\n".join(
        f"- {key}: {val['name']} — {val['description']} (sub-domains: {', '.join(val['sub_domains'])})"
        for key, val in domains.items()
    )

    prompt_template = (PROMPTS_DIR_PROCESSING / "tag_domain.txt").read_text()

    insights_for_tagging = [
        {"index": i, "title": ins.get("title", ""), "content": ins.get("content", "")}
        for i, ins in enumerate(insights)
    ]

    prompt = prompt_template.format(
        domain_descriptions=domain_descriptions,
        insights_json=json.dumps(insights_for_tagging, indent=2),
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

            tags = json.loads(json_text.strip())

            if not isinstance(tags, list):
                tags = [tags]

            for tag_entry in tags:
                idx = tag_entry.get("index", -1)
                if 0 <= idx < len(insights):
                    insights[idx]["domain"] = tag_entry.get("domain", "")
                    insights[idx]["sub_domain"] = tag_entry.get("sub_domain", "")
                    if "tags" in tag_entry:
                        existing_tags = insights[idx].get("tags", [])
                        insights[idx]["tags"] = list(set(existing_tags + tag_entry["tags"]))

            logger.info(f"Tagged {len(tags)} insights with domains")
            return insights

        except json.JSONDecodeError as e:
            logger.warning(f"JSON parse error on tagging attempt {attempt + 1}: {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Rate limited during tagging, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** (attempt + 1))
            else:
                logger.error(f"Failed to tag insights: {e}")
                raise

    return insights
