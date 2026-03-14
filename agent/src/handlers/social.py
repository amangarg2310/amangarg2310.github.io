from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

SOCIAL_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a social media manager.
Create platform-optimized social media posts.

Return JSON with keys:
- "platform": The target platform
- "content": The post text
- "hashtags": List of hashtags (without #)
- "media_suggestion": Optional description of suggested media
- "best_time": Suggested posting time (e.g., "9am EST Tuesday")
- "thread": List of strings if this should be a thread/carousel

Platform guidelines:
- Bluesky: Max 300 chars, conversational, no hashtag spam
- LinkedIn: Professional tone, can be longer, use 3-5 hashtags
- Threads: Casual, engaging, max 500 chars
"""


class SocialHandler(BaseHandler):
    @property
    def handler_name(self) -> str:
        return "Social Media Manager"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.SOCIAL_POSTING

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        input_data = task.input_data or {}
        platform = input_data.get("platform", "all")

        prompt = f"Create a social media post for {platform}.\n"
        prompt += f"Topic: {task.description or task.title}\n"
        if input_data.get("tone"):
            prompt += f"Tone: {input_data['tone']}\n"
        if input_data.get("cta"):
            prompt += f"Call to action: {input_data['cta']}\n"
        prompt += "\nReturn as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=SOCIAL_SYSTEM_PROMPT,
            model="claude-sonnet-4-20250514",
            temperature=0.8,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"platform": platform, "content": response.content[0].text}

        preview = output.get("content", "")[:300]
        log.info("social_handler_completed", platform=platform)

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.80,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
