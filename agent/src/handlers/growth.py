from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

GROWTH_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a growth strategist and experimentation expert.
You design rigorous A/B tests, growth experiments, and optimization strategies.

Guidelines:
- Define clear hypotheses with measurable outcomes
- Specify control and variant groups
- Recommend appropriate sample sizes and duration
- Identify key metrics and success criteria
- Consider statistical significance requirements
- Flag potential risks or confounding variables

Return JSON with keys:
- "experiment_name": Short descriptive name
- "hypothesis": The hypothesis being tested
- "control": Description of the control group
- "variants": List of variant descriptions
- "primary_metric": The main metric to track
- "secondary_metrics": List of secondary metrics
- "sample_size": Recommended sample size per variant
- "duration_days": Recommended experiment duration
- "success_criteria": What constitutes a win
- "risks": List of potential risks or caveats
"""


class GrowthHandler(BaseHandler):
    """Handler for growth experiments: A/B tests, optimization strategies."""

    @property
    def handler_name(self) -> str:
        return "Growth Experimenter"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.GROWTH_EXPERIMENT

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("growth_handler_started")

        input_data = task.input_data or {}

        prompt = f"Experiment brief: {task.description or task.title}\n"
        if input_data.get("current_metrics"):
            prompt += f"Current metrics: {input_data['current_metrics']}\n"
        if input_data.get("target_audience"):
            prompt += f"Target audience: {input_data['target_audience']}\n"
        if input_data.get("channel"):
            prompt += f"Channel: {input_data['channel']}\n"
        if input_data.get("budget"):
            prompt += f"Budget: {input_data['budget']}\n"
        prompt += "\nDesign the growth experiment. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=GROWTH_SYSTEM_PROMPT,
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
            output = {"experiment_name": task.title, "details": response.content[0].text, "raw": True}

        preview = output.get("hypothesis") or output.get("experiment_name", "")
        log.info("growth_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.80 if "raw" not in output else 0.55,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
