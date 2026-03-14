"""Manual task trigger for testing — creates a task and optionally waits for completion."""
from __future__ import annotations

import argparse
import asyncio
import uuid

from src.models.base import get_session
from src.models.task import Task, TaskStatus, TaskType


async def create_task(
    title: str,
    task_type: str,
    description: str | None = None,
    priority: int = 5,
) -> None:
    task_type_enum = TaskType(task_type)
    task = Task(
        title=title,
        description=description or title,
        task_type=task_type_enum,
        status=TaskStatus.PENDING,
        priority=priority,
    )

    async with get_session() as session:
        session.add(task)
        await session.flush()
        task_id = task.id

    print(f"Created task: {task_id}")
    print(f"  Type: {task_type}")
    print(f"  Title: {title}")
    print(f"  Status: pending")
    print(f"\nThe orchestrator will pick this up automatically.")
    print(f"Check status: GET /api/tasks/{task_id}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Manually create a task for testing")
    parser.add_argument("title", help="Task title")
    parser.add_argument(
        "--type", "-t",
        default="content_creation",
        choices=[t.value for t in TaskType],
        help="Task type",
    )
    parser.add_argument("--description", "-d", help="Task description")
    parser.add_argument("--priority", "-p", type=int, default=5, help="Priority (1=highest)")
    args = parser.parse_args()

    asyncio.run(create_task(args.title, args.type, args.description, args.priority))
