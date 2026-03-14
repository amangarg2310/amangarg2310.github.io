"""HeyGen integration for AI avatar video generation.

Creates AI-generated avatar videos and polls for render completion.

Requires: HEYGEN_API_KEY
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class HeyGenIntegration:
    """Interface to the HeyGen API."""

    async def create_video(
        self,
        script: str,
        *,
        avatar_id: str | None = None,
        voice_id: str | None = None,
        background_url: str | None = None,
    ) -> dict[str, Any]:
        """Submit a video generation request.

        Args:
            script: Text script for the avatar to speak.
            avatar_id: HeyGen avatar ID (uses default if None).
            voice_id: Voice ID for TTS (uses avatar default if None).
            background_url: Optional background image/video URL.

        Returns:
            Response dict with ``video_id`` for status polling.
        """
        logger.warning("heygen.create_video not implemented")
        raise NotImplementedError("HeyGenIntegration.create_video is a stub")

    async def get_video_status(self, video_id: str) -> dict[str, Any]:
        """Check the rendering status of a video.

        Args:
            video_id: Video ID from a previous ``create_video`` call.

        Returns:
            Status dict with ``status`` (processing/completed/failed) and
            ``video_url`` when completed.
        """
        logger.warning("heygen.get_video_status not implemented", video_id=video_id)
        raise NotImplementedError("HeyGenIntegration.get_video_status is a stub")
