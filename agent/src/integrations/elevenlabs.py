"""ElevenLabs integration for AI text-to-speech generation.

Generates high-quality speech audio from text using ElevenLabs voices.

Requires: ELEVENLABS_API_KEY
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class ElevenLabsIntegration:
    """Interface to the ElevenLabs API."""

    async def generate_speech(
        self,
        text: str,
        *,
        voice_id: str | None = None,
        model_id: str = "eleven_multilingual_v2",
        output_format: str = "mp3_44100_128",
    ) -> bytes:
        """Generate speech audio from text.

        Args:
            text: Text to convert to speech.
            voice_id: ElevenLabs voice ID (uses default if None).
            model_id: TTS model identifier.
            output_format: Audio output format.

        Returns:
            Raw audio bytes in the requested format.
        """
        logger.warning("elevenlabs.generate_speech not implemented")
        raise NotImplementedError("ElevenLabsIntegration.generate_speech is a stub")

    async def list_voices(self) -> list[dict[str, Any]]:
        """List all available voices for the account.

        Returns:
            List of voice dicts with ``voice_id``, ``name``, and settings.
        """
        logger.warning("elevenlabs.list_voices not implemented")
        raise NotImplementedError("ElevenLabsIntegration.list_voices is a stub")
