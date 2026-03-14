"""Embedding generation for memory vectors.

NOTE: The current implementation uses a deterministic hash-based mock embedding
suitable for MVP / local development. For production, replace the `generate`
method body with a call to a real embedding API such as Voyage AI
(https://docs.voyageai.com/) or another provider.
"""

from __future__ import annotations

import hashlib
import math

from src.config import settings


class EmbeddingGenerator:
    """Generate embedding vectors from text."""

    async def generate(self, text: str) -> list[float]:
        """Return a deterministic mock embedding vector for *text*.

        The vector has ``settings.pgvector_dimensions`` dimensions and is
        derived from the SHA-256 hash of the input so that identical text
        always produces the same vector.  Values are normalised to the
        range [-1, 1].

        TODO: Replace with a real embedding API (Voyage AI or similar)
        for production use.
        """
        dims = settings.pgvector_dimensions
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()

        # Stretch the hash by re-hashing in rounds so we can fill
        # an arbitrary number of dimensions.
        raw: list[float] = []
        seed = digest
        while len(raw) < dims:
            seed = hashlib.sha256(seed.encode("utf-8")).hexdigest()
            for i in range(0, len(seed) - 1, 2):
                if len(raw) >= dims:
                    break
                byte_val = int(seed[i : i + 2], 16)
                # Map 0-255 to -1.0 .. 1.0
                raw.append((byte_val / 127.5) - 1.0)

        # L2-normalise so cosine similarity works properly.
        norm = math.sqrt(sum(v * v for v in raw))
        if norm > 0:
            raw = [v / norm for v in raw]

        return raw
