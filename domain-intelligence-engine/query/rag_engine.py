"""RAG engine: retrieve relevant insights and synthesize answers with Claude."""

import json
import logging
import time
from pathlib import Path
from typing import Optional

import anthropic

from config.settings import ANTHROPIC_API_KEY, PROMPTS_DIR_QUERY, SYNTHESIS_MODEL
from query.reranker import rerank_by_relevance
from storage.vector_store import VectorStore

logger = logging.getLogger(__name__)


def _load_prompt(name: str) -> str:
    path = PROMPTS_DIR_QUERY / name
    return path.read_text()


def answer_question(
    question: str,
    domain: Optional[str] = None,
    top_k: int = 10,
    rerank_top_k: int = 5,
    max_retries: int = 3,
) -> dict:
    """Full RAG pipeline: embed query → vector search → rerank → synthesize.

    Returns a dict with 'answer', 'sources', and 'metadata'.
    """
    store = VectorStore()

    # Retrieve relevant insights
    results = store.search_similar(
        query_text=question,
        domain=domain,
        top_k=top_k,
    )

    if not results:
        return {
            "answer": "I don't have enough information in the knowledge base to answer this question. "
                      "Try ingesting more content related to this topic.",
            "sources": [],
            "metadata": {"retrieved_count": 0, "domain_filter": domain},
        }

    # Rerank for better relevance
    reranked = rerank_by_relevance(question, results, top_k=rerank_top_k)

    # Format context for the synthesis prompt
    context_parts = []
    for i, result in enumerate(reranked, 1):
        context_parts.append(
            f"[{i}] {result.get('title', 'Untitled')} "
            f"(Expert: {result.get('expert_name', 'Unknown')}, "
            f"Source: {result.get('source_title', 'Unknown')})\n"
            f"Type: {result.get('insight_type', 'unknown')} | "
            f"Actionability: {result.get('actionability', 'medium')}\n"
            f"{result.get('content', '')}"
        )
        if result.get("key_quote"):
            context_parts[-1] += f'\nKey quote: "{result["key_quote"]}"'

    context = "\n\n".join(context_parts)

    # Synthesize answer with Claude
    prompt_template = _load_prompt("answer_query.txt")
    prompt = prompt_template.format(context=context, question=question)

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    for attempt in range(max_retries):
        try:
            response = client.messages.create(
                model=SYNTHESIS_MODEL,
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )

            answer = response.content[0].text

            sources = [
                {
                    "title": r.get("title", ""),
                    "expert": r.get("expert_name", ""),
                    "source_title": r.get("source_title", ""),
                    "source_url": r.get("source_url", ""),
                    "timestamp": r.get("timestamp_start"),
                }
                for r in reranked
            ]

            return {
                "answer": answer,
                "sources": sources,
                "metadata": {
                    "retrieved_count": len(results),
                    "reranked_count": len(reranked),
                    "domain_filter": domain,
                    "model": SYNTHESIS_MODEL,
                },
            }

        except anthropic.RateLimitError:
            wait = 2 ** (attempt + 2)
            logger.warning(f"Rate limited on synthesis, waiting {wait}s...")
            time.sleep(wait)

        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                logger.warning(f"Synthesis retry {attempt + 1}: {e}")
                time.sleep(wait)
            else:
                logger.error(f"Failed to synthesize answer: {e}")
                raise

    return {"answer": "Failed to generate answer.", "sources": [], "metadata": {}}
