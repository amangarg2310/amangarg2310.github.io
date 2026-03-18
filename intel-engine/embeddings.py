"""
Embedding utilities — generate and compare vector embeddings for semantic search.

Uses OpenAI text-embedding-3-small (1536 dimensions) for insight embeddings.
Pure Python cosine similarity (no numpy dependency needed).
"""

import logging
import math
from typing import Optional

from openai import OpenAI

import config

logger = logging.getLogger(__name__)


def generate_embedding(text: str) -> Optional[list[float]]:
    """Generate an embedding vector for a text string."""
    api_key = config.get_api_key('openai')
    if not api_key:
        logger.warning("OpenAI API key not configured, skipping embedding")
        return None

    # Truncate to ~8000 tokens worth of text (rough estimate: 4 chars per token)
    truncated = text[:32000]

    try:
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(
            input=truncated,
            model=config.EMBEDDING_MODEL,
        )
        return response.data[0].embedding
    except Exception as e:
        logger.warning(f"Embedding generation failed: {e}")
        return None


def batch_generate_embeddings(texts: list[str]) -> list[Optional[list[float]]]:
    """Generate embeddings for multiple texts in a single API call."""
    api_key = config.get_api_key('openai')
    if not api_key:
        logger.warning("OpenAI API key not configured, skipping embeddings")
        return [None] * len(texts)

    if not texts:
        return []

    # Truncate each text
    truncated = [t[:32000] for t in texts]

    try:
        client = OpenAI(api_key=api_key)
        response = client.embeddings.create(
            input=truncated,
            model=config.EMBEDDING_MODEL,
        )
        # Response data is ordered by index
        result = [None] * len(texts)
        for item in response.data:
            result[item.index] = item.embedding
        return result
    except Exception as e:
        logger.warning(f"Batch embedding generation failed: {e}")
        return [None] * len(texts)


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Compute cosine similarity between two vectors. Pure Python, no numpy."""
    if not a or not b or len(a) != len(b):
        return 0.0

    dot_product = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot_product / (norm_a * norm_b)


def serialize_embedding(vec: list[float]) -> str:
    """Serialize an embedding vector to a comma-separated string for SQLite storage."""
    return ",".join(f"{v:.6f}" for v in vec)


def deserialize_embedding(text: str) -> Optional[list[float]]:
    """Deserialize an embedding from a comma-separated string."""
    if not text:
        return None
    try:
        return [float(v) for v in text.split(",")]
    except (ValueError, TypeError):
        return None
