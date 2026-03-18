"""
Content Optimizer — LLM-powered concept improvement.

Uses GPT-4o-mini to suggest improvements to a content concept based on
its score breakdown, top outlier patterns, voice profile, and gap analysis.

Only called on explicit "Optimize" action — not during initial scoring.
Cost: ~$0.0003 per optimization call.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import Dict, Optional

from openai import OpenAI

import config

logger = logging.getLogger(__name__)


class ContentOptimizer:
    """Uses GPT-4o-mini to suggest improvements to a content concept."""

    def __init__(self, brand_profile: str, db_path=None):
        self.brand_profile = brand_profile
        self.db_path = db_path or config.DB_PATH

    def optimize(self, concept: Dict, score_data: Dict) -> Dict:
        """
        Given a concept and its score breakdown, generate specific improvements.

        Args:
            concept: {"caption": str, "hook_line": str, "format": str, "platform": str}
            score_data: {"overall_score": int, "breakdown": {...}, "suggestions": [...]}

        Returns:
            {
                "improved_caption": str,
                "improved_hook": str,
                "improvements": [{"area": str, "suggestion": str}],
                "format_recommendation": str,
                "confidence": str,
            }
        """
        system_prompt = self._build_system_prompt(score_data)
        user_prompt = self._build_user_prompt(concept, score_data)

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
                max_tokens=600,
                response_format={"type": "json_object"},
            )

            # Log token usage
            self._log_usage(response.usage)

            result = json.loads(response.choices[0].message.content)

            # Ensure required fields
            return {
                "improved_caption": result.get("improved_caption", concept.get("caption", "")),
                "improved_hook": result.get("improved_hook", ""),
                "improvements": result.get("improvements", []),
                "format_recommendation": result.get("format_recommendation", concept.get("format", "reel")),
                "confidence": result.get("confidence", "medium"),
            }

        except Exception as e:
            logger.error(f"Optimization failed: {e}")
            return {
                "improved_caption": concept.get("caption", ""),
                "improved_hook": "",
                "improvements": [{"area": "error", "suggestion": f"Optimization failed: {e}"}],
                "format_recommendation": concept.get("format", "reel"),
                "confidence": "low",
            }

    def _build_system_prompt(self, score_data: Dict) -> str:
        """Build compressed system prompt with scoring context."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get top 3 outlier patterns
        top_patterns = []
        rows = conn.execute("""
            SELECT ai_analysis
            FROM competitor_posts
            WHERE brand_profile = ? AND is_outlier = 1
              AND COALESCE(is_own_channel, 0) = 0
              AND ai_analysis IS NOT NULL
            ORDER BY outlier_score DESC LIMIT 5
        """, (self.brand_profile,)).fetchall()

        for row in rows:
            try:
                analysis = json.loads(row["ai_analysis"])
                pattern = analysis.get("content_pattern", "")
                hook = analysis.get("hook_type", "")
                if pattern:
                    top_patterns.append(f"{pattern} ({hook} hook)")
            except (json.JSONDecodeError, TypeError):
                pass

        # Get voice summary
        voice_summary = "No voice profile available."
        try:
            voice_row = conn.execute("""
                SELECT voice_data FROM voice_analysis
                WHERE brand_profile = ?
                ORDER BY analyzed_at DESC LIMIT 1
            """, (self.brand_profile,)).fetchone()
            if voice_row:
                vd = json.loads(voice_row["voice_data"])
                voice_summary = vd.get("voice_summary", voice_summary)
                phrases = vd.get("vocabulary", {}).get("distinctive_phrases", [])
                if phrases:
                    voice_summary += f" Signature phrases: {', '.join(phrases[:3])}"
        except (sqlite3.OperationalError, json.JSONDecodeError):
            pass

        # Get gap summary
        gap_summary = ""
        try:
            gap_row = conn.execute("""
                SELECT gap_data FROM gap_analysis_cache
                WHERE brand_profile = ?
            """, (self.brand_profile,)).fetchone()
            if gap_row:
                gaps = json.loads(gap_row["gap_data"])
                missing = [h["hook_type"] for h in gaps.get("missing_hooks", [])[:2]]
                if missing:
                    gap_summary = f"Untapped hooks: {', '.join(missing)}."
        except (sqlite3.OperationalError, json.JSONDecodeError):
            pass

        conn.close()

        # Build breakdown summary
        breakdown = score_data.get("breakdown", {})
        weak_areas = []
        for area, data in breakdown.items():
            if isinstance(data, dict) and data.get("score", 20) < 12:
                weak_areas.append(f"{area}: {data.get('score', '?')}/20 — {data.get('reasoning', '')}")

        patterns_str = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(top_patterns[:3]))
        if not patterns_str:
            patterns_str = "  (no pattern data yet)"

        return f"""You are a social media content optimizer. Rewrite the user's concept to maximize engagement.

TOP OUTLIER PATTERNS:
{patterns_str}

BRAND VOICE: {voice_summary}
{f"GAPS TO FILL: {gap_summary}" if gap_summary else ""}

WEAK AREAS TO FIX:
{chr(10).join(f"  - {w}" for w in weak_areas) if weak_areas else "  (all areas scored well)"}

Return JSON: {{"improved_caption": "rewritten caption in brand voice", "improved_hook": "stronger opening line", "improvements": [{{"area": "hook_strength|format_fit|pattern_alignment|voice_match|competitive_gap_fill", "suggestion": "what you changed and why"}}], "format_recommendation": "reel|carousel|static|story", "confidence": "high|medium|low"}}"""

    def _build_user_prompt(self, concept: Dict, score_data: Dict) -> str:
        """Build the user prompt with the original concept."""
        return f"""Original concept:
Caption: "{concept.get('caption', '')}"
Hook: "{concept.get('hook_line', '')}"
Format: {concept.get('format', 'reel')}
Platform: {concept.get('platform', 'instagram')}
Current score: {score_data.get('overall_score', '?')}/100

Rewrite to maximize the score. Focus on the weakest areas."""

    def _get_client(self) -> OpenAI:
        """Get OpenAI client with API key from DB or env."""
        api_key = config.get_api_key('openai')
        return OpenAI(api_key=api_key)

    def _log_usage(self, usage) -> None:
        """Log token usage for budget tracking."""
        try:
            prompt_tokens = usage.prompt_tokens
            completion_tokens = usage.completion_tokens
            total_tokens = usage.total_tokens
            estimated_cost = (
                (prompt_tokens / 1000) * config.COST_PER_1K_INPUT_TOKENS +
                (completion_tokens / 1000) * config.COST_PER_1K_OUTPUT_TOKENS
            )

            conn = sqlite3.connect(str(self.db_path))
            conn.execute("""
                INSERT INTO token_usage
                (timestamp, model, prompt_tokens, completion_tokens,
                 total_tokens, estimated_cost_usd, context)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                datetime.now(timezone.utc).isoformat(),
                config.OPENAI_MODEL,
                prompt_tokens, completion_tokens, total_tokens,
                estimated_cost, "content_optimization",
            ))
            conn.commit()
            conn.close()

            logger.info(
                f"Optimization: {total_tokens} tokens (${estimated_cost:.4f})"
            )
        except Exception as e:
            logger.warning(f"Failed to log optimization usage: {e}")
