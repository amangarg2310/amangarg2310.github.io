"""
Content Tagger - LLM-powered content classification for all posts.

Generates structured content tags for every post to enable:
- Pattern filtering in dashboard
- Better insights and analysis
- Content type identification

Uses GPT-4o-mini in batch mode for cost-effective tagging.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone
from typing import List, Dict, Optional

from openai import OpenAI

import config

logger = logging.getLogger(__name__)


class ContentTagger:
    """Tags all posts with content patterns using LLM analysis."""

    def __init__(self, db_path=None):
        self.db_path = db_path or config.DB_PATH
        self.client = None

    def _get_client(self) -> OpenAI:
        """Lazy-initialize the OpenAI client."""
        if self.client is None:
            api_key = config.get_api_key('openai')
            if not api_key:
                raise ValueError(
                    "OPENAI_API_KEY is not set. Add it to your .env file or database."
                )
            self.client = OpenAI(api_key=api_key)
        return self.client

    def tag_all_posts(self, batch_size: int = 10) -> Dict:
        """
        Tag all posts that don't have content tags yet.

        Args:
            batch_size: Number of posts to tag in one LLM call (default 10)

        Returns:
            Dict with stats: tagged_count, already_tagged, errors
        """
        conn = sqlite3.connect(str(self.db_path))

        # Get all posts without content tags
        rows = conn.execute("""
            SELECT post_id, platform, media_type, caption, likes, comments,
                   shares, saves, views, competitor_handle
            FROM competitor_posts
            WHERE content_tags IS NULL OR content_tags = ''
            ORDER BY posted_at DESC
        """).fetchall()

        if not rows:
            logger.info("All posts already have content tags")
            conn.close()
            return {"tagged_count": 0, "already_tagged": "all", "errors": []}

        logger.info(f"Tagging {len(rows)} posts without content tags...")

        stats = {"tagged_count": 0, "already_tagged": 0, "errors": []}

        # Process in batches
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            try:
                tags_map = self._tag_batch(batch)

                # Update database
                for post_id, tags in tags_map.items():
                    conn.execute(
                        "UPDATE competitor_posts SET content_tags = ? WHERE post_id = ?",
                        (",".join(tags), post_id)
                    )
                    stats["tagged_count"] += 1

                conn.commit()
                logger.info(f"  Tagged batch {i+1}-{min(i+batch_size, len(rows))} ({len(tags_map)} posts)")

            except Exception as e:
                logger.error(f"Error tagging batch {i//batch_size + 1}: {e}")
                stats["errors"].append(str(e))

        conn.close()

        logger.info(
            f"Content tagging complete: {stats['tagged_count']} posts tagged, "
            f"{len(stats['errors'])} errors"
        )

        return stats

    def _tag_batch(self, posts: List[tuple]) -> Dict[str, List[str]]:
        """
        Tag a batch of posts using LLM.

        Args:
            posts: List of post tuples from database

        Returns:
            Dict mapping post_id to list of content tags
        """
        # Build batch prompt
        posts_data = []
        for row in posts:
            post_id, platform, media_type, caption, likes, comments, shares, saves, views, handle = row
            posts_data.append({
                "post_id": post_id,
                "platform": platform,
                "media_type": media_type or "unknown",
                "caption": (caption or "")[:500],  # Truncate to save tokens
                "likes": likes or 0,
                "comments": comments or 0,
                "shares": shares or 0,
                "saves": saves or 0,
                "views": views or 0,
                "handle": f"@{handle}"
            })

        system_prompt = """You are a content classification expert. Analyze social media posts and assign structured content tags.

For each post, identify:
1. **Format**: video, carousel, image, reel, story
2. **Hook Type**: question, stat, tutorial, before-after, behind-scenes, testimonial, announcement, challenge
3. **Theme**: product-launch, collaboration, lifestyle, sport, community, seasonal, education, entertainment
4. **Caption Style**: short, medium, long, storytelling, call-to-action, minimal
5. **Visual Style**: minimal, vibrant, dark, professional, candid, aesthetic

Return ONLY valid JSON matching this schema:
{
  "posts": [
    {
      "post_id": "...",
      "tags": ["format:video", "hook:tutorial", "theme:education", "caption:short", "visual:professional"]
    }
  ]
}

Keep tags concise. Assign 3-5 tags per post."""

        user_prompt = f"Analyze and tag these {len(posts_data)} posts:\n\n{json.dumps(posts_data, indent=2)}"

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.3,  # Lower temperature for more consistent tagging
                max_tokens=2000,
                response_format={"type": "json_object"},
            )

            # Log token usage
            self._log_usage(response.usage, context="content_tagging")

            result = json.loads(response.choices[0].message.content)

            # Convert to map
            tags_map = {}
            for post in result.get("posts", []):
                post_id = post.get("post_id")
                tags = post.get("tags", [])
                if post_id and tags:
                    tags_map[post_id] = tags

            return tags_map

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            return {}
        except Exception as e:
            logger.error(f"Content tagging failed: {e}")
            return {}

    def _log_usage(self, usage, context: str = "content_tagging") -> None:
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
