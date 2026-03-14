from __future__ import annotations

import json

import structlog

from src.config import settings
from src.handlers.base import BaseHandler, HandlerResult
from src.integrations.claude_client import claude_client
from src.models.task import Task, TaskType

logger = structlog.get_logger()

JIRA_SYSTEM_PROMPT = f"""You are {settings.agent_name}, a project management specialist for JIRA.
You create, update, and manage JIRA tickets with proper structure and detail.

Guidelines:
- Write clear, actionable ticket titles and descriptions
- Include acceptance criteria for stories
- Break epics into well-scoped stories
- Estimate story points based on complexity
- Set appropriate priority and labels
- Link related tickets when applicable
- Follow the team's JIRA conventions

Return JSON with keys:
- "action": The JIRA action ("create", "update", "comment", "transition", "bulk_create")
- "issue_type": "epic", "story", "task", "bug", or "subtask"
- "title": Ticket title/summary
- "description": Full ticket description (markdown)
- "acceptance_criteria": List of acceptance criteria
- "story_points": Estimated story points (1, 2, 3, 5, 8, 13)
- "priority": "highest", "high", "medium", "low", "lowest"
- "labels": List of labels
- "components": List of components
- "subtasks": List of subtask titles if breaking down work
"""


class JiraHandler(BaseHandler):
    """Handler for JIRA management: ticket creation, updates, sprint planning."""

    @property
    def handler_name(self) -> str:
        return "JIRA Manager"

    def can_handle(self, task: Task) -> bool:
        return task.task_type == TaskType.JIRA_MANAGEMENT

    async def execute(self, task: Task) -> HandlerResult:
        log = logger.bind(task_id=str(task.id))
        log.info("jira_handler_started")

        input_data = task.input_data or {}

        prompt = f"JIRA task: {task.description or task.title}\n"
        if input_data.get("project_key"):
            prompt += f"Project: {input_data['project_key']}\n"
        if input_data.get("issue_type"):
            prompt += f"Issue type: {input_data['issue_type']}\n"
        if input_data.get("existing_ticket"):
            prompt += f"Existing ticket: {input_data['existing_ticket']}\n"
        if input_data.get("sprint"):
            prompt += f"Sprint: {input_data['sprint']}\n"
        if input_data.get("team_context"):
            prompt += f"Team context: {input_data['team_context']}\n"
        prompt += "\nPrepare the JIRA ticket content. Return as JSON."

        response, usage = await claude_client.complete(
            messages=[{"role": "user", "content": prompt}],
            system=JIRA_SYSTEM_PROMPT,
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
            output = {"title": task.title, "description": response.content[0].text, "raw": True}

        preview = output.get("title", "") + " - " + output.get("action", "create")
        log.info("jira_handler_completed")

        return HandlerResult(
            output=output,
            preview=preview,
            confidence=0.85 if "raw" not in output else 0.55,
            model_used=usage.model,
            input_tokens=usage.input_tokens,
            output_tokens=usage.output_tokens,
            cost_usd=usage.cost_usd,
        )
