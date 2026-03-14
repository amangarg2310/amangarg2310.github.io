"""Threads (Meta) integration via the Threads Publishing API.

Creates posts and replies on the Threads social network.

Requires: THREADS_ACCESS_TOKEN, THREADS_USER_ID
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class ThreadsIntegration:
    """Interface to the Meta Threads API."""

    async def post(self, text: str, *, image_url: str | None = None) -> dict[str, Any]:
        """Create a new post on Threads.

        Args:
            text: Post text content.
            image_url: Optional image URL to attach.

        Returns:
            API response with the media container ID.
        """
        logger.warning("threads.post not implemented")
        raise NotImplementedError("ThreadsIntegration.post is a stub")

    async def reply(self, reply_to_id: str, text: str) -> dict[str, Any]:
        """Reply to an existing Threads post.

        Args:
            reply_to_id: Media ID of the post to reply to.
            text: Reply text.

        Returns:
            API response with the reply media container ID.
        """
        logger.warning("threads.reply not implemented")
        raise NotImplementedError("ThreadsIntegration.reply is a stub")
