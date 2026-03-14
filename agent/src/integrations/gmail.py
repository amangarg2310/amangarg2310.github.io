"""Gmail integration via the Google Gmail API (OAuth 2.0).

Provides email sending, inbox listing, and push-notification watching
for the authenticated Google account.

Requires: GOOGLE_CREDENTIALS_JSON, GOOGLE_TOKEN_JSON
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class GmailIntegration:
    """Interface to the Gmail API."""

    async def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        *,
        cc: list[str] | None = None,
        html: bool = False,
    ) -> dict[str, Any]:
        """Compose and send an email.

        Args:
            to: Recipient email address.
            subject: Email subject line.
            body: Plain-text or HTML body.
            cc: Optional list of CC addresses.
            html: If True, treat *body* as HTML.

        Returns:
            Gmail API response with the message ID.
        """
        logger.warning("gmail.send_email not implemented", to=to)
        raise NotImplementedError("GmailIntegration.send_email is a stub")

    async def list_messages(
        self,
        query: str = "",
        max_results: int = 20,
    ) -> list[dict[str, Any]]:
        """List messages matching a Gmail search query.

        Args:
            query: Gmail search string (e.g. ``is:unread from:foo``).
            max_results: Maximum number of messages to return.

        Returns:
            List of message summary dicts.
        """
        logger.warning("gmail.list_messages not implemented", query=query)
        raise NotImplementedError("GmailIntegration.list_messages is a stub")

    async def watch_inbox(self, topic: str) -> dict[str, Any]:
        """Set up Gmail push notifications via a Cloud Pub/Sub topic.

        Args:
            topic: Fully-qualified Pub/Sub topic name.

        Returns:
            Watch response with history ID and expiration.
        """
        logger.warning("gmail.watch_inbox not implemented", topic=topic)
        raise NotImplementedError("GmailIntegration.watch_inbox is a stub")
