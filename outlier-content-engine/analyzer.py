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
from typing import List, Dict, Optional, Tuple

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

        # ── OPTIMIZATION: Skip Re-analysis ──
        # Separate outliers into: (1) need analysis, (2) already analyzed
        posts_needing_analysis, cached_analyses = self._partition_by_existing_analysis(top_outliers)

        if not posts_needing_analysis:
            logger.info(f"All {len(top_outliers)} outliers already analyzed - using cached AI analysis")
            # Return cached results with empty weekly patterns and calendar
            return self._build_cached_response(cached_analyses)

        logger.info(
            f"Analyzing {len(posts_needing_analysis)}/{len(top_outliers)} outliers with {config.OPENAI_MODEL} "
            f"({len(cached_analyses)} cached)..."
        )

        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(posts_needing_analysis, baselines)

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

            # Merge cached analyses with new analyses
            new_analyses = result.get("outlier_analysis", [])
            combined_analyses = cached_analyses + new_analyses
            result["outlier_analysis"] = combined_analyses

            logger.info(f"LLM analysis complete ({len(new_analyses)} new, {len(cached_analyses)} cached).")
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
        vertical = getattr(self.profile, 'vertical', 'content')

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

CRITICAL: When writing brand_creative_brief captions, match these patterns exactly.
The output must be indistinguishable from the brand's own writing."""

        # Build real caption examples section
        real_examples_section = ""
        if self.own_top_captions:
            captions_list = "\n".join(
                f'  - "{cap[:300]}"' for cap in self.own_top_captions[:8]
            )
            real_examples_section = f"""

REAL TOP-PERFORMING CAPTIONS from {brand}'s own Instagram (primary style reference):
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
{audio_list}"""

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
{series_list}"""

        # Scale-aware section
        scale_section = ""
        if self.profile.follower_count:
            fc = self.profile.follower_count
            if fc < 10000:
                scale_note = "Growing account. Prioritize saves/shares content, community-building, and engagement bait."
            elif fc < 100000:
                scale_note = "Mid-size account. Mix viral formats with brand-building. Carousel education + Reel trends."
            else:
                scale_note = "Large account. Focus on brand authority, cultural moments, premium formats."
            scale_section = f"""

SCALE CONTEXT: {brand} has ~{fc:,} followers. {scale_note}"""

        return f"""You are an elite social media content strategist specializing in {vertical}.
You analyze competitor outlier posts with forensic precision and create actionable content briefs.

{voice_prompt}
{learned_voice_section}
{real_examples_section}
{audio_section}
{series_section}
{scale_section}

---

YOUR JOB: For each outlier post, produce TWO things:
(A) A deep, ultra-specific analysis of WHY it outperformed — no generic filler.
(B) A brand creative brief that tells {brand}'s content team exactly what to post.

ANALYSIS RULES — be ruthlessly specific:
- Reference the ACTUAL caption text, numbers, and metrics. Don't say "the caption was engaging" — say what made it engaging and quote the specific line.
- Name the exact psychological trigger: loss aversion, social proof, identity signaling, aspiration gap, controversy, nostalgia, etc.
- For the engagement driver: explain the specific mechanic. If comments spiked, what question or opinion prompt drove them? If saves spiked, what was worth bookmarking?
- The "content_pattern" must be a named, repeatable framework someone could use (e.g. "Myth-Bust Carousel", "POV Reel", "Drop Countdown", "Hot Take Thread").
- Avoid these filler phrases: "resonates with the audience", "drives engagement", "creates connection". Be concrete.

CREATIVE BRIEF RULES:
- The suggested_caption MUST be written in {brand}'s voice (use the learned voice profile above).
- visual_concept: Describe the exact shot list, color palette, text overlay, and composition. A designer should be able to create from this alone.
- hook_line: The exact first line of the caption or the text on the first frame of the video/carousel.
- why_this_works_for_us: Explain the strategic fit — why {brand} should post this specific concept and not something else.
- what_to_replicate: The transferable principle (not "copy this post" but the underlying mechanic).
- what_to_avoid: What from the original does NOT fit {brand} and should be dropped or changed.

