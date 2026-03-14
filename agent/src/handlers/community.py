from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

COMMUNITY_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a community engagement specialist.
You craft helpful, authentic replies to community messages across forums, Discord, Slack, and social platforms.

Guidelines:
- Be genuinely helpful and empathetic
- Match the tone and formality of the platform
- Provide actionable answers when possible
- Link to relevant resources or documentation
- Keep replies concise but thorough
- Never sound robotic or overly corporate

Return JSON with keys:
- "reply": The reply text
- "tone": The detected tone (e.g., "friendly", "technical", "supportive")
- "sentiment": Sentiment of the original message ("positive", "neutral", "negative")
- "follow_up_needed": Boolean indicating if a human should follow up
- "suggested_resources": List of relevant links or docs to reference
"""


class CommunityHandler(BaseHandler):
    """Handler for community engagement: replies, comments, forum responses."""

    @property
    def handler_name(self) -> str:
        return "Community Responder"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.COMMUNITY_REPLY

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("community_handler_started")

        input_data = task.input_data or {}
        platform = input_data.get("platform", "unknown")

        prompt = f"Platform: {platform}\n"
        prompt += f"Original message: {task.description or task.title}\n"
        if input_data.get("thread_context"):
            prompt += f"Thread context: {input_data['thread_context']}\n"
        if input_data.get("author"):
            prompt += f"Author: {input_data['author']}\n"
        prompt += "\nCraft an appropriate community reply. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=COMMUNITY_SYSTEM_PROMPT,
            model="claude-haiku-4-5-20251001",
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
            output = {"reply": response.content[0].text, "raw": True}

        preview = output.get("reply", "")[:300]
        log.info("community_handler_completed", platform=platform)

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.80 if "raw" not in output else 0.55,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
