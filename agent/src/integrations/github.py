"""GitHub integration via the GitHub REST / GraphQL API.

Manages repositories, issues, pull requests, and comments.

Requires: GITHUB_TOKEN
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class GitHubIntegration:
    """Interface to the GitHub API."""

    async def create_issue(
        self,
        repo: str,
        title: str,
        body: str,
        *,
        labels: list[str] | None = None,
        assignees: list[str] | None = None,
    ) -> dict[str, Any]:
        """Create a new GitHub issue.

        Args:
            repo: Repository in ``owner/repo`` format.
            title: Issue title.
            body: Issue body (Markdown).
            labels: Optional label names.
            assignees: Optional GitHub usernames.

        Returns:
            Created issue dict with ``number`` and ``html_url``.
        """
        logger.warning("github.create_issue not implemented", repo=repo)
        raise NotImplementedError("GitHubIntegration.create_issue is a stub")

    async def create_pr(
        self,
        repo: str,
        title: str,
        body: str,
        head: str,
        base: str = "main",
    ) -> dict[str, Any]:
        """Create a pull request.

        Args:
            repo: Repository in ``owner/repo`` format.
            title: PR title.
            body: PR description (Markdown).
            head: Source branch name.
            base: Target branch name.

        Returns:
            Created PR dict with ``number`` and ``html_url``.
        """
        logger.warning("github.create_pr not implemented", repo=repo)
        raise NotImplementedError("GitHubIntegration.create_pr is a stub")

    async def add_comment(
        self,
        repo: str,
        issue_number: int,
        body: str,
    ) -> dict[str, Any]:
        """Add a comment to an issue or pull request.

        Args:
            repo: Repository in ``owner/repo`` format.
            issue_number: Issue or PR number.
            body: Comment body (Markdown).

        Returns:
            Created comment dict.
        """
        logger.warning("github.add_comment not implemented", repo=repo)
        raise NotImplementedError("GitHubIntegration.add_comment is a stub")

    async def list_repos(self, org: str | None = None) -> list[dict[str, Any]]:
        """List repositories for the authenticated user or an organisation.

        Args:
            org: Optional organisation name; if None, lists user repos.

        Returns:
            List of repository summary dicts.
        """
        logger.warning("github.list_repos not implemented", org=org)
        raise NotImplementedError("GitHubIntegration.list_repos is a stub")
