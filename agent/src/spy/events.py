from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any
from enum import Enum

import structlog

logger = structlog.get_logger()


class EventLevel(str, Enum):
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


@dataclass
class AgentEvent:
    timestamp: float = field(default_factory=time.time)
    level: EventLevel = EventLevel.INFO
    component: str = ""
    message: str = ""
    details: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["level"] = self.level.value
        return d


class EventStream:
    """Ring-buffer backed event stream with subscriber broadcasting."""

    BUFFER_SIZE = 2000

    def __init__(self) -> None:
        self._buffer: deque[AgentEvent] = deque(maxlen=self.BUFFER_SIZE)
        self._subscribers: list[asyncio.Queue] = []

    def emit(
        self,
        message: str,
        component: str = "system",
        level: EventLevel = EventLevel.INFO,
        details: dict[str, Any] | None = None,
    ) -> None:
        event = AgentEvent(
            level=level,
            component=component,
            message=message,
            details=details or {},
        )
        self._buffer.append(event)
        for queue in self._subscribers:
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self._subscribers = [q for q in self._subscribers if q is not queue]

    def get_recent(
        self,
        limit: int = 100,
        level: EventLevel | None = None,
        component: str | None = None,
    ) -> list[dict[str, Any]]:
        events = list(self._buffer)
        if level:
            events = [e for e in events if e.level == level]
        if component:
            events = [e for e in events if e.component == component]
        return [e.to_dict() for e in events[-limit:]]

    @property
    def total_events(self) -> int:
        return len(self._buffer)


# Singleton
event_stream = EventStream()
