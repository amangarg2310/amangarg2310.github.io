"""Rerank retrieved chunks for better relevance ordering."""

import logging

logger = logging.getLogger(__name__)


def rerank_by_relevance(
    query: str,
    results: list[dict],
    top_k: int = 5,
) -> list[dict]:
    """Simple reranking based on keyword overlap and metadata signals.

    For production, consider using Cohere Rerank or a cross-encoder model.
    """
    query_terms = set(query.lower().split())

    scored = []
    for result in results:
        content = result.get("content", "").lower()
        title = result.get("title", "").lower()

        # Keyword overlap score
        content_terms = set(content.split())
        title_terms = set(title.split())
        content_overlap = len(query_terms & content_terms)
        title_overlap = len(query_terms & title_terms) * 2  # Title matches weighted higher

        # Actionability bonus
        actionability_bonus = {"high": 1.5, "medium": 1.0, "low": 0.5}.get(
            result.get("actionability", "medium"), 1.0
        )

        # Confidence bonus
        confidence = result.get("confidence", 0.5)

        # Similarity score from vector search (if present)
        similarity = result.get("similarity", 0.5)

        score = (
            similarity * 10
            + content_overlap
            + title_overlap
            + actionability_bonus
            + confidence
        )

        scored.append({**result, "_rerank_score": score})

    scored.sort(key=lambda x: x["_rerank_score"], reverse=True)
    logger.info(f"Reranked {len(results)} results, returning top {top_k}")
    return scored[:top_k]
