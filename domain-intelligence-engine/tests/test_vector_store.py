"""Tests for the vector store module (mocked Supabase)."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestVectorStore:
    @patch("storage.vector_store.create_client")
    def test_insert_insight(self, mock_create_client):
        mock_client = MagicMock()
        mock_table = MagicMock()
        mock_table.insert.return_value.execute.return_value.data = [{"id": "test-id"}]
        mock_client.table.return_value = mock_table
        mock_create_client.return_value = mock_client

        from storage.vector_store import VectorStore

        store = VectorStore()
        result = store.insert_insight(
            insight={
                "id": "test-id",
                "title": "Test",
                "content": "Test content",
                "domain": "product_marketing",
            },
            embedding=[0.1] * 1536,
        )

        assert result["id"] == "test-id"
        mock_table.insert.assert_called_once()

    @patch("storage.vector_store.create_client")
    def test_get_insights_by_domain(self, mock_create_client):
        mock_client = MagicMock()
        mock_chain = MagicMock()
        mock_chain.execute.return_value.data = [
            {"id": "1", "title": "Insight 1", "domain": "growth"},
        ]
        mock_client.table.return_value.select.return_value.eq.return_value.limit.return_value = mock_chain
        mock_create_client.return_value = mock_client

        from storage.vector_store import VectorStore

        store = VectorStore()
        results = store.get_insights_by_domain("growth")

        assert len(results) == 1
        assert results[0]["domain"] == "growth"
