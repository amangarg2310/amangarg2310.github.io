"""Memory storage and retrieval using pgvector for semantic search."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.models.base import get_session
from src.models.memory import Memory, MemoryType
from src.memory.embeddings import EmbeddingGenerator


class MemoryStore:
    """Persist and query memories backed by PostgreSQL + pgvector."""

    def __init__(self) -> None:
        self._embedder = EmbeddingGenerator()

    async def store(
        self,
        content: str,
        memory_type: MemoryType,
        source: str | None = None,
        metadata: dict | None = None,
    ) -> Memory:
        """Generate an embedding for *content* and persist a new Memory row."""
        embedding = await self._embedder.generate(content)

        memory = Memory(
            content=content,
            embedding=embedding,
            memory_type=memory_type,
            source=source,
            metadata_=metadata,
        )

        async with get_session() as session:
            session.add(memory)
            await session.flush()
            await session.refresh(memory)

        return memory

    async def search(
        self,
        query: str,
        top_k: int = 5,
        memory_type: MemoryType | None = None,
    ) -> list[Memory]:
        """Semantic search over memories using pgvector cosine similarity.

        Returns up to *top_k* memories ordered by similarity (most similar
        first).  Optionally filters by *memory_type*.
        """
        query_embedding = await self._embedder.generate(query)

        async with get_session() as session:
            # pgvector cosine distance operator: <=>
            stmt = (
                select(Memory)
                .order_by(Memory.embedding.cosine_distance(query_embedding))
                .limit(top_k)
            )

            if memory_type is not None:
                stmt = stmt.where(Memory.memory_type == memory_type)

            result = await session.execute(stmt)
            memories = list(result.scalars().all())

            # Update access metadata
            now = datetime.now(timezone.utc)
            for mem in memories:
                mem.last_accessed = now
                mem.access_count += 1

        return memories

    async def get_by_id(self, memory_id: uuid.UUID) -> Memory | None:
        """Fetch a single memory by its primary key."""
        async with get_session() as session:
            stmt = select(Memory).where(Memory.id == memory_id)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()
