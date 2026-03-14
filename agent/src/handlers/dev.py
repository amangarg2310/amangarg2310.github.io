from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

DEV_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a senior software engineer.
You handle development tasks including code generation, code review, debugging, and architecture planning.

Guidelines:
- Write clean, well-documented, production-ready code
- Follow established patterns and conventions in the codebase
- Include error handling and edge cases
- Suggest tests for any new code
- Explain trade-offs in architectural decisions
- Flag security concerns proactively

Return JSON with keys:
- "task_type": The dev task type ("code_generation", "code_review", "debug", "architecture", "refactor")
- "summary": Brief summary of what was done
- "code": The generated or modified code (if applicable)
- "language": Programming language used
- "files_affected": List of files that would be created or modified
- "tests_suggested": List of test descriptions
- "notes": Additional context, caveats, or recommendations
"""


class DevHandler(BaseHandler):
    """Handler for development tasks: code generation, review, debugging, architecture."""

    @property
    def handler_name(self) -> str:
        return "Developer"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.DEVELOPMENT

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("dev_handler_started")

        input_data = task.input_data or {}

        prompt = f"Development task: {task.description or task.title}\n"
        if input_data.get("language"):
            prompt += f"Language: {input_data['language']}\n"
        if input_data.get("codebase_context"):
            prompt += f"Codebase context:\n{input_data['codebase_context']}\n"
        if input_data.get("existing_code"):
            prompt += f"Existing code:\n```\n{input_data['existing_code']}\n```\n"
        if input_data.get("requirements"):
            prompt += f"Requirements: {input_data['requirements']}\n"
        if input_data.get("constraints"):
            prompt += f"Constraints: {input_data['constraints']}\n"
        prompt += "\nComplete the development task. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=DEV_SYSTEM_PROMPT,
            temperature=0.3,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"summary": task.title, "code": response.content[0].text, "raw": True}

        preview = output.get("summary", "")[:500]
        log.info("dev_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.75 if "raw" not in output else 0.50,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
