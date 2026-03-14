from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from src.models.approval import Approval, ApprovalStatus
from src.models.base import get_session
from src.models.task import Task, TaskStatus, TaskType

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------


class CreateTaskRequest(BaseModel):
    title: str
    description: str
    task_type: TaskType
    priority: int = 5
    input_data: dict[str, Any] | None = None
    source: str | None = None


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    task_type: TaskType
    status: TaskStatus
    priority: int
    output_data: dict[str, Any] | None
    confidence_score: float | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}


class ApprovalDecisionRequest(BaseModel):
    status: ApprovalStatus
    reviewer: str
    feedback: str | None = None


class ApprovalResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    content_preview: str | None
    status: ApprovalStatus
    reviewer: str | None
    feedback: str | None
    created_at: datetime
    decision_at: datetime | None

    model_config = {"from_attributes": True}


class TriggerTaskRequest(BaseModel):
    task_type: TaskType
    title: str = "Manually triggered task"
    description: str = ""
    input_data: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Task Endpoints
# ---------------------------------------------------------------------------


@router.post("/tasks", response_model=TaskResponse, status_code=201)
async def create_task(payload: CreateTaskRequest):
    """Create a new task with PENDING status."""
    async with get_session() as session:
        task = Task(
            title=payload.title,
            description=payload.description,
            task_type=payload.task_type,
            status=TaskStatus.PENDING,
            priority=payload.priority,
            input_data=payload.input_data,
            source=payload.source,
        )
        session.add(task)
        await session.flush()
        await session.refresh(task)
        return task


@router.get("/tasks", response_model=list[TaskResponse])
async def list_tasks(
    status: TaskStatus | None = Query(None),
    task_type: TaskType | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List tasks with optional filters."""
    async with get_session() as session:
        stmt = select(Task)
        if status is not None:
            stmt = stmt.where(Task.status == status)
        if task_type is not None:
            stmt = stmt.where(Task.task_type == task_type)
        stmt = stmt.order_by(Task.created_at.desc()).limit(limit).offset(offset)
        result = await session.execute(stmt)
        return result.scalars().all()


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task(task_id: uuid.UUID):
    """Get a single task by ID."""
    async with get_session() as session:
        stmt = select(Task).where(Task.id == task_id)
        result = await session.execute(stmt)
        task = result.scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return task


@router.get("/tasks/{task_id}/output")
async def get_task_output(task_id: uuid.UUID):
    """Return the output_data payload for a completed task."""
    async with get_session() as session:
        stmt = select(Task).where(Task.id == task_id)
        result = await session.execute(stmt)
        task = result.scalar_one_or_none()
        if task is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"task_id": task.id, "output_data": task.output_data}


# ---------------------------------------------------------------------------
# Approval Endpoints
# ---------------------------------------------------------------------------


@router.get("/approvals", response_model=list[ApprovalResponse])
async def list_pending_approvals():
    """List all approvals that are still pending."""
    async with get_session() as session:
        stmt = (
            select(Approval)
            .where(Approval.status == ApprovalStatus.PENDING)
            .order_by(Approval.created_at.desc())
        )
        result = await session.execute(stmt)
        return result.scalars().all()


@router.get("/approvals/history", response_model=list[ApprovalResponse])
async def approval_history(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Return historical approval decisions."""
    async with get_session() as session:
        stmt = (
            select(Approval)
            .order_by(Approval.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await session.execute(stmt)
        return result.scalars().all()


@router.post("/approvals/{approval_id}/decide", response_model=ApprovalResponse)
async def decide_approval(approval_id: uuid.UUID, payload: ApprovalDecisionRequest):
    """Approve or reject a pending approval."""
    async with get_session() as session:
        stmt = select(Approval).where(Approval.id == approval_id)
        result = await session.execute(stmt)
        approval = result.scalar_one_or_none()
        if approval is None:
            raise HTTPException(status_code=404, detail="Approval not found")
        if approval.status != ApprovalStatus.PENDING:
            raise HTTPException(
                status_code=400,
                detail=f"Approval already resolved with status: {approval.status.value}",
            )

        from datetime import datetime, timezone

        approval.status = payload.status
        approval.reviewer = payload.reviewer
        approval.feedback = payload.feedback
        approval.decision_at = datetime.now(timezone.utc)
        await session.flush()
        await session.refresh(approval)
        return approval


# ---------------------------------------------------------------------------
# Manual Trigger (Testing)
# ---------------------------------------------------------------------------


@router.post("/tasks/trigger", response_model=TaskResponse, status_code=201)
async def trigger_task(payload: TriggerTaskRequest):
    """Manually trigger creation of a task for testing purposes."""
    async with get_session() as session:
        task = Task(
            title=payload.title,
            description=payload.description,
            task_type=payload.task_type,
            status=TaskStatus.PENDING,
            input_data=payload.input_data,
            source="manual_trigger",
        )
        session.add(task)
        await session.flush()
        await session.refresh(task)
        return task
