"""
Analyzer — LLM-powered outlier analysis and brand voice rewriter.

Dynamically constructs prompts from the active brand profile.
No hardcoded brand references in this file — everything comes
from the YAML profile via profile_loader.

Uses GPT-4o-mini with JSON mode for structured responses.
Tracks token usage and enforces a monthly cost ceiling.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Optional

from openai import OpenAI

import config
from profile_loader import BrandProfile
from outlier_detector import OutlierPost, CompetitorBaseline

logger = logging.getLogger(__name__)


class ContentAnalyzer:
    """
    Analyzes outlier posts and rewrites top concepts in the brand's voice.

    All brand-specific prompt content is loaded from the active profile.
    """

    def __init__(self, profile: BrandProfile, db_path=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH
        self.client = None  # lazy init — only create when needed

    def _get_client(self) -> OpenAI:
        """Lazy-initialize the OpenAI client."""
        if self.client is None:
            if not config.OPENAI_API_KEY:
                raise ValueError(
                    "OPENAI_API_KEY is not set. Add it to your .env file."
                )
            self.client = OpenAI(api_key=config.OPENAI_API_KEY)
        return self.client

    def analyze(self, outliers: List[OutlierPost],
                baselines: Dict[str, CompetitorBaseline]) -> Dict:
        """
        Send top outlier posts to GPT-4o-mini for analysis and brand adaptation.

        Args:
            outliers: Outlier posts sorted by score (highest first).
            baselines: Per-competitor baseline stats.

        Returns:
            Structured dict with outlier_analysis, brand_adaptations,
            weekly_patterns, and content_calendar_suggestions.
        """
        if not outliers:
            logger.info("No outliers to analyze.")
            return self._empty_response()

        # Check budget before making API call
        if not self._check_budget():
            logger.warning(
                "Monthly LLM budget exceeded. Returning raw data only."
            )
            return self._budget_exceeded_response(outliers)

        settings = self.profile.outlier_settings
        top_outliers = outliers[:settings.top_outliers_to_analyze]

        logger.info(
            f"Analyzing {len(top_outliers)} outliers with {config.OPENAI_MODEL}..."
        )

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(top_outliers, baselines)

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=config.OPENAI_TEMPERATURE,
                max_tokens=config.OPENAI_MAX_TOKENS,
                response_format={"type": "json_object"},
            )

            # Log token usage
            self._log_usage(response.usage, context="outlier_analysis")

            result = json.loads(response.choices[0].message.content)
            logger.info("LLM analysis complete.")
            return result

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            return self._empty_response()
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return self._empty_response()

    def _build_system_prompt(self) -> str:
        """Build the system prompt dynamically from the brand profile."""
        voice_prompt = self.profile.get_voice_prompt()
        brand = self.profile.name
        vertical = self.profile.vertical
        n_rewrite = self.profile.outlier_settings.top_outliers_to_rewrite

        return f"""You are a {vertical} content strategist and brand voice specialist for {brand}.

{voice_prompt}

---

TASK: Analyze competitor outlier posts and do two things.

PART 1 — OUTLIER ANALYSIS
For each outlier post, explain:
1. Why it likely outperformed (format, hook, timing, emotional trigger)
2. The underlying content pattern/framework that made it work
3. Whether this pattern is replicable for {brand}

PART 2 — {brand.upper()} CONTENT ADAPTATION
Take the top {n_rewrite} outlier concepts and rewrite them as {brand} content:
- Rewrite the caption in {brand}'s authentic voice
- Suggest the visual/format approach {brand} should use
- Explain what to keep vs what to change from the original
- Rate the fit for {brand}'s brand (1-10)

