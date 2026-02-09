"""
Voice Analyzer — extracts writing style from own-channel top posts.

Sends the brand's own best-performing captions to GPT-4o-mini
and extracts structured voice patterns: sentence structure, vocabulary,
tone markers, opening/closing patterns, etc.

The extracted voice profile is then injected into the rewrite prompts
so adapted content reads like the brand actually wrote it.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Optional

from openai import OpenAI

import config
from profile_loader import BrandProfile

logger = logging.getLogger(__name__)


class VoiceAnalyzer:
    """Extracts and stores writing voice patterns from own-channel posts."""

    def __init__(self, profile: BrandProfile, db_path=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH
        self.client = None

    def _get_client(self) -> OpenAI:
        if self.client is None:
            self.client = OpenAI(api_key=config.OPENAI_API_KEY)
        return self.client

    def get_top_own_posts(self, limit: int = 12) -> List[Dict]:
        """Fetch own-channel posts sorted by engagement, descending."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT post_id, caption, likes, comments, saves, shares, views,
                   media_type, media_url, posted_at,
                   (COALESCE(likes,0) + COALESCE(comments,0) +
                    COALESCE(saves,0) + COALESCE(shares,0)) as total_engagement
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_own_channel = 1
              AND caption IS NOT NULL
              AND caption != ''
            ORDER BY total_engagement DESC
            LIMIT ?
        """, (self.profile.profile_name, limit)).fetchall()
        conn.close()

        return [dict(row) for row in rows]

    def analyze_voice(self) -> Optional[Dict]:
        """
        Run voice analysis on own top-performing posts.

        Returns the voice_data dict, or None if insufficient data.
        """
        top_posts = self.get_top_own_posts(limit=12)

        if len(top_posts) < 3:
            logger.warning(
                f"Need at least 3 own-channel posts for voice analysis, "
                f"found {len(top_posts)}. Skipping."
            )
            return None

        logger.info(
            f"Analyzing voice from {len(top_posts)} top own-channel posts..."
        )

        captions_block = self._format_captions(top_posts)
        system_prompt = self._build_extraction_prompt()
        own_handle = self.profile.get_own_handle() or self.profile.name
        user_prompt = (
            f"Analyze the writing voice in these top-performing captions "
            f"from @{own_handle}:\n\n{captions_block}"
        )

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )

            self._log_usage(response.usage)

            voice_data = json.loads(response.choices[0].message.content)
            self._store_voice_analysis(voice_data, top_posts)

            logger.info("Voice analysis complete and stored.")
            return voice_data

        except Exception as e:
            logger.error(f"Voice analysis failed: {e}")
            return None

    def load_voice_analysis(self) -> Optional[Dict]:
        """Load the most recent voice analysis from DB."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        row = conn.execute("""
            SELECT voice_data, analyzed_at, source_post_count
            FROM voice_analysis
            WHERE brand_profile = ?
            ORDER BY analyzed_at DESC
            LIMIT 1
        """, (self.profile.profile_name,)).fetchone()
        conn.close()

        if row:
            return {
                "voice_data": json.loads(row["voice_data"]),
                "analyzed_at": row["analyzed_at"],
                "source_post_count": row["source_post_count"],
            }
        return None

    def _format_captions(self, posts: List[Dict]) -> str:
        """Format post captions for the LLM prompt."""
        lines = []
        for i, post in enumerate(posts, 1):
            engagement = post["total_engagement"]
            caption = post["caption"][:600]
            lines.append(
                f"POST #{i} (engagement: {engagement:,}, "
                f"type: {post['media_type'] or 'post'}):\n"
                f'"{caption}"'
            )
        return "\n\n".join(lines)

    def _build_extraction_prompt(self) -> str:
        """System prompt for voice extraction."""
        return """You are an expert social media linguist and voice analyst.

Your task: analyze the provided Instagram captions and extract the
author's distinctive writing voice and style patterns.

Focus on PATTERNS you observe across multiple captions, not one-off
observations. Look for what makes this voice unique and recognizable.

Respond with valid JSON matching this exact schema:
{
  "voice_summary": "2-3 sentence description of overall writing style",
  "sentence_patterns": {
    "avg_length": "short / medium / long",
    "structure": "fragments / declarative / mixed / interrogative",
    "uses_fragments": true,
    "paragraph_style": "single-line / short-paragraphs / long-form"
  },
  "vocabulary": {
    "formality": "casual / balanced / elevated / formal",
    "distinctive_phrases": ["phrase1", "phrase2"],
    "power_words": ["word1", "word2"],
    "never_uses": ["word1", "word2"]
  },
  "opening_patterns": ["pattern1", "pattern2"],
  "closing_patterns": ["pattern1", "pattern2"],
  "emoji_usage": "none / minimal / moderate / heavy",
  "hashtag_style": "none / few-branded / many-discovery / mixed",
  "tone_markers": ["marker1", "marker2"],
  "caption_length": "micro (under 20 words) / short / medium / long",
  "punctuation_habits": "periods-for-rhythm / ellipsis-heavy / minimal / standard",
  "signature_moves": ["move1", "move2"]
}"""

    def _store_voice_analysis(self, voice_data: Dict,
                              posts: List[Dict]) -> None:
        """Store voice analysis results in the database."""
        post_ids = [p["post_id"] for p in posts]
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("""
            INSERT OR REPLACE INTO voice_analysis
            (brand_profile, analyzed_at, source_post_count, voice_data, top_post_ids)
            VALUES (?, ?, ?, ?, ?)
        """, (
            self.profile.profile_name,
            datetime.now(timezone.utc).isoformat(),
            len(posts),
            json.dumps(voice_data),
            json.dumps(post_ids),
        ))
        conn.commit()
        conn.close()

    def _log_usage(self, usage) -> None:
        """Record token usage for voice analysis."""
        estimated_cost = (
            (usage.prompt_tokens / 1000) * config.COST_PER_1K_INPUT_TOKENS +
            (usage.completion_tokens / 1000) * config.COST_PER_1K_OUTPUT_TOKENS
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
            usage.prompt_tokens,
            usage.completion_tokens,
            usage.total_tokens,
            estimated_cost,
            "voice_analysis",
        ))
        conn.commit()
        conn.close()
        logger.info(
            f"  Voice analysis tokens: {usage.total_tokens} "
            f"(${estimated_cost:.4f})"
        )
