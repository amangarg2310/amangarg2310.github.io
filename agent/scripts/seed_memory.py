"""Bootstrap semantic memory with initial facts about the agent."""
from __future__ import annotations

import asyncio

from src.memory.store import MemoryStore
from src.models.memory import MemoryType


SEED_MEMORIES = [
    {
        "content": "The agent is built on the PAGE (Professional Autonomous GenAI Employee) architecture.",
        "memory_type": MemoryType.FACT,
        "source": "seed",
    },
    {
        "content": "Content should be written in a professional but approachable tone.",
        "memory_type": MemoryType.PREFERENCE,
        "source": "seed",
    },
    {
        "content": "Blog posts should include actionable insights, clear headings, and SEO optimization.",
        "memory_type": MemoryType.PREFERENCE,
        "source": "seed",
    },
    {
        "content": "Social media posts for LinkedIn should be professional with 3-5 hashtags.",
        "memory_type": MemoryType.PREFERENCE,
        "source": "seed",
    },
    {
        "content": "Social media posts for Bluesky should be conversational, max 300 chars.",
        "memory_type": MemoryType.PREFERENCE,
        "source": "seed",
    },
    {
        "content": "All public-facing content requires human approval before publishing.",
        "memory_type": MemoryType.FACT,
        "source": "seed",
    },
]


async def seed() -> None:
    store = MemoryStore()
    for mem in SEED_MEMORIES:
        await store.store(
            content=mem["content"],
            memory_type=mem["memory_type"],
            source=mem["source"],
        )
        print(f"Seeded: {mem['content'][:60]}...")
    print(f"\nSeeded {len(SEED_MEMORIES)} memories.")


if __name__ == "__main__":
    asyncio.run(seed())
