from __future__ import annotations

import structlog

from src.integrations.claude_client import claude_client
from src.models.task import TaskType

logger = structlog.get_logger()

TASK_TYPE_VALUES = [t.value for t in TaskType]


async def classify_task(text: str) -> TaskType:
    """Classify incoming text into a TaskType using Claude."""
    result = await claude_client.classify(text, TASK_TYPE_VALUES)
    result_clean = result.strip().lower().replace(" ", "_")

    # Try to match against known types
    for task_type in TaskType:
        if task_type.value == result_clean:
            return task_type

    logger.warning("classification_fallback", raw_result=result, defaulting_to="content_creation")
    return TaskType.CONTENT_CREATION
