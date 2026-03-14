from __future__ import annotations

from typing import Any

import structlog
from fastapi import APIRouter, Request
from sqlalchemy import select

from src.models.base import get_session
from src.models.task import Task, TaskStatus, TaskType

logger = structlog.get_logger()

router = APIRouter(prefix="/webhooks")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _task_type_for_source(source: str) -> TaskType:
    """Map a webhook source to a default TaskType."""
    mapping: dict[str, TaskType] = {
        "slack": TaskType.COMMUNITY_REPLY,
        "jira": TaskType.JIRA_MANAGEMENT,
        "github": TaskType.DEVELOPMENT,
    }
    return mapping.get(source, TaskType.RESEARCH)


async def _create_task_from_webhook(
    source: str,
    title: str,
    description: str,
    task_type: TaskType,
    input_data: dict[str, Any],
) -> dict[str, Any]:
    """Persist a new task from an incoming webhook payload."""
    async with get_session() as session:
        task = Task(
            title=title,
            description=description,
            task_type=task_type,
            status=TaskStatus.PENDING,
            source=source,
            input_data=input_data,
        )
        session.add(task)
        await session.flush()
        await session.refresh(task)
        logger.info("webhook_task_created", source=source, task_id=str(task.id))
        return {"ok": True, "task_id": str(task.id)}


# ---------------------------------------------------------------------------
# Slack
# ---------------------------------------------------------------------------


@router.post("/slack")
async def slack_webhook(request: Request):
    """Handle incoming Slack event callbacks.

    Slack sends a ``url_verification`` challenge on first setup and
    ``event_callback`` payloads for subscribed events.
    """
    body: dict[str, Any] = await request.json()

    # Respond to Slack URL verification challenge
    if body.get("type") == "url_verification":
        return {"challenge": body.get("challenge")}

    event = body.get("event", {})
    event_type = event.get("type", "unknown")
    text = event.get("text", "")

    logger.info("slack_webhook_received", event_type=event_type)

    return await _create_task_from_webhook(
        source="slack",
        title=f"Slack event: {event_type}",
        description=text[:500] if text else "Slack event received",
        task_type=TaskType.COMMUNITY_REPLY,
        input_data=body,
    )


# ---------------------------------------------------------------------------
# JIRA
# ---------------------------------------------------------------------------


@router.post("/jira")
async def jira_webhook(request: Request):
    """Handle JIRA webhook payloads (issue created, updated, etc.)."""
    body: dict[str, Any] = await request.json()
    webhook_event = body.get("webhookEvent", "unknown")
    issue = body.get("issue", {})
    issue_key = issue.get("key", "unknown")
    summary = issue.get("fields", {}).get("summary", "")

    logger.info("jira_webhook_received", event=webhook_event, issue=issue_key)

    return await _create_task_from_webhook(
        source="jira",
        title=f"JIRA {webhook_event}: {issue_key}",
        description=summary[:500] if summary else "JIRA event received",
        task_type=TaskType.JIRA_MANAGEMENT,
        input_data=body,
    )


# ---------------------------------------------------------------------------
# GitHub
# ---------------------------------------------------------------------------


@router.post("/github")
async def github_webhook(request: Request):
    """Handle GitHub webhook payloads (push, PR, issue, etc.)."""
    body: dict[str, Any] = await request.json()
    action = body.get("action", "")
    repo = body.get("repository", {}).get("full_name", "unknown")

    # Determine a human-readable title
    if "pull_request" in body:
        pr = body["pull_request"]
        title = f"GitHub PR {action}: {pr.get('title', '')}"
    elif "issue" in body:
        issue = body["issue"]
        title = f"GitHub issue {action}: {issue.get('title', '')}"
    else:
        title = f"GitHub event ({action}) on {repo}"

    logger.info("github_webhook_received", action=action, repo=repo)

    return await _create_task_from_webhook(
        source="github",
        title=title[:500],
        description=f"Repository: {repo}",
        task_type=TaskType.DEVELOPMENT,
        input_data=body,
    )


# ---------------------------------------------------------------------------
# Generic
# ---------------------------------------------------------------------------


@router.post("/generic")
async def generic_webhook(request: Request):
    """Accept an arbitrary JSON payload and create a task from it."""
    body: dict[str, Any] = await request.json()
    title = body.get("title", "Generic webhook task")
    description = body.get("description", "")
    task_type_raw = body.get("task_type")

    try:
        task_type = TaskType(task_type_raw) if task_type_raw else TaskType.RESEARCH
    except ValueError:
        task_type = TaskType.RESEARCH

    logger.info("generic_webhook_received", title=title)

    return await _create_task_from_webhook(
        source="generic",
        title=title[:500],
        description=description[:500] if description else "Generic webhook",
        task_type=task_type,
        input_data=body,
    )
