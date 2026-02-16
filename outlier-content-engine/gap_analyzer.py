"""
Gap Analyzer — compares own-brand patterns against competitor outlier patterns.

Identifies strategic gaps: hooks, formats, and patterns that competitors
use successfully but the brand hasn't tried yet. Also surfaces the brand's
own strengths for reinforcement.

Results are cached in gap_analysis_cache with a 24-hour TTL.
"""

import json
import logging
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import config

logger = logging.getLogger(__name__)


def _detect_hook_type(caption: str) -> str:
    """Detect hook type from caption text. Reuses pattern_analyzer logic."""
    if not caption:
        return "none"

    first_line = caption.split('\n')[0].strip()[:200]

    if '?' in first_line:
        return "question"
    if any(w in first_line.lower() for w in ['top', 'best', 'worst', '5 ', '3 ', '10 ', '7 ']):
        return "listicle"
    if any(w in first_line.lower() for w in ['never', 'stop', "don't", 'warning', 'mistake', 'wrong', 'truth', 'secret', 'shocking']):
        return "curiosity_gap"
    if any(w in first_line.lower() for w in ['how to', 'how i', 'tutorial', 'step by step', 'guide', 'learn']):
        return "educational"
    if any(w in first_line.lower() for w in ['i just', 'i was', 'story time', 'so i', 'when i', 'this is']):
        return "story"
    return "statement"


