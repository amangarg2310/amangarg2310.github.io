"""
Query engine — answer questions against a domain's accumulated knowledge.

Uses hybrid retrieval (vector similarity + FTS5 keyword search) + Anthropic Haiku answer synthesis.
Falls back to keyword-only search if embeddings are not available.
"""

import logging
import sqlite3

from anthropic import Anthropic

import config
from embeddings import generate_embedding, cosine_similarity, deserialize_embedding

logger = logging.getLogger(__name__)

ANSWER_PROMPT = """You are a domain expert assistant. Answer the user's question using ONLY the knowledge provided below.

DOMAIN: {domain_name}

DOMAIN SYNTHESIS:
{synthesis}

RELEVANT INSIGHTS:
{insights}

USER QUESTION: {question}

RULES:
1. Answer based ONLY on the provided knowledge — do NOT supplement with your own training knowledge
2. For EVERY claim in your answer, cite the source: [Source: Title by Channel]
3. If multiple sources agree on a point, note this: "Multiple sources confirm..." and list them
4. If sources disagree, present both views: "[Source A] argues X, while [Source B] argues Y"
5. If the knowledge base doesn't contain enough information to fully answer, say so explicitly rather than guessing
6. Be specific and detailed — include exact commands, config values, tool names when relevant
7. Use bullet points for multi-part answers
8. Highlight actionable takeaways in **bold**
9. When evidence is provided for a claim, briefly note the basis (e.g., "demonstrated in practice", "based on their experience scaling to 10K users")"""


def search_insights_hybrid(domain_id: int, query: str, limit: int = 15, db_path=None) -> list[dict]:
    """
    Hybrid search: vector similarity + FTS5 keyword matching.

    Returns top insights ranked by combined score.
    Falls back to keyword-only if embeddings aren't available.
    """
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Load all insights for domain with their embeddings
    rows = conn.execute("""
        SELECT i.id, i.title, i.content, i.insight_type, i.actionability,
               i.key_quotes, i.embedding, i.evidence, i.source_context, i.confidence,
               s.title as source_title, s.channel
        FROM insights i JOIN sources s ON i.source_id = s.id
        WHERE i.domain_id = ? AND s.status = 'processed'
    """, (domain_id,)).fetchall()

    if not rows:
        conn.close()
        return []

    insights = [dict(r) for r in rows]

    # Vector search scores
    vector_scores = {}
    has_embeddings = any(i.get('embedding') for i in insights)

    if has_embeddings:
        query_embedding = generate_embedding(query)
        if query_embedding:
            for insight in insights:
                emb = deserialize_embedding(insight.get('embedding'))
                if emb:
                    score = cosine_similarity(query_embedding, emb)
                    vector_scores[insight['id']] = score

    # FTS5 keyword search scores
    fts_scores = {}
    try:
        fts_rows = conn.execute("""
            SELECT rowid, rank FROM insights_fts
            WHERE insights_fts MATCH ? AND rowid IN (
                SELECT i.id FROM insights i WHERE i.domain_id = ?
            )
            ORDER BY rank LIMIT 30
        """, (query, domain_id)).fetchall()
        # FTS5 rank is negative (more negative = better match)
        if fts_rows:
            max_rank = max(abs(r[1]) for r in fts_rows) or 1.0
            for r in fts_rows:
                fts_scores[r[0]] = abs(r[1]) / max_rank  # Normalize to 0-1
    except sqlite3.OperationalError:
        # FTS5 table may not exist, fall back to LIKE search
        fts_scores = _keyword_fallback(conn, domain_id, query)

    conn.close()

    # Combine scores (60% vector, 40% keyword)
    combined = {}
    all_ids = set(vector_scores.keys()) | set(fts_scores.keys())

    for insight_id in all_ids:
        v_score = vector_scores.get(insight_id, 0.0)
        k_score = fts_scores.get(insight_id, 0.0)

        if has_embeddings and vector_scores:
            combined[insight_id] = 0.6 * v_score + 0.4 * k_score
        else:
            combined[insight_id] = k_score  # Keyword-only fallback

    # If no scores at all, return recent insights
    if not combined:
        return [
            {k: v for k, v in i.items() if k != 'embedding'}
            for i in sorted(insights, key=lambda x: x['id'], reverse=True)[:limit]
        ]

    # Rank and return top results
    ranked_ids = sorted(combined.keys(), key=lambda x: combined[x], reverse=True)[:limit]
    insight_map = {i['id']: i for i in insights}

    return [
        {**{k: v for k, v in insight_map[iid].items() if k != 'embedding'}, 'combined_score': combined.get(iid, 0)}
        for iid in ranked_ids if iid in insight_map
    ]


