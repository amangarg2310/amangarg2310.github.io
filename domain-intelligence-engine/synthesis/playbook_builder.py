"""Generate comprehensive playbooks for domain buckets."""

import json
import logging
import time
from typing import Optional

import anthropic
import yaml

from config.settings import ANTHROPIC_API_KEY, CONFIG_DIR, PROMPTS_DIR_SYNTHESIS, SYNTHESIS_MODEL
from storage.vector_store import VectorStore

logger = logging.getLogger(__name__)


def build_playbook(
    domain: str,
    max_retries: int = 3,
) -> dict:
    """Generate a full playbook for a domain by pulling all insights and synthesizing.

    Returns a playbook dict.
    """
    # Load domain config
    with open(CONFIG_DIR / "domains.yaml") as f:
        domains = yaml.safe_load(f)["domains"]

    if domain not in domains:
        raise ValueError(f"Unknown domain: {domain}. Available: {list(domains.keys())}")

    domain_config = domains[domain]
    sub_domains = domain_config["sub_domains"]

    # Fetch all insights for this domain
    store = VectorStore()
    insights = store.get_insights_by_domain(domain)

    if not insights:
        logger.warning(f"No insights found for domain: {domain}")
        return {
            "domain": domain,
            "title": f"{domain_config['name']} Playbook",
            "version": 1,
            "total_sources": 0,
            "total_experts": 0,
            "sections": [],
            "conflicts": [],
        }

    # Count unique sources and experts
    unique_videos = set(i.get("source_video_id", "") for i in insights)
    unique_experts = set(i.get("expert_name", "") for i in insights)

    # Prepare insights for the prompt (strip embeddings)
    clean_insights = []
    for i in insights:
        clean = {k: v for k, v in i.items() if k != "embedding"}
        # Parse JSON strings back to lists
        for field in ("tags", "related_experts"):
            if isinstance(clean.get(field), str):
                try:
                    clean[field] = json.loads(clean[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        clean_insights.append(clean)

    # Load and format the prompt
    prompt_template = (PROMPTS_DIR_SYNTHESIS / "build_playbook.txt").read_text()
    prompt = prompt_template.format(
        domain_name=domain_config["name"],
        total_insights=len(insights),
        total_experts=len(unique_experts),
        total_videos=len(unique_videos),
        sub_domains=", ".join(sub_domains),
        insights_json=json.dumps(clean_insights, indent=2),
    )

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=SYNTHESIS_MODEL,
                max_tokens=8192,
                messages=[{"role": "user", "content": prompt}],
            )

            raw_text = response.content[0].text

            # Try to parse as JSON
            json_text = raw_text
            if "```json" in json_text:
                json_text = json_text.split("```json")[1].split("```")[0]
            elif "```" in json_text:
                json_text = json_text.split("```")[1].split("```")[0]

            try:
                playbook = json.loads(json_text.strip())
            except json.JSONDecodeError:
                # If not valid JSON, wrap the raw text as a playbook
                playbook = {
                    "sections": [{"title": "Full Playbook", "summary": raw_text}],
                    "conflicts": [],
                }

            playbook["domain"] = domain
            playbook["title"] = f"{domain_config['name']} Playbook"
            playbook["total_sources"] = len(unique_videos)
            playbook["total_experts"] = len(unique_experts)

            logger.info(f"Generated playbook for {domain} with {len(playbook.get('sections', []))} sections")
            return playbook

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Rate limited on playbook generation, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Playbook generation retry {attempt + 1}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to generate playbook for {domain}: {e}")
                raise

    return {}
