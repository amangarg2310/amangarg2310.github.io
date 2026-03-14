from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

EMAIL_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a professional email composer.
You draft clear, well-structured emails appropriate for business communication.

Guidelines:
- Use a professional yet personable tone
- Keep emails concise and scannable
- Lead with the key point or ask
- Include a clear call-to-action when appropriate
- Adapt formality based on the recipient relationship
- Proofread for grammar and clarity

Return JSON with keys:
- "subject": Email subject line
- "body": Full email body (plain text)
- "to": Suggested recipient(s) if known
- "cc": Suggested CC recipients if appropriate
- "priority": "high", "normal", or "low"
- "summary": One-line summary of the email purpose
"""


class EmailHandler(BaseHandler):
    """Handler for email drafting tasks."""

    @property
    def handler_name(self) -> str:
        return "Email Drafter"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.EMAIL

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("email_handler_started")

        input_data = task.input_data or {}

        prompt = f"Email brief: {task.description or task.title}\n"
        if input_data.get("recipient"):
            prompt += f"Recipient: {input_data['recipient']}\n"
        if input_data.get("context"):
            prompt += f"Context: {input_data['context']}\n"
        if input_data.get("tone"):
            prompt += f"Tone: {input_data['tone']}\n"
        if input_data.get("reply_to"):
            prompt += f"Replying to: {input_data['reply_to']}\n"
        prompt += "\nDraft the email. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=EMAIL_SYSTEM_PROMPT,
            temperature=0.6,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"subject": task.title, "body": response.content[0].text, "raw": True}

        preview = output.get("summary") or output.get("subject", "")
        log.info("email_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.85 if "raw" not in output else 0.60,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
