from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI

from src.config import settings
from src.handlers.content import ContentHandler
from src.handlers.social import SocialHandler
from src.models.task import TaskType
from src.orchestrator.engine import orchestrator
from src.orchestrator.router import register_handler
from src.spy.dashboard import router as spy_router
from src.spy.events import event_stream

structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(
        structlog.get_level_from_name(settings.agent_log_level)
    ),
)
logger = structlog.get_logger()


def _register_handlers() -> None:
    """Register all available task handlers."""
    register_handler(TaskType.CONTENT_CREATION, ContentHandler())
    register_handler(TaskType.SOCIAL_POSTING, SocialHandler())

    # Register additional handlers if their modules are available
    try:
        from src.handlers.community import CommunityHandler
        register_handler(TaskType.COMMUNITY_REPLY, CommunityHandler())
    except ImportError:
        pass
    try:
        from src.handlers.email_handler import EmailHandler
        register_handler(TaskType.EMAIL, EmailHandler())
    except ImportError:
        pass
    try:
        from src.handlers.growth import GrowthHandler
        register_handler(TaskType.GROWTH_EXPERIMENT, GrowthHandler())
    except ImportError:
        pass
    try:
        from src.handlers.meeting import MeetingHandler
        register_handler(TaskType.MEETING_NOTES, MeetingHandler())
    except ImportError:
        pass
    try:
        from src.handlers.dev import DevHandler
        register_handler(TaskType.DEVELOPMENT, DevHandler())
    except ImportError:
        pass
    try:
        from src.handlers.research import ResearchHandler
        register_handler(TaskType.RESEARCH, ResearchHandler())
    except ImportError:
        pass
    try:
        from src.handlers.jira_handler import JiraHandler
        register_handler(TaskType.JIRA_MANAGEMENT, JiraHandler())
    except ImportError:
        pass
    try:
        from src.handlers.media import MediaHandler
        register_handler(TaskType.MEDIA_PRODUCTION, MediaHandler())
    except ImportError:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle — start orchestrator on boot, stop on shutdown."""
    _register_handlers()
    event_stream.emit(f"Agent {settings.agent_name} starting up", component="main")

    # Start orchestrator in background
    orchestrator_task = asyncio.create_task(orchestrator.start())
    logger.info("app_started", agent=settings.agent_name)

    yield

    await orchestrator.stop()
    orchestrator_task.cancel()
    event_stream.emit(f"Agent {settings.agent_name} shutting down", component="main")
    logger.info("app_stopped")


app = FastAPI(
    title=f"{settings.agent_name} — Autonomous AI Agent",
    description="Professional Autonomous GenAI Employee (PAGE Architecture)",
    version="0.1.0",
    lifespan=lifespan,
)

# Mount routers
app.include_router(spy_router)

# API and webhook routers — imported dynamically to avoid circular imports
try:
    from src.api.routes import router as api_router
    app.include_router(api_router)
except ImportError:
    pass

try:
    from src.api.webhooks import router as webhook_router
    app.include_router(webhook_router)
except ImportError:
    pass

try:
    from src.api.ws import router as ws_router
    app.include_router(ws_router)
except ImportError:
    pass


@app.get("/")
async def root():
    return {
        "agent": settings.agent_name,
        "status": "running" if orchestrator.is_running else "stopped",
        "docs": "/docs",
        "spy": "/spy/status",
    }


@app.get("/health")
async def health():
    return {"status": "ok", "agent": settings.agent_name}
