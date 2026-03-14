"""Context assembly for Claude prompts using stored memories."""

from __future__ import annotations

from src.memory.store import MemoryStore


async def assemble_context(query: str, max_memories: int = 5) -> str:
    """Search the memory store and format relevant memories into a context string.

    Returns an empty string when no relevant memories are found.
    """
    store = MemoryStore()
    memories = await store.search(query, top_k=max_memories)

    if not memories:
        return ""

    lines: list[str] = ["Relevant context from memory:\n"]
    for i, mem in enumerate(memories, start=1):
        lines.append(f"{i}. [{mem.memory_type.value}] {mem.content}")
        if mem.source:
            lines.append(f"   Source: {mem.source}")

    return "\n".join(lines)
