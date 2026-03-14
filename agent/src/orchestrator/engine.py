from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

import structlog
from sqlalchemy import select

from src.config import AUTONOMY_CONFIG, settings
from src.models.approval import Approval, ApprovalStatus
from src.models.audit import AuditLog
from src.models.base import get_session
from src.models.task import Task, TaskStatus
from src.orchestrator.classifier import classify_task
from src.orchestrator.planner import create_plan, should_require_approval
from src.orchestrator.router import get_handler

logger = structlog.get_logger()


class OrchestratorEngine:
    """Main orchestration loop — polls for tasks and processes them."""

    def __init__(self) -> None:
        self._running = False
        self._poll_interval = settings.orchestrator_poll_interval

    async def start(self) -> None:
        """Start the orchestration loop."""
        self._running = True
        logger.info("orchestrator_started", agent=settings.agent_name)
        while self._running:
            try:
                await self._poll_and_process()
            except Exception as e:
                logger.error("orchestrator_loop_error", error=str(e))
            await asyncio.sleep(self._poll_interval)

    async def stop(self) -> None:
        """Stop the orchestration loop."""
        self._running = False
        logger.info("orchestrator_stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    async def _poll_and_process(self) -> None:
        """Poll for the next pending task and process it."""
        async with get_session() as session:
            stmt = (
                select(Task)
                .where(Task.status == TaskStatus.PENDING)
                .order_by(Task.priority.asc(), Task.created_at.asc())
                .limit(1)
                .with_for_update(skip_locked=True)
            )
            result = await session.execute(stmt)
            task = result.scalar_one_or_none()
            if not task:
                return

            task.status = TaskStatus.PROCESSING
            await session.flush()

        await self._process_task(task)

    async def _process_task(self, task: Task) -> None:
        """Process a single task through the full pipeline."""
        log = logger.bind(task_id=str(task.id), task_type=task.task_type.value)
        log.info("task_processing_started")

        try:
            # Step 1: Get autonomy config for this task type
            config = AUTONOMY_CONFIG.get(task.task_type.value, {})

            # Step 2: Create execution plan
            context = ""
            plan = await create_plan(task.description or task.title, context)
            log.info("plan_created", confidence=plan.estimated_confidence, steps=len(plan.steps))

            # Step 3: Get handler
            handler = get_handler(task.task_type)
            if not handler:
                await self._fail_task(task, f"No handler registered for {task.task_type.value}")
                return

            # Step 4: Execute handler
            result = await handler.execute(task)

            # Step 5: Update task with results
            async with get_session() as session:
                task = await session.get(Task, task.id)
                task.output_data = result.output
                task.confidence_score = result.confidence

                # Step 6: Check if approval is needed
                if should_require_approval(plan, config):
                    task.status = TaskStatus.AWAITING_APPROVAL
                    approval = Approval(
                        task_id=task.id,
                        content_preview=result.preview or str(result.output)[:1000],
                    )
                    session.add(approval)
                    log.info("task_awaiting_approval")
                else:
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = datetime.now(timezone.utc)
                    log.info("task_completed_auto_approved")

                # Step 7: Audit log
                audit = AuditLog(
                    task_id=task.id,
                    event_type="task_processed",
                    details={
                        "plan_steps": plan.steps,
                        "confidence": result.confidence,
                        "handler": handler.__class__.__name__,
                    },
                    model_used=result.model_used,
                    input_tokens=result.input_tokens,
                    output_tokens=result.output_tokens,
                    cost_usd=result.cost_usd,
                )
                session.add(audit)

        except Exception as e:
            log.error("task_processing_failed", error=str(e))
            await self._fail_task(task, str(e))

    async def _fail_task(self, task: Task, error: str) -> None:
        """Mark a task as failed and log the error."""
        async with get_session() as session:
            task = await session.get(Task, task.id)
            task.retry_count += 1
            if task.retry_count < task.max_retries:
                task.status = TaskStatus.PENDING
                logger.info("task_retrying", task_id=str(task.id), attempt=task.retry_count)
            else:
                task.status = TaskStatus.FAILED
                task.error_message = error
                logger.error("task_failed_permanently", task_id=str(task.id), error=error)

            audit = AuditLog(
                task_id=task.id,
                event_type="task_failed",
                details={"error": error, "retry_count": task.retry_count},
            )
            session.add(audit)


# Singleton engine
orchestrator = OrchestratorEngine()
