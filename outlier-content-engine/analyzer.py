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

    def __init__(self, profile: BrandProfile, db_path=None,
                 voice_data=None, own_top_captions=None,
                 audio_insights=None, series_data=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH
        self.client = None  # lazy init — only create when needed
        self.voice_data = voice_data
        self.own_top_captions = own_top_captions or []
        self.audio_insights = audio_insights
        self.series_data = series_data

    def _get_client(self) -> OpenAI:
        """Lazy-initialize the OpenAI client."""
        if self.client is None:
            # Try database first, then environment variable
            api_key = config.get_api_key('openai') or config.OPENAI_API_KEY
            if not api_key:
                raise ValueError(
                    "OPENAI_API_KEY is not set. Add it to your .env file or database."
                )
            self.client = OpenAI(api_key=api_key)
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

        # Build learned voice section
        learned_voice_section = ""
        if self.voice_data:
            vd = self.voice_data
            sp = vd.get("sentence_patterns", {})
            vocab = vd.get("vocabulary", {})
            learned_voice_section = f"""

LEARNED VOICE PROFILE (extracted from {brand}'s own top-performing posts):
Voice summary: {vd.get('voice_summary', 'N/A')}
Sentence style: {sp.get('structure', 'N/A')}, {sp.get('avg_length', 'N/A')} sentences
Vocabulary: {vocab.get('formality', 'N/A')} formality
Distinctive phrases: {', '.join(vocab.get('distinctive_phrases', []))}
Opening patterns: {', '.join(vd.get('opening_patterns', []))}
Closing patterns: {', '.join(vd.get('closing_patterns', []))}
Emoji usage: {vd.get('emoji_usage', 'N/A')}
Tone markers: {', '.join(vd.get('tone_markers', []))}
Signature moves: {', '.join(vd.get('signature_moves', []))}
Caption length preference: {vd.get('caption_length', 'N/A')}
Punctuation: {vd.get('punctuation_habits', 'N/A')}

IMPORTANT: When rewriting content, match these real voice patterns precisely.
The output should be indistinguishable from the brand's own writing."""

        # Build real caption examples section
        real_examples_section = ""
        if self.own_top_captions:
            captions_list = "\n".join(
                f'  - "{cap[:300]}"' for cap in self.own_top_captions[:8]
            )
            real_examples_section = f"""

REAL TOP-PERFORMING CAPTIONS from {brand}'s own Instagram (use these as
primary style reference — these outperformed {brand}'s average):
{captions_list}"""

        # Build audio context section
        audio_section = ""
        if self.audio_insights and self.audio_insights.get("trending_audio"):
            trending = self.audio_insights["trending_audio"][:5]
            audio_list = "\n".join(
                f"  - {a.get('audio_name', 'Unknown')} "
                f"(used in {a.get('outlier_count', 0)} outliers)"
                for a in trending
            )
            audio_section = f"""

TRENDING AUDIO across competitor outliers:
{audio_list}
Consider suggesting trending audio in your content recommendations."""

        # Build series context section
        series_section = ""
        if self.series_data:
            series_list = "\n".join(
                f"  - {s.get('series_name', 'Unknown')}: "
                f"{s.get('post_count', 0)} posts, "
                f"avg engagement {s.get('avg_engagement', 0):,.0f} "
                f"({s.get('competitor', 'unknown')})"
                for s in self.series_data[:5]
            )
            series_section = f"""

DETECTED CONTENT SERIES (recurring formats that consistently perform):
{series_list}
Consider suggesting similar recurring format ideas for {brand}."""

        # Scale-aware section
        scale_section = ""
        if self.profile.follower_count:
            fc = self.profile.follower_count
            if fc < 10000:
                scale_note = "This is a growing account. Focus on community-building, engagement-driving content. Suggest content that encourages saves and shares."
            elif fc < 100000:
                scale_note = "This is a mid-size account. Balance reach content with community engagement. Suggest a mix of viral formats and brand-building."
            else:
                scale_note = "This is a large account. Focus on brand authority and cultural relevance. Suggest premium formats."
            scale_section = f"""

SCALE CONTEXT: {brand} has ~{fc:,} followers. {scale_note}"""

        return f"""You are a {vertical} content strategist and brand voice specialist for {brand}.

{voice_prompt}
{learned_voice_section}
{real_examples_section}
{audio_section}
{series_section}
{scale_section}

---

TASK: Analyze competitor outlier posts and provide deep, actionable insights.

PART 1 — DEEP OUTLIER ANALYSIS
For each outlier post, provide a thorough breakdown:
1. **Hook analysis**: What was the opening hook? (question, curiosity gap, shock, educational, story)
   - Why did this specific hook stop the scroll?
2. **Visual strategy**: What made the visual/video format work?
   - For video: What likely happened in the first 3 seconds?
   - For images: What visual techniques are used? (composition, text overlay, lifestyle vs product)
3. **Messaging breakdown**: What is the caption doing?
   - Tone, length, CTA usage, storytelling technique
4. **Emotional trigger**: What emotion does this content activate? (aspiration, FOMO, belonging, humor, curiosity)
5. **Engagement driver**: Why did the PRIMARY metric spike? (saves = valuable, shares = relatable, comments = opinion-provoking)
6. **Content pattern/framework**: Name the repeatable framework (e.g., "Before/After", "Hot Take", "Educational Carousel")
7. **Replicability for {brand}**: Score 1-10, with specific notes on what {brand} should adapt

PART 2 — {brand.upper()} CONTENT ADAPTATION
Take the top {n_rewrite} outlier concepts and create ready-to-execute content briefs:
- Rewrite the caption in {brand}'s authentic voice (match the learned voice patterns exactly)
- Visual direction: Describe exactly what the image/video should look like
- Format: Reel, carousel, static, story?
- Hook suggestion: Write the specific opening line or first-frame concept
- CTA: What action should the audience take?
- What to keep from the original vs what to change for {brand}
- Brand fit score (1-10) with reasoning
- Best posting time and day

ALWAYS respond with valid JSON matching this exact schema:
{{
  "outlier_analysis": [
    {{
      "post_id": "...",
      "competitor": "...",
      "hook_type": "question|curiosity_gap|shock|educational|story|statement",
      "hook_breakdown": "Why this hook works and how it stops the scroll",
      "visual_strategy": "Specific visual techniques that make this work",
      "messaging_breakdown": "Caption analysis: tone, structure, CTA, storytelling",
      "emotional_trigger": "The core emotion this activates",
      "why_it_worked": "Comprehensive explanation of why this outperformed",
      "content_pattern": "Named framework (e.g. 'Educational Carousel', 'Hot Take')",
      "primary_driver_explanation": "Why the top engagement metric spiked",
      "replicable_for_brand": true,
      "replicability_score": 8,
      "replicability_notes": "What {brand} should adapt and what to avoid"
    }}
  ],
  "brand_adaptations": [
    {{
      "original_post_id": "...",
      "original_competitor": "...",
      "adapted_caption": "...",
      "hook_suggestion": "Specific opening line or first-frame concept",
      "visual_direction": "Detailed description of what the visual should look like",
      "format_suggestion": "reel|carousel|static|story",
      "cta": "Specific call-to-action for the audience",
      "what_to_keep": "...",
      "what_to_change": "...",
      "brand_fit_score": 8,
      "brand_fit_reasoning": "Why this score",
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
      "hook": "Opening line or visual hook",
      "caption_draft": "...",
      "visual_direction": "What the post should look like",
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
