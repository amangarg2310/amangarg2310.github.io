from __future__ import annotations

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.memory.context import assemble_context
from src.models.task import Task, TaskType

logger = structlog.get_logger()

CONTENT_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a professional content creator.
You produce high-quality, engaging content based on the given brief.

Guidelines:
- Write in a professional but approachable tone
- Structure content with clear headings and sections
- Include actionable insights when relevant
- Optimize for readability and engagement
- Match the requested format (blog post, article, newsletter, etc.)

Return your output as structured JSON with keys:
- "title": The content title
- "body": The full content body (markdown)
- "summary": A 1-2 sentence summary
- "tags": List of relevant tags
- "meta_description": SEO meta description (under 160 chars)
"""


class ContentHandler(BaseHandler):
    """Handler for content creation tasks: blog posts, articles, newsletters."""

    @property
    def handler_name(self) -> str:
        return "Content Creator"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.CONTENT_CREATION

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("content_handler_started")

        # Assemble context from memory
        context = await assemble_context(task.description or task.title)

        # Build the prompt
        brief = task.description or task.title
        input_data = task.input_data or {}

        prompt = f"Content Brief: {brief}\n"
        if input_data.get("format"):
            prompt += f"Format: {input_data['format']}\n"
        if input_data.get("target_audience"):
            prompt += f"Target Audience: {input_data['target_audience']}\n"
        if input_data.get("tone"):
            prompt += f"Tone: {input_data['tone']}\n"
        if input_data.get("word_count"):
            prompt += f"Target Word Count: {input_data['word_count']}\n"
        if context:
            prompt += f"\nRelevant Context:\n{context}\n"

        prompt += "\nPlease create the content and return as JSON."

        # Call Claude
        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=CONTENT_SYSTEM_PROMPT,
            temperature=0.7,
        )

        # Parse response
        import json

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"title": task.title, "body": response.content[0].text, "raw": True}

        preview = output.get("summary") or output.get("body", "")[:500]

        log.info("content_handler_completed", has_structured_output="raw" not in output)

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.85 if "raw" not in output else 0.6,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
