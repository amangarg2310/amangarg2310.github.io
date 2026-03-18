"""Tests for the transcript fetcher module."""

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from ingestion.transcript_fetcher import (
    extract_video_id,
    save_transcript,
    transcript_to_text,
)


class TestExtractVideoId:
    def test_full_url(self):
        assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_short_url(self):
        assert extract_video_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_bare_id(self):
        assert extract_video_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"

    def test_url_with_params(self):
        assert extract_video_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120") == "dQw4w9WgXcQ"

    def test_invalid_url(self):
        with pytest.raises(ValueError):
            extract_video_id("not-a-valid-url-or-id")


class TestTranscriptToText:
    def test_basic(self):
        segments = [
            {"text": "Hello", "start": 0, "duration": 1},
            {"text": "world", "start": 1, "duration": 1},
        ]
        assert transcript_to_text(segments) == "Hello world"

    def test_empty(self):
        assert transcript_to_text([]) == ""


class TestSaveTranscript:
    def test_save_and_load(self, tmp_path):
        segments = [
            {"text": "Test segment", "start": 0.0, "duration": 5.0},
        ]
        with patch("ingestion.transcript_fetcher.TRANSCRIPTS_DIR", tmp_path):
            save_path = save_transcript("test123", segments, metadata={"title": "Test"})

        assert (save_path / "segments.json").exists()
        assert (save_path / "transcript.txt").exists()
        assert (save_path / "metadata.json").exists()

        with open(save_path / "segments.json") as f:
            loaded = json.load(f)
        assert loaded == segments

        with open(save_path / "transcript.txt") as f:
            assert f.read() == "Test segment"
