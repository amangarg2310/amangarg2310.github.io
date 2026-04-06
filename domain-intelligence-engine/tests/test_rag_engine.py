"""Tests for the RAG engine module."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestAnswerQuestion:
    @patch("query.rag_engine.VectorStore")
    @patch("query.rag_engine.anthropic")
    def test_answer_with_results(self, mock_anthropic, mock_store_cls):
        # Mock vector store search
        mock_store = MagicMock()
        mock_store.search_similar.return_value = [
            {
                "title": "Positioning Framework",
                "content": "Start with the customer problem.",
                "expert_name": "April Dunford",
                "source_title": "Positioning Masterclass",
                "source_url": "https://youtube.com/watch?v=abc",
                "insight_type": "framework",
                "actionability": "high",
                "confidence": 0.9,
                "similarity": 0.85,
            }
        ]
        mock_store_cls.return_value = mock_store

        # Mock Claude response
        mock_response = MagicMock()
        mock_response.content = [MagicMock(text="Here is the synthesized answer about positioning.")]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        from query.rag_engine import answer_question

        with patch("query.rag_engine._load_prompt", return_value="Test {context} {question}"):
            result = answer_question("How should I position my product?")

        assert "answer" in result
        assert "sources" in result
        assert len(result["sources"]) > 0
        assert result["metadata"]["retrieved_count"] == 1

    @patch("query.rag_engine.VectorStore")
    def test_answer_no_results(self, mock_store_cls):
        mock_store = MagicMock()
        mock_store.search_similar.return_value = []
        mock_store_cls.return_value = mock_store

        from query.rag_engine import answer_question

        result = answer_question("Unknown topic question")

        assert "don't have enough" in result["answer"]
        assert result["sources"] == []
