from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import structlog

from src.integrations.claude_client import claude_client

logger = structlog.get_logger()


@dataclass
class ExecutionPlan:
    steps: list[str] = field(default_factory=list)
    tools_needed: list[str] = field(default_factory=list)
    estimated_confidence: float = 0.5
    requires_approval: bool = True


async def create_plan(task_description: str, context: str = "") -> ExecutionPlan:
    """Use Claude to generate an execution plan for a task."""
    try:
        result = await claude_client.plan(task_description, context)
        return ExecutionPlan(
            steps=result.get("steps", []),
            tools_needed=result.get("tools_needed", []),
            estimated_confidence=result.get("estimated_confidence", 0.5),
            requires_approval=result.get("requires_approval", True),
        )
    except Exception as e:
        logger.error("planning_failed", error=str(e))
        return ExecutionPlan(
            steps=[f"Execute task: {task_description}"],
            tools_needed=[],
            estimated_confidence=0.3,
            requires_approval=True,
        )


def should_require_approval(
    plan: ExecutionPlan, config: dict[str, Any]
) -> bool:
    """Determine if a task needs human approval based on plan and config."""
    if config.get("approval_required", True):
        return True
    threshold = config.get("confidence_threshold", 0.85)
    if plan.estimated_confidence < threshold:
        return True
    return plan.requires_approval