ALWAYS respond with valid JSON matching this exact schema:
{{
  "outlier_analysis": [
    {{
      "post_id": "...",
      "competitor": "...",
      "why_it_worked": "...",
      "content_pattern": "...",
      "replicable_for_brand": true,
      "replicability_notes": "..."
    }}
  ],
  "brand_adaptations": [
    {{
      "original_post_id": "...",
      "original_competitor": "...",
      "adapted_caption": "...",
      "visual_direction": "...",
      "format_suggestion": "...",
      "what_to_keep": "...",
      "what_to_change": "...",
      "brand_fit_score": 8,
      "best_posting_time": "..."
    }}
  ],
  "weekly_patterns": {{
    "best_content_types": ["..."],
    "best_posting_days": ["..."],
    "trending_themes": ["..."],
    "avoid": ["..."]
  }},
  "content_calendar_suggestions": [
    {{
      "day": "Monday",
      "content_type": "...",
      "concept": "...",
      "caption_draft": "...",
      "reference_outlier": "..."
    }}
  ]
}}"""

    def _build_user_prompt(self, outliers: List[OutlierPost],
                           baselines: Dict[str, CompetitorBaseline]) -> str:
        """Build the user prompt with outlier data and baselines."""
        # Format outlier posts
        posts_data = []
        for outlier in outliers:
            posts_data.append({
                "post_id": outlier.post_id,
                "competitor": outlier.competitor_name,
                "handle": f"@{outlier.competitor_handle}",
                "post_url": outlier.post_url,
                "media_type": outlier.media_type,
                "caption": (outlier.caption or "")[:500],  # truncate to save tokens
                "likes": outlier.likes,
                "comments": outlier.comments,
                "saves": outlier.saves,
                "shares": outlier.shares,
                "views": outlier.views,
                "engagement_multiplier": f"{outlier.engagement_multiplier}x",
                "std_devs_above_mean": outlier.std_devs_above,
                "outlier_score": outlier.outlier_score,
                "content_tags": outlier.content_tags,
            })

        # Format baseline averages
        baseline_data = {}
        for handle, bl in baselines.items():
            baseline_data[f"@{handle}"] = {
                "posts_analyzed": bl.post_count,
                "mean_likes": round(bl.mean_likes),
                "mean_comments": round(bl.mean_comments),
                "mean_total_engagement": round(bl.mean_engagement),
                "median_engagement": round(bl.median_engagement),
            }

        return (
            f"Analyze these top-performing competitor posts:\n\n"
            f"OUTLIER POSTS:\n{json.dumps(posts_data, indent=2)}\n\n"
            f"COMPETITOR BASELINES:\n{json.dumps(baseline_data, indent=2)}"
        )

    def _check_budget(self) -> bool:
        """Check if monthly LLM spend is under the configured limit."""
        conn = sqlite3.connect(str(self.db_path))
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()

        row = conn.execute("""
            SELECT COALESCE(SUM(estimated_cost_usd), 0) as total
            FROM token_usage
            WHERE timestamp >= ?
        """, (month_start,)).fetchone()

        conn.close()
        monthly_cost = row[0] if row else 0

        remaining = config.MONTHLY_COST_LIMIT_USD - monthly_cost
        logger.info(
            f"Monthly LLM spend: ${monthly_cost:.4f} / "
            f"${config.MONTHLY_COST_LIMIT_USD:.2f} "
            f"(${remaining:.4f} remaining)"
        )
        return monthly_cost < config.MONTHLY_COST_LIMIT_USD

    def _log_usage(self, usage, context: str = "analysis") -> None:
        """Record token usage and estimated cost in SQLite."""
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
            prompt_tokens,
            completion_tokens,
            total_tokens,
            estimated_cost,
            context,
        ))
        conn.commit()
        conn.close()

        logger.info(
            f"  Tokens used: {prompt_tokens} input + {completion_tokens} output "
            f"= {total_tokens} total (${estimated_cost:.4f})"
        )

    def _empty_response(self) -> Dict:
        """Return an empty but structurally valid analysis response."""
        return {
            "outlier_analysis": [],
            "brand_adaptations": [],
            "weekly_patterns": {
                "best_content_types": [],
                "best_posting_days": [],
                "trending_themes": [],
                "avoid": [],
            },
            "content_calendar_suggestions": [],
        }

    def _budget_exceeded_response(self, outliers: List[OutlierPost]) -> Dict:
        """Return raw outlier data without LLM analysis."""
        result = self._empty_response()
        result["budget_notice"] = (
            f"Monthly LLM budget (${config.MONTHLY_COST_LIMIT_USD:.2f}) exceeded. "
            f"Raw outlier data included below without AI analysis."
        )
        result["raw_outliers"] = [
            {
                "post_id": o.post_id,
                "competitor": o.competitor_name,
                "engagement_multiplier": o.engagement_multiplier,
                "std_devs_above": o.std_devs_above,
                "caption_preview": (o.caption or "")[:200],
            }
            for o in outliers[:10]
        ]
        return result