CONTENT TAGS (consolidated — replaces separate tagging step):
For each post, assign 3-6 structured tags from these categories:
- format: video, carousel, image, reel, story
- hook: question, stat, tutorial, before-after, behind-scenes, testimonial, announcement, challenge, hot-take, pov, listicle
- theme: product-launch, collaboration, lifestyle, community, seasonal, education, entertainment, culture, nostalgia, controversy
- caption: short, medium, long, storytelling, call-to-action, minimal
- visual: minimal, vibrant, dark, professional, candid, aesthetic, ugc-style

ALWAYS respond with valid JSON matching this exact schema:
{{
  "outlier_analysis": [
    {{
      "post_id": "...",
      "competitor": "...",
      "content_tags": ["format:reel", "hook:hot-take", "theme:culture", "caption:short", "visual:candid"],
      "one_line_summary": "A single punchy sentence describing what this post IS and why it worked.",
      "hook_type": "question|curiosity_gap|shock|educational|story|statement|hot_take|pov",
      "hook_breakdown": "Exact analysis of the hook: quote the specific text or describe the first 3 seconds. Explain the psychology.",
      "visual_strategy": "Shot-by-shot or frame-by-frame: what the viewer sees and why it works. Reference composition, pacing, text overlays, colors.",
      "messaging_breakdown": "Line-by-line caption analysis: what each part does, tone shifts, CTA placement, storytelling arc.",
      "emotional_trigger": "The specific psychological mechanism (e.g. 'identity signaling — viewers share to show they are in-the-know')",
      "why_it_worked": "The REAL reason this outperformed, connecting metrics to content choices. Reference actual numbers.",
      "content_pattern": "Named repeatable framework (e.g. 'Myth-Bust Carousel', 'Hot Take Thread')",
      "primary_driver_explanation": "Why THIS specific metric (saves/shares/comments/likes) spiked. What content mechanic drove it.",
      "replicability_score": 8,
      "replicability_notes": "What transfers to {brand} and what doesn't. Be specific.",
      "brand_creative_brief": {{
        "one_line_summary": "What {brand} should post, in one sentence.",
        "suggested_caption": "Full caption written in {brand}'s voice. Match the learned voice patterns exactly.",
        "visual_concept": "Detailed visual direction: shot list, color palette, text overlays, composition. A designer can execute from this.",
        "format": "reel|carousel|static|story",
        "hook_line": "The exact opening line or first-frame text.",
        "cta": "Specific call-to-action.",
        "why_this_works_for_us": "Strategic reasoning for why {brand} should post this.",
        "what_to_replicate": "The transferable principle from the original.",
        "what_to_avoid": "What to drop or change from the original for {brand}.",
        "brand_fit_score": 8,
        "suggested_audio": "Audio suggestion if applicable, or null"
      }}
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
      "content_type": "reel|carousel|static|story",
      "concept": "One-sentence concept",
      "hook": "Opening line or visual hook",
      "caption_draft": "Full draft caption in {brand}'s voice",
      "visual_direction": "What the post should look like",
      "reference_outlier": "post_id this is inspired by"
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

    def _partition_by_existing_analysis(self, outliers: List[OutlierPost]) -> Tuple[List[OutlierPost], List[Dict]]:
        """
        Separate outliers into posts needing analysis vs already analyzed.

        Returns:
            Tuple of (posts_needing_analysis, cached_analyses)
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        posts_needing_analysis = []
        cached_analyses = []

        for outlier in outliers:
            row = conn.execute("""
                SELECT ai_analysis
                FROM competitor_posts
                WHERE post_id = ? AND brand_profile = ?
            """, (outlier.post_id, self.profile.profile_name)).fetchone()

            if row and row["ai_analysis"]:
                # Post already has analysis - use cached version
                try:
                    cached_analysis = json.loads(row["ai_analysis"])
                    cached_analyses.append(cached_analysis)
                except (json.JSONDecodeError, TypeError):
                    # Malformed cache - re-analyze
                    posts_needing_analysis.append(outlier)
            else:
                # No analysis yet - needs GPT-4 call
                posts_needing_analysis.append(outlier)

        conn.close()
        return posts_needing_analysis, cached_analyses

    def _build_cached_response(self, cached_analyses: List[Dict]) -> Dict:
        """Build response using only cached analyses (no new GPT-4 call)."""
        return {
            "outlier_analysis": cached_analyses,
            "brand_adaptations": [],  # Could extract from cached analyses if needed
            "weekly_patterns": {
                "best_content_types": [],
                "best_posting_days": [],
                "trending_themes": [],
                "avoid": [],
            },
            "content_calendar_suggestions": [],
        }

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
