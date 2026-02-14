"""
Progress tracking for analysis pipeline.

Manages PID file and progress JSON to enable real-time progress updates
in the dashboard loading screen.
"""

import json
import logging
import os
import time
from pathlib import Path

import config

logger = logging.getLogger(__name__)


class ProgressTracker:
    """Tracks analysis progress using PID file and JSON progress data."""

    def __init__(self):
        """Initialize progress tracker with file paths."""
        self.pid_file = config.DATA_DIR / "analysis.pid"
        self.progress_file = config.DATA_DIR / "analysis_progress.json"
        self.start_time = None

    def start(self, total_brands_ig: int = 0, total_brands_tt: int = 0, is_cached: bool = False):
        """
        Start progress tracking.

        Args:
            total_brands_ig: Number of Instagram brands to analyze (for time estimation)
            total_brands_tt: Number of TikTok brands to analyze (for time estimation)
            is_cached: Whether this is a cached run (skipping data collection)
        """
        self.start_time = time.time()

        # Write PID file
        try:
            with open(self.pid_file, 'w') as f:
                f.write(str(os.getpid()))
            logger.info(f"Progress tracking started (PID: {os.getpid()})")
        except Exception as e:
            logger.warning(f"Failed to write PID file: {e}")

        # Write initial progress file
        progress_data = {
            "status": "running",
            "start_time": self.start_time,
            "progress_percent": 0,
            "message": "Starting analysis...",
            "is_cached": is_cached,
            "total_brands_ig": total_brands_ig,
            "total_brands_tt": total_brands_tt,
        }

        try:
            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)
            logger.info("Progress file initialized")
        except Exception as e:
            logger.warning(f"Failed to write progress file: {e}")

    def update(self, progress_percent: int, message: str):
        """
        Update progress during analysis.

        Args:
            progress_percent: Progress percentage (0-100)
            message: Status message to display
        """
        if not self.progress_file.exists():
            logger.warning("Progress file doesn't exist, cannot update")
            return

        try:
            # Read existing progress
            with open(self.progress_file, 'r') as f:
                progress_data = json.load(f)

            # Update fields
            progress_data["progress_percent"] = min(100, max(0, progress_percent))
            progress_data["message"] = message

            # Write back
            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)

            logger.debug(f"Progress updated: {progress_percent}% - {message}")
        except Exception as e:
            logger.warning(f"Failed to update progress: {e}")

    def complete(self):
        """Mark analysis as completed successfully."""
        end_time = time.time()

        try:
            # Read existing progress
            if self.progress_file.exists():
                with open(self.progress_file, 'r') as f:
                    progress_data = json.load(f)
            else:
                progress_data = {"start_time": self.start_time or end_time}

            # Update to completed state
            progress_data.update({
                "status": "completed",
                "end_time": end_time,
                "progress_percent": 100,
                "message": "Analysis complete!",
            })

            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)

            duration = end_time - (self.start_time or end_time)
            logger.info(f"Analysis completed in {duration:.1f}s")
        except Exception as e:
            logger.warning(f"Failed to mark completion: {e}")

    def error(self, error_message: str):
        """
        Mark analysis as failed with error.

        Args:
            error_message: Error description
        """
        end_time = time.time()

        try:
            # Read existing progress
            if self.progress_file.exists():
                with open(self.progress_file, 'r') as f:
                    progress_data = json.load(f)
            else:
                progress_data = {"start_time": self.start_time or end_time}

            # Update to error state
            progress_data.update({
                "status": "error",
                "end_time": end_time,
                "error": error_message,
                "message": "Analysis failed",
            })

            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)

            logger.error(f"Analysis failed: {error_message}")
        except Exception as e:
            logger.warning(f"Failed to mark error: {e}")
