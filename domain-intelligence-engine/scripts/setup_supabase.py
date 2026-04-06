#!/usr/bin/env python3
"""CLI: Initialize the Supabase database schema with pgvector."""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import EMBEDDING_DIMENSIONS, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SCHEMA_SQL = f"""
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Main insights table
CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    source_video_id TEXT NOT NULL,
    source_url TEXT,
    source_title TEXT,
    expert_name TEXT,
    expert_channel TEXT,
    timestamp_start TEXT,
    timestamp_end TEXT,
    domain TEXT NOT NULL,
    sub_domain TEXT,
    insight_type TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    key_quote TEXT,
    actionability TEXT DEFAULT 'medium',
    confidence FLOAT DEFAULT 0.5,
    related_experts TEXT DEFAULT '[]',
    tags TEXT DEFAULT '[]',
    embedding vector({EMBEDDING_DIMENSIONS}),
    ingested_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_insights_domain ON insights(domain);
CREATE INDEX IF NOT EXISTS idx_insights_sub_domain ON insights(sub_domain);
CREATE INDEX IF NOT EXISTS idx_insights_video ON insights(source_video_id);
CREATE INDEX IF NOT EXISTS idx_insights_expert ON insights(expert_name);
CREATE INDEX IF NOT EXISTS idx_insights_type ON insights(insight_type);

-- Vector similarity search index (IVFFlat)
CREATE INDEX IF NOT EXISTS idx_insights_embedding ON insights
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- Function for semantic search
CREATE OR REPLACE FUNCTION match_insights(
    query_embedding vector({EMBEDDING_DIMENSIONS}),
    match_count INT DEFAULT 10,
    match_threshold FLOAT DEFAULT 0.5,
    filter_domain TEXT DEFAULT NULL
)
RETURNS TABLE (
    id TEXT,
    source_video_id TEXT,
    source_url TEXT,
    source_title TEXT,
    expert_name TEXT,
    expert_channel TEXT,
    timestamp_start TEXT,
    timestamp_end TEXT,
    domain TEXT,
    sub_domain TEXT,
    insight_type TEXT,
    title TEXT,
    content TEXT,
    key_quote TEXT,
    actionability TEXT,
    confidence FLOAT,
    related_experts TEXT,
    tags TEXT,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id, i.source_video_id, i.source_url, i.source_title,
        i.expert_name, i.expert_channel, i.timestamp_start, i.timestamp_end,
        i.domain, i.sub_domain, i.insight_type, i.title, i.content,
        i.key_quote, i.actionability, i.confidence,
        i.related_experts, i.tags,
        1 - (i.embedding <=> query_embedding) AS similarity
    FROM insights i
    WHERE
        (filter_domain IS NULL OR i.domain = filter_domain)
        AND 1 - (i.embedding <=> query_embedding) > match_threshold
    ORDER BY i.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function for counting insights by domain
CREATE OR REPLACE FUNCTION count_insights_by_domain()
RETURNS TABLE (domain TEXT, count BIGINT)
LANGUAGE sql
AS $$
    SELECT domain, COUNT(*) as count
    FROM insights
    GROUP BY domain
    ORDER BY count DESC;
$$;

-- Playbooks table
CREATE TABLE IF NOT EXISTS playbooks (
    id TEXT PRIMARY KEY,
    domain TEXT NOT NULL,
    title TEXT NOT NULL,
    version INT DEFAULT 1,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    total_sources INT DEFAULT 0,
    total_experts INT DEFAULT 0,
    content JSONB NOT NULL,
    UNIQUE(domain, version)
);

CREATE INDEX IF NOT EXISTS idx_playbooks_domain ON playbooks(domain);
"""


def main():
    logger.info("Initializing Supabase schema...")

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    # Execute SQL via Supabase's RPC or direct query
    # Note: For schema changes, you may need to run this SQL directly in the Supabase SQL editor
    logger.info("Schema SQL to execute in Supabase SQL Editor:")
    print("\n" + SCHEMA_SQL)
    logger.info(
        "\nCopy the SQL above and run it in your Supabase project's SQL Editor at: "
        f"{SUPABASE_URL.replace('.supabase.co', '.supabase.co')}/project/default/sql"
    )
    logger.info("This sets up the insights table, vector indexes, and search functions.")


if __name__ == "__main__":
    main()
