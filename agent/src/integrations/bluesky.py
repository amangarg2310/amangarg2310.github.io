"""Bluesky integration via the AT Protocol (atproto).

Posts, reads feeds, and replies on the Bluesky social network.

Requires: BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class BlueskyIntegration:
    """Interface to the Bluesky AT Protocol API."""

    async def post(self, text: str, *, embed_url: str | None = None) -> dict[str, Any]:
        """Create a new post on Bluesky.

        Args:
            text: Post text (max 300 graphemes).
            embed_url: Optional URL to attach as an embed card.

        Returns:
            AT Protocol response with the post URI and CID.
        """
        logger.warning("bluesky.post not implemented")
        raise NotImplementedError("BlueskyIntegration.post is a stub")

    async def get_feed(self, limit: int = 50) -> list[dict[str, Any]]:
        """Retrieve the authenticated user's home feed.

        Args:
            limit: Maximum number of feed items to return.

        Returns:
            List of feed item dicts.
        """
        logger.warning("bluesky.get_feed not implemented")
        raise NotImplementedError("BlueskyIntegration.get_feed is a stub")

    async def reply(self, parent_uri: str, parent_cid: str, text: str) -> dict[str, Any]:
        """Reply to an existing Bluesky post.

        Args:
            parent_uri: AT URI of the parent post.
            parent_cid: CID of the parent post.
            text: Reply text.

        Returns:
            AT Protocol response with the reply URI and CID.
        """
        logger.warning("bluesky.reply not implemented")
        raise NotImplementedError("BlueskyIntegration.reply is a stub")
