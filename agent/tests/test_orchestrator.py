"""Tests for the orchestrator components."""
from __future__ import annotations

import pytest

from src.config import AUTONOMY_CONFIG
from src.models.task import TaskStatus, TaskType
from src.orchestrator.planner import ExecutionPlan, should_require_approval


class TestPlannerApprovalLogic:
    """Test approval decision logic without requiring external services."""

    def test_approval_required_by_config(self):
        plan = ExecutionPlan(estimated_confidence=0.99, requires_approval=False)
        config = {"approval_required": True, "confidence_threshold": 0.5}
        assert should_require_approval(plan, config) is True

    def test_low_confidence_triggers_approval(self):
        plan = ExecutionPlan(estimated_confidence=0.5, requires_approval=False)
        config = {"approval_required": False, "confidence_threshold": 0.85}
        assert should_require_approval(plan, config) is True

    def test_high_confidence_no_approval(self):
        plan = ExecutionPlan(estimated_confidence=0.95, requires_approval=False)
        config = {"approval_required": False, "confidence_threshold": 0.85}
        assert should_require_approval(plan, config) is False

    def test_plan_requires_approval(self):
        plan = ExecutionPlan(estimated_confidence=0.99, requires_approval=True)
        config = {"approval_required": False, "confidence_threshold": 0.5}
        assert should_require_approval(plan, config) is True


class TestTaskStates:
    """Test task state definitions."""

    def test_all_states_defined(self):
        expected = {
            "pending", "queued", "processing", "awaiting_approval",
            "approved", "executing", "completed", "failed", "cancelled",
        }
        actual = {s.value for s in TaskStatus}
        assert actual == expected

    def test_all_task_types_defined(self):
        expected = {
            "content_creation", "social_posting", "community_reply",
            "email", "growth_experiment", "meeting_notes",
            "development", "research", "jira_management", "media_production",
        }
        actual = {t.value for t in TaskType}
        assert actual == expected


class TestAutonomyConfig:
    """Test autonomy configuration structure."""

    def test_all_configs_have_required_keys(self):
        required_keys = {"approval_required", "confidence_threshold", "max_revisions", "allowed_models"}
        for task_type, config in AUTONOMY_CONFIG.items():
            for key in required_keys:
                assert key in config, f"Missing '{key}' in config for '{task_type}'"

    def test_thresholds_in_range(self):
        for task_type, config in AUTONOMY_CONFIG.items():
            threshold = config["confidence_threshold"]
            assert 0.0 <= threshold <= 1.0, f"Invalid threshold for {task_type}: {threshold}"
