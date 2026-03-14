from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from src.models.task import Task


@dataclass
class HandlerResult:
    """Standard result returned by all handlers."""
    output: dict[str, Any] = field(default_factory=dict)
    preview: str | None = None
    confidence: float = 0.5
    model_used: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class BaseHandler(ABC):
    """Abstract base class for all task handlers."""

    @abstractmethod
    async def execute(self, task: Task) -> HandlerResult:
        """Execute the handler logic for the given task."""
        ...

    @abstractmethod
    def can_handle(self, task: Task) -> bool:
        """Check if this handler can process the given task."""
        ...

    @property
    @abstractmethod
    def handler_name(self) -> str:
        """Human-readable name for this handler."""
        ...
