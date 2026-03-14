from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

MEDIA_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a media production specialist.
You create detailed briefs for video and audio content production.

Guidelines:
- Provide clear creative direction with specific details
- Include script or narration text when applicable
- Specify visual/audio style, pacing, and mood
- Define target duration and format
- Note any brand guidelines or constraints
- Include technical specs (resolution, aspect ratio, codec)

Return JSON with keys:
- "media_type": "video", "audio", "podcast", or "animation"
- "title": Production title
- "script": Full script or narration text
- "duration_seconds": Target duration in seconds
- "style_notes": Visual or audio style direction
- "scenes": List of scene descriptions (for video/animation)
- "music_direction": Background music style or track suggestions
- "technical_specs": Object with format, resolution, etc.
- "assets_needed": List of assets required (images, footage, voiceover)
- "platform": Target platform(s) for distribution
"""


class MediaHandler(BaseHandler):
    """Handler for media production: video/audio generation briefs and scripts."""

    @property
    def handler_name(self) -> str:
        return "Media Producer"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.MEDIA_PRODUCTION

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("media_handler_started")

        input_data = task.input_data or {}

        prompt = f"Media brief: {task.description or task.title}\n"
        if input_data.get("media_type"):
            prompt += f"Media type: {input_data['media_type']}\n"
        if input_data.get("duration"):
            prompt += f"Target duration: {input_data['duration']}\n"
        if input_data.get("platform"):
            prompt += f"Platform: {input_data['platform']}\n"
        if input_data.get("brand_guidelines"):
            prompt += f"Brand guidelines: {input_data['brand_guidelines']}\n"
        if input_data.get("reference_links"):
            prompt += f"References: {input_data['reference_links']}\n"
        prompt += "\nCreate the media production brief. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=MEDIA_SYSTEM_PROMPT,
            temperature=0.7,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"title": task.title, "script": response.content[0].text, "raw": True}

        preview = output.get("title", "") + " (" + output.get("media_type", "media") + ")"
        log.info("media_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.80 if "raw" not in output else 0.55,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
