from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from datetime import date
from typing import Any

import anthropic
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from src.config import settings

logger = structlog.get_logger()

# Pricing per 1M tokens (USD) — updated as of 2025
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-6": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.0},
}


@dataclass
class UsageRecord:
    model: str
    input_tokens: int
    output_tokens: int
    cost_usd: float
    timestamp: float = field(default_factory=time.time)
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class DailyUsage:
    date: date
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_usd: float = 0.0
    request_count: int = 0
    by_model: dict[str, dict[str, float]] = field(default_factory=dict)


class ClaudeClient:
    """Wrapper around the Anthropic SDK with cost tracking and retry logic."""

    def __init__(self) -> None:
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self._usage_records: list[UsageRecord] = []
        self._daily_usage: dict[str, DailyUsage] = {}

    @staticmethod
    def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = MODEL_PRICING.get(model)
        if not pricing:
            # Fallback to Sonnet pricing for unknown models
            pricing = MODEL_PRICING["claude-sonnet-4-20250514"]
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        return round(input_cost + output_cost, 6)

    def _track_usage(self, model: str, input_tokens: int, output_tokens: int) -> UsageRecord:
        cost = self.estimate_cost(model, input_tokens, output_tokens)
        record = UsageRecord(
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_usd=cost,
        )
        self._usage_records.append(record)

        today = date.today().isoformat()
        if today not in self._daily_usage:
            self._daily_usage[today] = DailyUsage(date=date.today())
        daily = self._daily_usage[today]
        daily.total_input_tokens += input_tokens
        daily.total_output_tokens += output_tokens
        daily.total_cost_usd += cost
        daily.request_count += 1

        if model not in daily.by_model:
            daily.by_model[model] = {"input_tokens": 0, "output_tokens": 0, "cost_usd": 0.0}
        daily.by_model[model]["input_tokens"] += input_tokens
        daily.by_model[model]["output_tokens"] += output_tokens
        daily.by_model[model]["cost_usd"] += cost

        return record

    def check_budget(self) -> bool:
        today = date.today().isoformat()
        daily = self._daily_usage.get(today)
        if not daily:
            return True
        return daily.total_cost_usd < settings.claude_daily_budget_usd

    def get_daily_usage(self) -> DailyUsage | None:
        today = date.today().isoformat()
        return self._daily_usage.get(today)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        reraise=True,
    )
    async def complete(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        model: str | None = None,
        max_tokens: int | None = None,
        tools: list[dict[str, Any]] | None = None,
        temperature: float = 0.7,
    ) -> tuple[anthropic.types.Message, UsageRecord]:
        """Send a completion request to Claude with automatic cost tracking."""
        if not self.check_budget():
            raise BudgetExceededError(
                f"Daily budget of ${settings.claude_daily_budget_usd:.2f} exceeded"
            )

        model = model or settings.claude_default_model
        max_tokens = max_tokens or settings.claude_max_tokens

        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = tools

        start = time.monotonic()
        response = await self.client.messages.create(**kwargs)
        duration_ms = int((time.monotonic() - start) * 1000)

        usage_record = self._track_usage(
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

        logger.info(
            "claude_api_call",
            model=model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            cost_usd=usage_record.cost_usd,
            duration_ms=duration_ms,
            stop_reason=response.stop_reason,
        )

        return response, usage_record

    async def classify(self, text: str, categories: list[str]) -> str:
        """Use Claude to classify text into one of the given categories."""
        system = (
            "You are a task classifier. Respond with ONLY the category name, nothing else."
        )
        prompt = (
            f"Classify the following text into one of these categories: "
            f"{', '.join(categories)}\n\nText: {text}"
        )
        response, _ = await self.complete(
            messages=[{"role": "user", "content": prompt}],
            system=system,
            model="claude-haiku-4-5-20251001",
            max_tokens=50,
            temperature=0.0,
        )
        return response.content[0].text.strip()

    async def plan(self, task_description: str, context: str = "") -> dict[str, Any]:
        """Use Claude to generate an execution plan for a task."""
        system = (
            "You are a task planner for an autonomous AI agent. "
            "Generate a structured execution plan as JSON with keys: "
            "'steps' (list of step descriptions), 'tools_needed' (list of tool names), "
            "'estimated_confidence' (float 0-1), 'requires_approval' (bool)."
        )
        prompt = f"Task: {task_description}"
        if context:
            prompt = f"Context:\n{context}\n\n{prompt}"

        response, _ = await self.complete(
            messages=[{"role": "user", "content": prompt}],
            system=system,
            temperature=0.3,
        )
        # Parse JSON from response
        import json

        text = response.content[0].text
        # Try to extract JSON from markdown code blocks if present
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0]
        elif "```" in text:
            text = text.split("```")[1].split("```")[0]
        return json.loads(text.strip())


class BudgetExceededError(Exception):
    pass


# Singleton client instance
claude_client = ClaudeClient()
