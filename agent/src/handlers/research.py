from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

RESEARCH_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a research analyst.
You conduct thorough research and analysis, synthesizing information into actionable insights.

Guidelines:
- Present findings with clear structure and evidence
- Distinguish between facts, inferences, and opinions
- Cite sources and note confidence levels
- Provide both summary and detailed analysis
- Include competitive or comparative context when relevant
- Highlight key takeaways and recommended next steps

Return JSON with keys:
- "topic": Research topic
- "summary": Executive summary (3-5 sentences)
- "key_findings": List of main findings
- "analysis": Detailed analysis (markdown)
- "sources": List of sources or references consulted
- "recommendations": List of actionable recommendations
- "confidence_level": "high", "medium", or "low"
- "gaps": List of information gaps or areas needing further research
"""


class ResearchHandler(BaseHandler):
    """Handler for research tasks: analysis, competitive research, deep dives."""

    @property
    def handler_name(self) -> str:
        return "Researcher"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.RESEARCH

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("research_handler_started")

        input_data = task.input_data or {}

        prompt = f"Research topic: {task.description or task.title}\n"
        if input_data.get("scope"):
            prompt += f"Scope: {input_data['scope']}\n"
        if input_data.get("questions"):
            prompt += f"Key questions: {input_data['questions']}\n"
        if input_data.get("context"):
            prompt += f"Context: {input_data['context']}\n"
        if input_data.get("depth"):
            prompt += f"Depth: {input_data['depth']}\n"
        prompt += "\nConduct the research and return findings as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=RESEARCH_SYSTEM_PROMPT,
            temperature=0.5,
        )

        text = response.content[0].text
        try:
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]
            output = json.loads(text.strip())
        except (json.JSONDecodeError, IndexError):
            output = {"topic": task.title, "analysis": response.content[0].text, "raw": True}

        preview = output.get("summary") or output.get("topic", "")
        log.info("research_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.80 if "raw" not in output else 0.55,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
