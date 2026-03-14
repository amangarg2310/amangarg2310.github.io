"""LinkedIn integration via the LinkedIn Marketing / Community Management API.

Publishes posts and retrieves profile information for the authenticated
LinkedIn account.

Requires: LINKEDIN_ACCESS_TOKEN
"""
from __future__ import annotations

from typing import Any

import structlog

logger = structlog.get_logger()


class LinkedInIntegration:
    """Interface to the LinkedIn API."""

    async def post(self, text: str, *, visibility: str = "PUBLIC") -> dict[str, Any]:
        """Create a share / post on LinkedIn.

        Args:
            text: Post body text.
            visibility: Visibility setting (PUBLIC, CONNECTIONS, etc.).

        Returns:
            LinkedIn API response with the share URN.
        """
        logger.warning("linkedin.post not implemented")
        raise NotImplementedError("LinkedInIntegration.post is a stub")

    async def get_profile(self) -> dict[str, Any]:
        """Retrieve the authenticated user's LinkedIn profile.

        Returns:
            Profile dict with name, headline, vanity name, etc.
        """
        logger.warning("linkedin.get_profile not implemented")
        raise NotImplementedError("LinkedInIntegration.get_profile is a stub")
