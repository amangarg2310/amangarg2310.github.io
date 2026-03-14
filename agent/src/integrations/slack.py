"""Slack integration via the Slack Web API and Events API.

Connects to Slack workspaces to send messages, listen for events (mentions,
DMs, reactions), and participate in threaded conversations.

Requires: SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class SlackIntegration:
    """Interface to the Slack Web API."""

    async def send_message(self, channel: str, text: str, *, thread_ts: str | None = None) -> dict[str, Any]:
        """Send a message to a Slack channel or DM.

        Args:
            channel: Channel ID or user ID.
            text: Message body (supports Slack mrkdwn).
            thread_ts: Optional thread timestamp to reply in-thread.

        Returns:
            Slack API response dict with ``ts`` of the posted message.
        """
        logger.warning("slack.send_message not implemented", channel=channel)
        raise NotImplementedError("SlackIntegration.send_message is a stub")

    async def listen_events(self) -> None:
        """Start listening for Slack events via Socket Mode or Events API.

        This is a long-running coroutine that processes incoming events and
        dispatches them to the task pipeline.
        """
        logger.warning("slack.listen_events not implemented")
        raise NotImplementedError("SlackIntegration.listen_events is a stub")

    async def post_to_thread(self, channel: str, thread_ts: str, text: str) -> dict[str, Any]:
        """Post a reply to an existing Slack thread.

        Args:
            channel: Channel ID containing the thread.
            thread_ts: Timestamp of the parent message.
            text: Reply text.

        Returns:
            Slack API response dict.
        """
        logger.warning("slack.post_to_thread not implemented", channel=channel)
        raise NotImplementedError("SlackIntegration.post_to_thread is a stub")