def _keyword_fallback(conn, domain_id: int, query: str) -> dict[int, float]:
    """Fallback keyword scoring using LIKE matching (when FTS5 not available)."""
    stop_words = {'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'what',
                  'how', 'when', 'where', 'which', 'about', 'your', 'they', 'will'}
    words = [w.lower() for w in query.split() if len(w) > 3 and w.lower() not in stop_words]
    if not words:
        return {}

    scores = {}
    rows = conn.execute("""
        SELECT i.id, i.title, i.content
        FROM insights i WHERE i.domain_id = ?
    """, (domain_id,)).fetchall()

    for row in rows:
        title_lower = row[1].lower()
        content_lower = row[2].lower()
        score = sum(1 for w in words if w in title_lower or w in content_lower)
        if score > 0:
            scores[row[0]] = score / len(words)  # Normalize to 0-1

    return scores


def query_domain(domain_id: int, question: str, db_path=None) -> dict:
    """Answer a question using domain knowledge with hybrid RAG retrieval.

    Supports cross-domain query decomposition (Tier 4D): if the query spans
    multiple child domains, retrieves from each and synthesizes a cross-domain answer.
    """
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('anthropic')
    if not api_key:
        return {"answer": "Anthropic API key not configured. Please add it in Settings.", "sources_used": 0}

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    domain = conn.execute("SELECT id, name, level FROM domains WHERE id = ?", (domain_id,)).fetchone()
    if not domain:
        conn.close()
        return {"answer": "Domain not found.", "sources_used": 0}
    domain_name = domain['name']

    # Cross-domain retrieval: if this is a parent domain (level 0 or 1 with children),
    # also retrieve from child domains for broader coverage
    child_domain_ids = []
    if domain['level'] <= 1:
        children = conn.execute(
            "SELECT id FROM domains WHERE parent_id = ? AND source_count > 0", (domain_id,)
        ).fetchall()
        child_domain_ids = [c['id'] for c in children]

    synthesis_row = conn.execute(
        "SELECT content FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1", (domain_id,)
    ).fetchone()
    synthesis = synthesis_row['content'] if synthesis_row else "No synthesis available yet."
    conn.close()

    # Hybrid retrieval — from primary domain + children for cross-domain coverage
    all_domain_ids = [domain_id] + child_domain_ids
    insights = []
    for did in all_domain_ids:
        results = search_insights_hybrid(did, question, limit=10 if child_domain_ids else 15, db_path=db_path)
        insights.extend(results)

    # Deduplicate by insight ID and sort by combined score
    seen = set()
    unique_insights = []
    for i in insights:
        if i['id'] not in seen:
            seen.add(i['id'])
            unique_insights.append(i)
    insights = sorted(unique_insights, key=lambda x: x.get('combined_score', 0), reverse=True)[:15]

    def _format_insight(i):
        parts = [f"- [{i.get('insight_type', 'general')}] {i['title']}: {i['content']}"]
        if i.get('evidence'):
            parts.append(f"  Evidence: {i['evidence']}")
        if i.get('source_context'):
            parts.append(f"  Context: {i['source_context']}")
        source_label = i.get('source_title') or i.get('channel', 'Unknown')
        channel = i.get('channel', '')
        if channel and channel != source_label:
            source_label = f"{source_label} by {channel}"
        parts.append(f"  [Source: {source_label}] (confidence: {i.get('confidence', 'stated')})")
        return "\n".join(parts)

    insights_text = "\n\n".join(
        _format_insight(i) for i in insights
    ) if insights else "No specific insights found matching this query."

    client = Anthropic(api_key=api_key)

    try:
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="You are a helpful domain expert. Answer questions using only provided knowledge. Be specific and cite your sources.",
            messages=[
                {"role": "user", "content": ANSWER_PROMPT.format(
                    domain_name=domain_name, synthesis=synthesis,
                    insights=insights_text, question=question,
                )},
            ],
            temperature=0.3,
            max_tokens=2000,
        )

        answer = response.content[0].text.strip()
    except Exception as e:
        logger.error(f"Query failed: {e}")
        answer = "Sorry, I encountered an error processing your question. Please try again."

    sources = set()
    for i in insights:
        src = f"{i.get('source_title', '')} by {i.get('channel', '')}"
        if src.strip() != 'by':
            sources.add(src)

    return {"answer": answer, "sources_used": len(sources), "insights_found": len(insights)}
