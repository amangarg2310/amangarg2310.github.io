"""
Series Detector — identifies recurring content formats that consistently perform.

Clusters posts by competitor, media type, and caption similarity to find
content "franchises" — recurring formats a competitor uses repeatedly.
Sends clusters to GPT-4o-mini to name them and assess replicability.
"""

import json
import logging
import re
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from typing import List, Dict, Optional, Set

from openai import OpenAI

import config
from profile_loader import BrandProfile

logger = logging.getLogger(__name__)

# Common stop words to exclude from similarity computation
STOP_WORDS = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "and", "but", "or", "nor", "if", "it", "its", "this", "that", "these",
    "those", "i", "me", "my", "we", "our", "you", "your", "he", "him",
    "his", "she", "her", "they", "them", "their", "what", "which", "who",
}


class SeriesDetector:
    """Detects recurring content series/franchises from competitor posts."""

    def __init__(self, profile: BrandProfile, db_path=None):
        self.profile = profile
        self.db_path = db_path or config.DB_PATH
        self.client = None

    def _get_client(self) -> OpenAI:
        if self.client is None:
            self.client = OpenAI(api_key=config.get_api_key('openai'))
        return self.client

    def detect_series(self) -> List[Dict]:
        """
        Detect content series across all competitors.

        Returns list of series dicts with name, format, post count, etc.
        """
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row

        # Get last 90 days of posts per competitor
        rows = conn.execute("""
            SELECT post_id, competitor_handle, competitor_name,
                   media_type, caption, posted_at,
                   (COALESCE(likes,0) + COALESCE(comments,0) +
                    COALESCE(saves,0) + COALESCE(shares,0)) as engagement
            FROM competitor_posts
            WHERE brand_profile = ?
              AND is_own_channel = 0
              AND caption IS NOT NULL AND caption != ''
              AND posted_at >= date('now', '-90 days')
            ORDER BY competitor_handle, posted_at
        """, (self.profile.profile_name,)).fetchall()

        conn.close()

        if len(rows) < 5:
            logger.info("Not enough posts for series detection.")
            return []

        # Group by (competitor_handle, media_type)
        groups = defaultdict(list)
        for row in rows:
            key = (row["competitor_handle"], row["media_type"] or "post")
            groups[key].append(dict(row))

        # Find clusters within each group
        all_series = []
        for (handle, media_type), posts in groups.items():
            if len(posts) < 3:
                continue
            clusters = self._cluster_posts(posts)
            for cluster in clusters:
                if len(cluster) >= 3:
                    avg_eng = sum(
                        p["engagement"] for p in cluster
                    ) / len(cluster)
                    all_series.append({
                        "competitor_handle": handle,
                        "competitor_name": cluster[0]["competitor_name"],
                        "media_type": media_type,
                        "post_count": len(cluster),
                        "avg_engagement": round(avg_eng),
                        "post_ids": [p["post_id"] for p in cluster],
                        "sample_captions": [
                            (p["caption"] or "")[:200]
                            for p in cluster[:3]
                        ],
                    })

        if not all_series:
            logger.info("No content series patterns detected.")
            return []

        # Use LLM to name and assess the top series
        named_series = self._name_series(all_series[:8])

        # Store in DB
        self._store_series(named_series)

        return named_series

    def get_active_series(self) -> List[Dict]:
        """Get previously detected active series from DB."""
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        rows = conn.execute("""
            SELECT * FROM content_series
            WHERE brand_profile = ? AND is_active = 1
            ORDER BY avg_engagement DESC
        """, (self.profile.profile_name,)).fetchall()
        conn.close()
        return [dict(row) for row in rows]

    def _cluster_posts(self, posts: List[Dict]) -> List[List[Dict]]:
        """
        Greedy clustering by caption keyword similarity.

        A cluster = posts with >40% word overlap after stop word removal.
        """
        clusters = []
        used = set()

        for i, post_a in enumerate(posts):
            if i in used:
                continue

            cluster = [post_a]
            used.add(i)
            words_a = self._extract_keywords(post_a["caption"])

            if not words_a:
                continue

            for j, post_b in enumerate(posts):
                if j in used:
                    continue
                words_b = self._extract_keywords(post_b["caption"])
                if not words_b:
                    continue
                sim = self._jaccard_similarity(words_a, words_b)
                if sim >= 0.4:
                    cluster.append(post_b)
                    used.add(j)

            clusters.append(cluster)

        return clusters

    def _extract_keywords(self, caption: str) -> Set[str]:
        """Extract meaningful keywords from a caption."""
        if not caption:
            return set()
        words = re.findall(r'[a-z]+', caption.lower())
        return {w for w in words if w not in STOP_WORDS and len(w) > 2}

    def _jaccard_similarity(self, set_a: Set[str], set_b: Set[str]) -> float:
        """Jaccard similarity between two word sets."""
        if not set_a or not set_b:
            return 0.0
        intersection = len(set_a & set_b)
        union = len(set_a | set_b)
        return intersection / union if union > 0 else 0.0

    def _name_series(self, series_list: List[Dict]) -> List[Dict]:
        """Use LLM to name detected series and assess replicability."""
        if not series_list:
            return []

        series_descriptions = []
        for i, s in enumerate(series_list, 1):
            captions = "\n    ".join(
                f'"{cap}"' for cap in s["sample_captions"]
            )
            series_descriptions.append(
                f"Series #{i}: @{s['competitor_handle']} | "
                f"{s['media_type']} | {s['post_count']} posts | "
                f"avg engagement {s['avg_engagement']:,}\n"
                f"  Sample captions:\n    {captions}"
            )

        prompt = "\n\n".join(series_descriptions)

        try:
            client = self._get_client()
            response = client.chat.completions.create(
                model=config.OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": SERIES_NAMING_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                max_tokens=1500,
                response_format={"type": "json_object"},
            )

            # Log usage
            usage = response.usage
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
                usage.prompt_tokens, usage.completion_tokens,
                usage.total_tokens, estimated_cost, "series_detection",
            ))
            conn.commit()
            conn.close()

            result = json.loads(response.choices[0].message.content)
            named = result.get("series", [])

            # Merge LLM naming back into our series data
            for i, s in enumerate(series_list):
                if i < len(named):
                    s["series_name"] = named[i].get("name", f"Series {i+1}")
                    s["description"] = named[i].get("description", "")
                    s["replicability_score"] = named[i].get(
                        "replicability_score", 5
                    )
                    s["why_it_works"] = named[i].get("why_it_works", "")
                else:
                    s["series_name"] = f"Series {i+1}"
                    s["description"] = ""
                    s["replicability_score"] = 5
                    s["why_it_works"] = ""

            return series_list

        except Exception as e:
            logger.error(f"Series naming failed: {e}")
            # Return series with generic names
            for i, s in enumerate(series_list):
                s["series_name"] = f"Series {i+1}"
                s["description"] = ""
                s["replicability_score"] = 5
                s["why_it_works"] = ""
            return series_list

    def _store_series(self, series_list: List[Dict]) -> None:
        """Store detected series in the database."""
        conn = sqlite3.connect(str(self.db_path))

        # Deactivate old series for this profile
        conn.execute("""
            UPDATE content_series SET is_active = 0
            WHERE brand_profile = ?
        """, (self.profile.profile_name,))

        for s in series_list:
            conn.execute("""
                INSERT INTO content_series
                (brand_profile, competitor_handle, series_name, format_pattern,
                 post_count, avg_engagement, first_seen, last_seen,
                 is_active, description, post_ids)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """, (
                self.profile.profile_name,
                s["competitor_handle"],
                s["series_name"],
                s["media_type"],
                s["post_count"],
                s["avg_engagement"],
                datetime.now(timezone.utc).isoformat(),
                datetime.now(timezone.utc).isoformat(),
                s.get("description", ""),
                json.dumps(s.get("post_ids", [])),
            ))

        conn.commit()
        conn.close()


SERIES_NAMING_PROMPT = """You are a social media content analyst. You are given clusters of posts from the same competitor that appear to be part of a recurring content series or franchise.

For each series, provide:
1. A catchy, descriptive name for the series
2. A brief description of the format/pattern
3. A replicability score (1-10) for how easily another brand could create their own version
4. Why the series works (what makes it engaging)

Respond with valid JSON:
{
  "series": [
    {
      "name": "Series Name",
      "description": "Brief description of the recurring format",
      "replicability_score": 8,
      "why_it_works": "Explanation of engagement drivers"
    }
  ]
}"""