class GapAnalyzer:
    """Compares own-brand patterns against competitor outlier patterns."""

    CACHE_TTL_HOURS = 24

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH

    def analyze_gaps(self, force_refresh: bool = False) -> Dict:
        """
        Compare own-brand posts against competitor outlier patterns.

        Returns cached results if available and fresh (<24h). Use
        force_refresh=True to bypass cache.
        """
        if not force_refresh:
            cached = self._load_cache()
            if cached:
                return cached

        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get own-brand patterns
        own_patterns = self._get_own_brand_patterns(conn)
        if own_patterns is None:
            conn.close()
            return {
                "has_data": False,
                "message": "Set up your own brand handle in Settings to enable gap analysis.",
                "missing_hooks": [],
                "missing_patterns": [],
                "missing_formats": [],
                "underused_triggers": [],
                "own_strengths": [],
                "summary": "",
            }

        # Get competitor outlier patterns
        comp_patterns = self._get_competitor_outlier_patterns(conn)
        conn.close()

        if not comp_patterns["total"]:
            return {
                "has_data": False,
                "message": "No competitor outlier data yet. Run an analysis first.",
                "missing_hooks": [],
                "missing_patterns": [],
                "missing_formats": [],
                "underused_triggers": [],
                "own_strengths": [],
                "summary": "",
            }

        # Compute gaps
        result = self._compute_gaps(own_patterns, comp_patterns)
        result["has_data"] = True
        result["message"] = ""

        # Cache the result
        self._save_cache(result, own_patterns["total"], comp_patterns["total"])

        return result

    def _get_own_brand_patterns(self, conn) -> Optional[Dict]:
        """Extract patterns from own-brand posts."""
        rows = conn.execute("""
            SELECT caption, media_type, ai_analysis
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_own_channel = 1
              AND COALESCE(archived, 0) = 0
        """, (self.brand_profile,)).fetchall()

        if not rows:
            return None

        hooks = Counter()
        formats = Counter()
        patterns = Counter()
        triggers = Counter()

        for row in rows:
            # Detect hook from caption
            hook = _detect_hook_type(row["caption"] or "")
            hooks[hook] += 1

            # Count format
            fmt = row["media_type"] or "unknown"
            formats[fmt] += 1

            # Extract patterns from AI analysis if available
            if row["ai_analysis"]:
                try:
                    analysis = json.loads(row["ai_analysis"])
                    pattern = analysis.get("content_pattern", "")
                    if pattern:
                        patterns[pattern] += 1
                    trigger = analysis.get("emotional_trigger", "")
                    if trigger:
                        triggers[trigger] += 1
                except (json.JSONDecodeError, TypeError):
                    pass

        return {
            "hooks": dict(hooks),
            "formats": dict(formats),
            "patterns": dict(patterns),
            "triggers": dict(triggers),
            "total": len(rows),
        }

    def _get_competitor_outlier_patterns(self, conn) -> Dict:
        """Extract patterns from competitor outlier posts."""
        rows = conn.execute("""
            SELECT ai_analysis, media_type
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_outlier = 1
              AND COALESCE(is_own_channel, 0) = 0
              AND COALESCE(archived, 0) = 0
        """, (self.brand_profile,)).fetchall()

        hooks = Counter()
        formats = Counter()
        patterns = Counter()
        triggers = Counter()

        for row in rows:
            fmt = row["media_type"] or "unknown"
            formats[fmt] += 1

            if row["ai_analysis"]:
                try:
                    analysis = json.loads(row["ai_analysis"])
                    hook = analysis.get("hook_type", "")
                    if hook:
                        hooks[hook] += 1
                    pattern = analysis.get("content_pattern", "")
                    if pattern:
                        patterns[pattern] += 1
                    trigger = analysis.get("emotional_trigger", "")
                    if trigger:
                        triggers[trigger] += 1
                except (json.JSONDecodeError, TypeError):
                    pass

        return {
            "hooks": dict(hooks),
            "formats": dict(formats),
            "patterns": dict(patterns),
            "triggers": dict(triggers),
            "total": len(rows),
        }

    def _compute_gaps(self, own: Dict, comp: Dict) -> Dict:
        """Compute set differences between own and competitor patterns."""
        missing_hooks = []
        for hook, count in sorted(comp["hooks"].items(), key=lambda x: -x[1]):
            own_count = own["hooks"].get(hook, 0)
            if own_count == 0:
                missing_hooks.append({
                    "hook_type": hook,
                    "competitor_count": count,
                    "own_count": 0,
                })

        missing_formats = []
        for fmt, count in sorted(comp["formats"].items(), key=lambda x: -x[1]):
            own_count = own["formats"].get(fmt, 0)
            if own_count == 0:
                missing_formats.append({
                    "format": fmt,
                    "competitor_count": count,
                    "own_count": 0,
                })

        missing_patterns = []
        for pattern, count in sorted(comp["patterns"].items(), key=lambda x: -x[1]):
            own_count = own["patterns"].get(pattern, 0)
            if own_count == 0:
                missing_patterns.append({
                    "pattern": pattern,
                    "competitor_count": count,
                    "own_count": 0,
                })

        underused_triggers = []
        for trigger, count in sorted(comp["triggers"].items(), key=lambda x: -x[1]):
            own_count = own["triggers"].get(trigger, 0)
            if own_count == 0:
                underused_triggers.append({
                    "trigger": trigger,
                    "competitor_count": count,
                    "own_count": 0,
                })

        # Own strengths: patterns the brand uses that competitors don't
        own_strengths = []
        for hook, count in own["hooks"].items():
            if hook not in comp["hooks"] and count >= 2:
                own_strengths.append({"pattern": hook, "type": "hook", "own_count": count})
        for fmt, count in own["formats"].items():
            if fmt not in comp["formats"] and count >= 2:
                own_strengths.append({"pattern": fmt, "type": "format", "own_count": count})

        # Build summary
        summary_parts = []
        if missing_hooks:
            top_hooks = ", ".join(h["hook_type"] for h in missing_hooks[:3])
            summary_parts.append(f"You haven't used these hooks that work for competitors: {top_hooks}")
        if missing_formats:
            top_fmts = ", ".join(f["format"] for f in missing_formats[:2])
            summary_parts.append(f"Untapped formats: {top_fmts}")
        if missing_patterns:
            top_pats = ", ".join(p["pattern"] for p in missing_patterns[:2])
            summary_parts.append(f"Missing content patterns: {top_pats}")
        if not summary_parts:
            summary_parts.append("Your content covers most patterns competitors use.")

        return {
            "missing_hooks": missing_hooks[:5],
            "missing_patterns": missing_patterns[:5],
            "missing_formats": missing_formats[:5],
            "underused_triggers": underused_triggers[:5],
            "own_strengths": own_strengths[:5],
            "summary": ". ".join(summary_parts) + ".",
        }

    def _load_cache(self) -> Optional[Dict]:
        """Load cached gap analysis if fresh."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        try:
            row = conn.execute("""
                SELECT gap_data, computed_at
                FROM gap_analysis_cache
                WHERE brand_profile = ?
            """, (self.brand_profile,)).fetchone()
        except sqlite3.OperationalError:
            conn.close()
            return None

        conn.close()

        if not row:
            return None

        # Check TTL
        try:
            computed_at = datetime.fromisoformat(row["computed_at"])
            age = datetime.now(timezone.utc) - computed_at
            if age > timedelta(hours=self.CACHE_TTL_HOURS):
                return None
            return json.loads(row["gap_data"])
        except (ValueError, json.JSONDecodeError):
            return None

    def _save_cache(self, gap_data: Dict, own_count: int, comp_count: int) -> None:
        """Save gap analysis to cache."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc).isoformat()

        try:
            conn.execute("""
                INSERT INTO gap_analysis_cache
                    (brand_profile, computed_at, gap_data, own_post_count, competitor_outlier_count)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(brand_profile)
                DO UPDATE SET computed_at = ?, gap_data = ?,
                             own_post_count = ?, competitor_outlier_count = ?
            """, (
                self.brand_profile, now, json.dumps(gap_data), own_count, comp_count,
                now, json.dumps(gap_data), own_count, comp_count,
            ))
            conn.commit()
        except Exception as e:
            logger.warning(f"Failed to cache gap analysis: {e}")
        finally:
            conn.close()
