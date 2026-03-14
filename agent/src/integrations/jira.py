"""JIRA integration via the Atlassian REST API v3.

Manages issues, comments, and transitions in JIRA Cloud projects.

Requires: JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class JiraIntegration:
    """Interface to the JIRA REST API."""

    async def create_ticket(
        self,
        project_key: str,
        summary: str,
        description: str,
        issue_type: str = "Task",
        *,
        priority: str | None = None,
        labels: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a new JIRA issue.

        Args:
            project_key: JIRA project key (e.g. ``ENG``).
            summary: Issue summary / title.
            description: Detailed description (ADF or plain text).
            issue_type: Issue type name (Task, Bug, Story, etc.).
            priority: Optional priority name.
            labels: Optional list of labels.

        Returns:
            Created issue dict with ``key`` and ``id``.
        """
        logger.warning("jira.create_ticket not implemented", project=project_key)
        raise NotImplementedError("JiraIntegration.create_ticket is a stub")

    async def update_ticket(
        self,
        issue_key: str,
        fields: dict[str, Any],
    ) -> dict[str, Any]:
        """Update fields on an existing JIRA issue.

        Args:
            issue_key: Issue key (e.g. ``ENG-123``).
            fields: Dict of field names to new values.

        Returns:
            Updated issue dict.
        """
        logger.warning("jira.update_ticket not implemented", issue=issue_key)
        raise NotImplementedError("JiraIntegration.update_ticket is a stub")

    async def get_ticket(self, issue_key: str) -> dict[str, Any]:
        """Retrieve a JIRA issue by key.

        Args:
            issue_key: Issue key (e.g. ``ENG-123``).

        Returns:
            Full issue dict from the JIRA API.
        """
        logger.warning("jira.get_ticket not implemented", issue=issue_key)
        raise NotImplementedError("JiraIntegration.get_ticket is a stub")

    async def add_comment(self, issue_key: str, body: str) -> dict[str, Any]:
        """Add a comment to a JIRA issue.

        Args:
            issue_key: Issue key (e.g. ``ENG-123``).
            body: Comment body text.

        Returns:
            Created comment dict.
        """
        logger.warning("jira.add_comment not implemented", issue=issue_key)
        raise NotImplementedError("JiraIntegration.add_comment is a stub")
