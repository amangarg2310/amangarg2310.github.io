from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger()


@dataclass
class IntegrationHealth:
    name: str
    status: str = "unknown"  # healthy, degraded, unreachable, unknown
    latency_ms: int | None = None
    last_check: float | None = None
    last_error: str | None = None
    details: dict[str, Any] = field(default_factory=dict)


class HealthChecker:
    """Checks health of all connected integrations."""

    def __init__(self) -> None:
        self._results: dict[str, IntegrationHealth] = {}

    async def check_database(self) -> IntegrationHealth:
        from src.models.base import get_session
        from sqlalchemy import text

        health = IntegrationHealth(name="postgresql")
        start = time.monotonic()
        try:
            async with get_session() as session:
                await session.execute(text("SELECT 1"))
            health.status = "healthy"
            health.latency_ms = int((time.monotonic() - start) * 1000)
        except Exception as e:
            health.status = "unreachable"
            health.last_error = str(e)
        health.last_check = time.time()
        self._results["postgresql"] = health
        return health

    async def check_redis(self) -> IntegrationHealth:
        import redis.asyncio as aioredis
        from src.config import settings

        health = IntegrationHealth(name="redis")
        start = time.monotonic()
        try:
            r = aioredis.from_url(settings.redis_url)
            await r.ping()
            await r.aclose()
            health.status = "healthy"
            health.latency_ms = int((time.monotonic() - start) * 1000)
        except Exception as e:
            health.status = "unreachable"
            health.last_error = str(e)
        health.last_check = time.time()
        self._results["redis"] = health
        return health

    async def check_claude(self) -> IntegrationHealth:
        from src.config import settings

        health = IntegrationHealth(name="claude_api")
        if not settings.anthropic_api_key:
            health.status = "unknown"
            health.last_error = "API key not configured"
        else:
            health.status = "configured"
            health.details["model"] = settings.claude_default_model
        health.last_check = time.time()
        self._results["claude_api"] = health
        return health

    async def check_all(self) -> dict[str, Any]:
        """Run all health checks and return results."""
        checks = [
            self.check_database(),
            self.check_redis(),
            self.check_claude(),
        ]
        import asyncio

        results = await asyncio.gather(*checks, return_exceptions=True)
        return {
            name: {
                "status": h.status,
                "latency_ms": h.latency_ms,
                "last_check": h.last_check,
                "last_error": h.last_error,
            }
            for name, h in self._results.items()
        }


health_checker = HealthChecker()
