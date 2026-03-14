"""Tests for integration components."""
from __future__ import annotations

import pytest

from src.integrations.claude_client import ClaudeClient, MODEL_PRICING


class TestCostEstimation:
    """Test Claude API cost estimation."""

    def test_sonnet_pricing(self):
        cost = ClaudeClient.estimate_cost(
            "claude-sonnet-4-20250514",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost == 3.0 + 15.0  # $3 input + $15 output per 1M

    def test_haiku_pricing(self):
        cost = ClaudeClient.estimate_cost(
            "claude-haiku-4-5-20251001",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost == 0.80 + 4.0

    def test_opus_pricing(self):
        cost = ClaudeClient.estimate_cost(
            "claude-opus-4-6",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        assert cost == 15.0 + 75.0

    def test_small_usage(self):
        cost = ClaudeClient.estimate_cost(
            "claude-sonnet-4-20250514",
            input_tokens=1000,
            output_tokens=500,
        )
        # 1000/1M * 3.0 + 500/1M * 15.0 = 0.003 + 0.0075 = 0.0105
        assert abs(cost - 0.0105) < 0.0001

    def test_unknown_model_fallback(self):
        cost = ClaudeClient.estimate_cost(
            "unknown-model",
            input_tokens=1_000_000,
            output_tokens=1_000_000,
        )
        # Falls back to Sonnet pricing
        assert cost == 18.0


class TestClaudeClient:
    """Test ClaudeClient initialization."""

    def test_instantiation(self):
        client = ClaudeClient()
        assert client._usage_records == []
        assert client._daily_usage == {}

    def test_budget_check_no_usage(self):
        client = ClaudeClient()
        assert client.check_budget() is True

    def test_all_models_have_pricing(self):
        for model in MODEL_PRICING:
            assert "input" in MODEL_PRICING[model]
            assert "output" in MODEL_PRICING[model]


class TestEventStream:
    """Test SPY event stream."""

    def test_emit_and_retrieve(self):
        from src.spy.events import EventStream, EventLevel

        stream = EventStream()
        stream.emit("test event", component="test")
        events = stream.get_recent(limit=10)
        assert len(events) == 1
        assert events[0]["message"] == "test event"

    def test_ring_buffer_limit(self):
        from src.spy.events import EventStream

        stream = EventStream()
        for i in range(2500):
            stream.emit(f"event {i}")
        assert stream.total_events == 2000  # Buffer max size

    def test_filter_by_level(self):
        from src.spy.events import EventStream, EventLevel

        stream = EventStream()
        stream.emit("info event", level=EventLevel.INFO)
        stream.emit("error event", level=EventLevel.ERROR)
        errors = stream.get_recent(level=EventLevel.ERROR)
        assert len(errors) == 1
        assert errors[0]["message"] == "error event"
