from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from src.config import AUTONOMY_CONFIG, settings
from src.orchestrator.engine import orchestrator
from src.orchestrator.router import list_handlers
from src.spy.costs import get_cost_summary
from src.spy.events import EventLevel, event_stream
from src.spy.health import health_checker

router = APIRouter(prefix="/spy", tags=["SPY Dashboard"])


@router.get("/status")
async def get_agent_status() -> dict[str, Any]:
    """Overall agent status."""
    return {
        "agent_name": settings.agent_name,
        "orchestrator_running": orchestrator.is_running,
        "registered_handlers": list_handlers(),
        "event_buffer_size": event_stream.total_events,
    }


@router.get("/events")
async def get_events(
    limit: int = 100,
    level: str | None = None,
    component: str | None = None,
) -> list[dict[str, Any]]:
    """Get recent events from the ring buffer."""
    event_level = EventLevel(level) if level else None
    return event_stream.get_recent(limit=limit, level=event_level, component=component)


@router.get("/costs")
async def get_costs() -> dict[str, Any]:
    """Get Claude API cost tracking summary."""
    return get_cost_summary()


@router.get("/health")
async def get_health() -> dict[str, Any]:
    """Check health of all integrations."""
    return await health_checker.check_all()


@router.get("/config")
async def get_config() -> dict[str, Any]:
    """Get current autonomy configuration."""
    return AUTONOMY_CONFIG


@router.put("/config/{task_type}")
async def update_config(task_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Update autonomy config for a task type (runtime, no restart needed)."""
    if task_type not in AUTONOMY_CONFIG:
        AUTONOMY_CONFIG[task_type] = {}
    AUTONOMY_CONFIG[task_type].update(config)
    event_stream.emit(
        f"Config updated for {task_type}",
        component="spy",
        details={"task_type": task_type, "new_config": config},
    )
    return AUTONOMY_CONFIG[task_type]


@router.post("/orchestrator/pause")
async def pause_orchestrator() -> dict[str, str]:
    """Pause the orchestrator."""
    await orchestrator.stop()
    event_stream.emit("Orchestrator paused", component="spy")
    return {"status": "paused"}


@router.post("/orchestrator/resume")
async def resume_orchestrator() -> dict[str, str]:
    """Resume the orchestrator."""
    import asyncio

    asyncio.create_task(orchestrator.start())
    event_stream.emit("Orchestrator resumed", component="spy")
    return {"status": "running"}
