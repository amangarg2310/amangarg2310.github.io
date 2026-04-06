"""Tests for the insight extractor module."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestExtractInsights:
    @patch("processing.insight_extractor.anthropic")
    def test_extract_returns_list(self, mock_anthropic):
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(text=json.dumps([
                {
                    "title": "Test Insight",
                    "content": "This is a test insight about marketing.",
                    "insight_type": "tactic",
                    "sub_domain": "positioning",
                    "actionability": "high",
                    "key_quote": None,
                    "tags": ["marketing", "test"],
                }
            ]))
        ]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        from processing.insight_extractor import extract_insights

        with patch("processing.insight_extractor._load_prompt", return_value="Test prompt {expert_name} {channel_name} {video_title} {transcript_chunk}"):
            result = extract_insights("some transcript text", "Expert", "Channel")

        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["title"] == "Test Insight"

    @patch("processing.insight_extractor.anthropic")
    def test_extract_handles_markdown_json(self, mock_anthropic):
        mock_response = MagicMock()
        mock_response.content = [
            MagicMock(text='```json\n[{"title": "Test", "content": "Content"}]\n```')
        ]
        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response
        mock_anthropic.Anthropic.return_value = mock_client

        from processing.insight_extractor import extract_insights

        with patch("processing.insight_extractor._load_prompt", return_value="Test {expert_name} {channel_name} {video_title} {transcript_chunk}"):
            result = extract_insights("text", "Expert", "Channel")

        assert len(result) == 1
        assert result[0]["title"] == "Test"
