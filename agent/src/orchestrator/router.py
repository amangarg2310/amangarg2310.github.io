from __future__ import annotations

import structlog

from src.handlers.base import BaseHandler
from src.models.task import TaskType

logger = structlog.get_logger()

# Handler registry — populated at startup
_handler_registry: dict[TaskType, BaseHandler] = {}


def register_handler(task_type: TaskType, handler: BaseHandler) -> None:
    """Register a handler for a task type."""
    _handler_registry[task_type] = handler
    logger.info("handler_registered", task_type=task_type.value, handler=handler.__class__.__name__)


def get_handler(task_type: TaskType) -> BaseHandler | None:
    """Get the registered handler for a task type."""
    return _handler_registry.get(task_type)


def list_handlers() -> dict[str, str]:
    """List all registered handlers."""
    return {
        task_type.value: handler.__class__.__name__
        for task_type, handler in _handler_registry.items()
    }
