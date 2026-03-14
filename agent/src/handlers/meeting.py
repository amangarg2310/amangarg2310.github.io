from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

MEETING_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a meeting preparation and notes specialist.
You generate meeting agendas, prep docs, summaries, and action items.

Guidelines:
- Structure notes with clear sections and timestamps when available
- Extract concrete action items with owners and deadlines
- Highlight key decisions and open questions
- Keep summaries executive-friendly (concise, outcome-focused)
- Flag any follow-ups or blockers mentioned

Return JSON with keys:
- "title": Meeting title
- "summary": Executive summary (2-3 sentences)
- "key_decisions": List of decisions made
- "action_items": List of objects with "task", "owner", "deadline"
- "open_questions": List of unresolved questions
- "notes": Detailed meeting notes (markdown)
- "attendees": List of attendees if mentioned
"""


class MeetingHandler(BaseHandler):
    """Handler for meeting tasks: prep docs, notes, summaries, action items."""

    @property
    def handler_name(self) -> str:
        return "Meeting Notes"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.MEETING_NOTES

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("meeting_handler_started")

        input_data = task.input_data or {}

        prompt = f"Meeting: {task.description or task.title}\n"
        if input_data.get("transcript"):
            prompt += f"Transcript:\n{input_data['transcript']}\n"
        if input_data.get("agenda"):
            prompt += f"Agenda: {input_data['agenda']}\n"
        if input_data.get("attendees"):
            prompt += f"Attendees: {input_data['attendees']}\n"
        if input_data.get("meeting_type"):
            prompt += f"Type: {input_data['meeting_type']}\n"
        prompt += "\nGenerate meeting notes and action items. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=MEETING_SYSTEM_PROMPT,
            temperature=0.4,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"title": task.title, "notes": response.content[0].text, "raw": True}

        preview = output.get("summary") or output.get("title", "")
        log.info("meeting_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.85 if "raw" not in output else 0.60,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
