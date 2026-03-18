"""Split long transcripts into overlapping chunks for LLM processing."""

import logging
from typing import Optional

import tiktoken

from config.settings import CHUNK_OVERLAP, CHUNK_SIZE

logger = logging.getLogger(__name__)


def count_tokens(text: str, model: str = "cl100k_base") -> int:
    """Count tokens in a text string using tiktoken."""
    enc = tiktoken.get_encoding(model)
    return len(enc.encode(text))


def chunk_text(
    text: str,
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> list[dict]:
    """Split text into overlapping chunks by token count.

    Returns a list of dicts with keys: text, token_count, chunk_index.
    """
    chunk_size = chunk_size or CHUNK_SIZE
    chunk_overlap = chunk_overlap or CHUNK_OVERLAP

    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    total_tokens = len(tokens)

    if total_tokens <= chunk_size:
        return [{"text": text, "token_count": total_tokens, "chunk_index": 0}]

    chunks = []
    start = 0
    chunk_index = 0
    step = chunk_size - chunk_overlap

    while start < total_tokens:
        end = min(start + chunk_size, total_tokens)
        chunk_tokens = tokens[start:end]
        chunk_text_str = enc.decode(chunk_tokens)

        chunks.append({
            "text": chunk_text_str,
            "token_count": len(chunk_tokens),
            "chunk_index": chunk_index,
        })

        if end >= total_tokens:
            break

        start += step
        chunk_index += 1

    logger.info(f"Split {total_tokens} tokens into {len(chunks)} chunks")
    return chunks


def chunk_segments(
    segments: list[dict],
    chunk_size: Optional[int] = None,
    chunk_overlap: Optional[int] = None,
) -> list[dict]:
    """Chunk transcript segments, preserving timestamp information.

    Each returned chunk includes start_time and end_time from the original segments.
    """
    chunk_size = chunk_size or CHUNK_SIZE
    chunk_overlap = chunk_overlap or CHUNK_OVERLAP

    enc = tiktoken.get_encoding("cl100k_base")

    full_text = " ".join(seg["text"] for seg in segments)
    text_chunks = chunk_text(full_text, chunk_size, chunk_overlap)

    # Map chunks back to approximate timestamps
    char_to_time = []
    pos = 0
    for seg in segments:
        seg_len = len(seg["text"])
        char_to_time.append((pos, pos + seg_len, seg["start"], seg.get("duration", 0)))
        pos += seg_len + 1  # +1 for the space join

    for chunk in text_chunks:
        chunk_start_char = full_text.find(chunk["text"][:100])
        chunk_end_char = chunk_start_char + len(chunk["text"]) if chunk_start_char >= 0 else len(full_text)

        start_time = 0.0
        end_time = 0.0
        for cstart, cend, seg_start, seg_dur in char_to_time:
            if cstart <= chunk_start_char < cend:
                start_time = seg_start
            if cstart <= chunk_end_char <= cend or cend >= chunk_end_char:
                end_time = seg_start + seg_dur
                break

        chunk["start_time"] = start_time
        chunk["end_time"] = end_time

    return text_chunks
