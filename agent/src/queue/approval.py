"""Approval queue logic.

Manages the human-in-the-loop approval workflow for tasks that require
review before execution or publication.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session  # noqa: F401 – used by type checkers

from src.models.approval import Approval, ApprovalStatus
from src.models.base import get_session
from src.models.task import Task, TaskStatus


class ApprovalQueue:
    """Manages submission, review, and decision workflow for approvals."""

    # ------------------------------------------------------------------
    # Submit
    # ------------------------------------------------------------------

    async def submit_for_approval(
        self, task_id: uuid.UUID, preview: str
    ) -> Approval:
        """Create an approval request for a task and mark the task as awaiting approval.

        Parameters
        ----------
        task_id:
            The UUID of the task that needs approval.
        preview:
            A human-readable preview of the content to be reviewed.

        Returns
        -------
        Approval
            The newly created ``Approval`` record.
        """
        async with get_session() as session:
            # Mark the task as awaiting approval
            task = await session.get(Task, task_id)
            if task is not None:
                task.status = TaskStatus.AWAITING_APPROVAL

            approval = Approval(
                task_id=task_id,
                content_preview=preview,
                status=ApprovalStatus.PENDING,
            )
            session.add(approval)
            return approval

    # ------------------------------------------------------------------
    # Query helpers
    # ------------------------------------------------------------------

    async def get_pending(self, limit: int = 20) -> list[Approval]:
        """Return pending approvals ordered by creation time (oldest first)."""
        async with get_session() as session:
            stmt = (
                select(Approval)
                .where(Approval.status == ApprovalStatus.PENDING)
                .order_by(Approval.created_at.asc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def get_history(self, limit: int = 50) -> list[Approval]:
        """Return recent approvals (all statuses) ordered newest-first."""
        async with get_session() as session:
            stmt = (
                select(Approval)
                .order_by(Approval.created_at.desc())
                .limit(limit)
            )
            result = await session.execute(stmt)
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Decision
    # ------------------------------------------------------------------

    async def decide(
        self,
        approval_id: uuid.UUID,
        status: ApprovalStatus,
        reviewer: str,
        feedback: str | None = None,
    ) -> Approval:
        """Record a reviewer's decision on an approval request.

        Side-effects on the related task:
        * **approved** -- task status set to APPROVED then COMPLETED.
        * **rejected** -- task status set to CANCELLED.
        * **revision_requested** -- task status set back to PENDING (re-queue).

        Parameters
        ----------
        approval_id:
            The UUID of the approval record to update.
        status:
            The decision (``APPROVED``, ``REJECTED``, or ``REVISION_REQUESTED``).
        reviewer:
            Identifier of the person making the decision.
        feedback:
            Optional free-text feedback for the task author.

        Returns
        -------
        Approval
            The updated ``Approval`` record.

        Raises
        ------
        ValueError
            If the approval record does not exist.
        """
        async with get_session() as session:
            approval = await session.get(Approval, approval_id)
            if approval is None:
                raise ValueError(f"Approval {approval_id} not found")

            # Record the decision
            approval.status = status
            approval.reviewer = reviewer
            approval.feedback = feedback
            approval.decision_at = datetime.now(timezone.utc)

            # Cascade status change to the related task
            task = await session.get(Task, approval.task_id)
            if task is not None:
                if status == ApprovalStatus.APPROVED:
                    task.status = TaskStatus.APPROVED
                    task.status = TaskStatus.COMPLETED
                    task.completed_at = datetime.now(timezone.utc)
                elif status == ApprovalStatus.REJECTED:
                    task.status = TaskStatus.CANCELLED
                elif status == ApprovalStatus.REVISION_REQUESTED:
                    task.status = TaskStatus.PENDING

            return approval
