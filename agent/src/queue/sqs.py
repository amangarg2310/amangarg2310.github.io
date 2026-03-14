"""Queue abstraction with Redis implementation for MVP.

Uses a Redis sorted set to implement a priority queue. Lower scores
are dequeued first so that higher-priority tasks (lower numeric value)
are processed before lower-priority ones.
"""

from __future__ import annotations

import redis.asyncio as redis

from src.config import settings

QUEUE_KEY = "agent:task_queue"


class TaskQueue:
    """Priority queue backed by a Redis sorted set."""

    def __init__(self) -> None:
        self._redis: redis.Redis = redis.from_url(
            settings.redis_url, decode_responses=True
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def enqueue(self, task_id: str, priority: int = 5) -> None:
        """Add a task to the queue with the given priority.

        Lower priority numbers are dequeued first.
        """
        await self._redis.zadd(QUEUE_KEY, {task_id: priority})

    async def dequeue(self) -> str | None:
        """Remove and return the highest-priority (lowest score) task ID.

        Returns ``None`` when the queue is empty.
        """
        # zpopmin returns a list of (member, score) tuples; empty list if
        # the sorted set is empty.
        result = await self._redis.zpopmin(QUEUE_KEY, count=1)
        if not result:
            return None
        task_id, _score = result[0]
        return task_id

    async def size(self) -> int:
        """Return the number of tasks currently in the queue."""
        return await self._redis.zcard(QUEUE_KEY)

    async def peek(self) -> list[str]:
        """Return all queued task IDs ordered by priority without removing them."""
        # zrange returns members ordered by score (ascending).
        return await self._redis.zrange(QUEUE_KEY, 0, -1)

    async def purge(self) -> int:
        """Remove all tasks from the queue and return the count removed."""
        count = await self._redis.zcard(QUEUE_KEY)
        if count:
            await self._redis.delete(QUEUE_KEY)
        return count
