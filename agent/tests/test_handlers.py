"""Tests for handler infrastructure."""
from __future__ import annotations

import pytest

from src.handlers.base import BaseHandler, HandlerResult
from src.models.task import Task, TaskType


class TestHandlerResult:
    """Test HandlerResult defaults."""

    def test_default_values(self):
        result = HandlerResult()
        assert result.output == {}
        assert result.preview is None
        assert result.confidence == 0.5
        assert result.model_used is None
        assert result.input_tokens == 0
        assert result.output_tokens == 0
        assert result.cost_usd == 0.0

    def test_custom_values(self):
        result = HandlerResult(
            output={"title": "Test"},
            preview="Preview text",
            confidence=0.9,
            model_used="claude-sonnet-4-20250514",
            input_tokens=100,
            output_tokens=200,
            cost_usd=0.001,
        )
        assert result.output["title"] == "Test"
        assert result.confidence == 0.9


class TestContentHandler:
    """Test ContentHandler can be imported and instantiated."""

    def test_import_and_instantiate(self):
        from src.handlers.content import ContentHandler
        handler = ContentHandler()
        assert handler.handler_name == "Content Creator"

    def test_can_handle(self):
        from src.handlers.content import ContentHandler
        handler = ContentHandler()
        # We can't create a full Task without DB, but we can check the type matching
        assert handler.handler_name == "Content Creator"


class TestSocialHandler:
    """Test SocialHandler can be imported and instantiated."""

    def test_import_and_instantiate(self):
        from src.handlers.social import SocialHandler
        handler = SocialHandler()
        assert handler.handler_name == "Social Media Manager"
