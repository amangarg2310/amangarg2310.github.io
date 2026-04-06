"""Supabase pgvector operations for storing and querying insight embeddings."""

import json
import logging
from typing import Optional

from supabase import create_client

from config.settings import SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from storage.embeddings import generate_embedding

logger = logging.getLogger(__name__)


class VectorStore:
    """Interface to Supabase pgvector for insight storage and retrieval."""

    def __init__(self, use_service_role: bool = False):
        key = SUPABASE_SERVICE_ROLE_KEY if use_service_role else SUPABASE_ANON_KEY
        self.client = create_client(SUPABASE_URL, key)

    def insert_insight(self, insight: dict, embedding: list[float]) -> dict:
        """Insert a single insight with its embedding into Supabase."""
        row = {
            "id": insight["id"],
            "source_video_id": insight.get("source_video_id", ""),
            "source_url": insight.get("source_url", ""),
            "source_title": insight.get("source_title", ""),
            "expert_name": insight.get("expert_name", ""),
            "expert_channel": insight.get("expert_channel", ""),
            "timestamp_start": insight.get("timestamp_start"),
            "timestamp_end": insight.get("timestamp_end"),
            "domain": insight.get("domain", ""),
            "sub_domain": insight.get("sub_domain", ""),
            "insight_type": insight.get("insight_type", ""),
            "title": insight.get("title", ""),
            "content": insight.get("content", ""),
            "key_quote": insight.get("key_quote"),
            "actionability": insight.get("actionability", "medium"),
            "confidence": insight.get("confidence", 0.5),
            "related_experts": json.dumps(insight.get("related_experts", [])),
            "tags": json.dumps(insight.get("tags", [])),
            "embedding": embedding,
            "ingested_at": insight.get("ingested_at"),
            "processed_at": insight.get("processed_at"),
        }

        result = self.client.table("insights").insert(row).execute()
        logger.info(f"Inserted insight: {insight['id']}")
        return result.data[0] if result.data else {}

    def insert_insights_batch(self, insights: list[dict], embeddings: list[list[float]]) -> int:
        """Insert multiple insights with their embeddings. Returns count inserted."""
        rows = []
        for insight, embedding in zip(insights, embeddings):
            rows.append({
                "id": insight["id"],
                "source_video_id": insight.get("source_video_id", ""),
                "source_url": insight.get("source_url", ""),
                "source_title": insight.get("source_title", ""),
                "expert_name": insight.get("expert_name", ""),
                "expert_channel": insight.get("expert_channel", ""),
                "timestamp_start": insight.get("timestamp_start"),
                "timestamp_end": insight.get("timestamp_end"),
                "domain": insight.get("domain", ""),
                "sub_domain": insight.get("sub_domain", ""),
                "insight_type": insight.get("insight_type", ""),
                "title": insight.get("title", ""),
                "content": insight.get("content", ""),
                "key_quote": insight.get("key_quote"),
                "actionability": insight.get("actionability", "medium"),
                "confidence": insight.get("confidence", 0.5),
                "related_experts": json.dumps(insight.get("related_experts", [])),
                "tags": json.dumps(insight.get("tags", [])),
                "embedding": embedding,
                "ingested_at": insight.get("ingested_at"),
                "processed_at": insight.get("processed_at"),
            })

        result = self.client.table("insights").insert(rows).execute()
        count = len(result.data) if result.data else 0
        logger.info(f"Inserted {count} insights in batch")
        return count

    def search_similar(
        self,
        query_text: str,
        domain: Optional[str] = None,
        top_k: int = 10,
        similarity_threshold: float = 0.5,
    ) -> list[dict]:
        """Semantic search: embed the query and find similar insights."""
        query_embedding = generate_embedding(query_text)

        params = {
            "query_embedding": query_embedding,
            "match_count": top_k,
            "match_threshold": similarity_threshold,
        }
        if domain:
            params["filter_domain"] = domain

        result = self.client.rpc("match_insights", params).execute()
        return result.data or []

    def get_insights_by_domain(self, domain: str, limit: int = 1000) -> list[dict]:
        """Fetch all insights for a given domain."""
        result = (
            self.client.table("insights")
            .select("*")
            .eq("domain", domain)
            .limit(limit)
            .execute()
        )
        return result.data or []

    def get_insights_by_video(self, video_id: str) -> list[dict]:
        """Fetch all insights extracted from a specific video."""
        result = (
            self.client.table("insights")
            .select("*")
            .eq("source_video_id", video_id)
            .execute()
        )
        return result.data or []

    def delete_by_video(self, video_id: str) -> int:
        """Delete all insights from a specific video (for reprocessing)."""
        result = (
            self.client.table("insights")
            .delete()
            .eq("source_video_id", video_id)
            .execute()
        )
        count = len(result.data) if result.data else 0
        logger.info(f"Deleted {count} insights for video {video_id}")
        return count

    def count_by_domain(self) -> dict:
        """Get insight counts grouped by domain."""
        result = self.client.rpc("count_insights_by_domain").execute()
        return {row["domain"]: row["count"] for row in (result.data or [])}
