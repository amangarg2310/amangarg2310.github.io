from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import Any

from src.integrations.claude_client import claude_client


def get_cost_summary() -> dict[str, Any]:
    """Get current cost tracking summary."""
    daily = claude_client.get_daily_usage()
    if not daily:
        return {
            "date": date.today().isoformat(),
            "total_cost_usd": 0.0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "request_count": 0,
            "by_model": {},
            "budget_remaining_usd": claude_client.check_budget(),
        }

    from src.config import settings

    return {
        "date": daily.date.isoformat(),
        "total_cost_usd": round(daily.total_cost_usd, 4),
        "total_input_tokens": daily.total_input_tokens,
        "total_output_tokens": daily.total_output_tokens,
        "request_count": daily.request_count,
        "by_model": daily.by_model,
        "budget_limit_usd": settings.claude_daily_budget_usd,
        "budget_remaining_usd": round(
            settings.claude_daily_budget_usd - daily.total_cost_usd, 4
        ),
        "budget_used_pct": round(
            (daily.total_cost_usd / settings.claude_daily_budget_usd) * 100, 2
        ),
    }
