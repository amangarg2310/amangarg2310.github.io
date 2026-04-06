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
1. Answer based ONLY on the provided knowledge — don't make things up
2. Cite sources in parentheses: (Source: Channel Name)
3. If the knowledge doesn't cover the question, say so clearly
4. Be specific and detailed — include exact commands, config values, tool names when relevant
5. Use bullet points for multi-part answers
6. Highlight actionable takeaways in bold
7. If multiple sources agree, note the consensus. If they disagree, note both perspectives."""


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
               i.key_quotes, i.embedding,
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
        {k: v for k, v in insight_map[iid].items() if k != 'embedding'}
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
    """Answer a question using domain knowledge with hybrid RAG retrieval."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('anthropic')
    if not api_key:
        return {"answer": "Anthropic API key not configured. Please add it in Settings.", "sources_used": 0}

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    domain = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
    if not domain:
        conn.close()
        return {"answer": "Domain not found.", "sources_used": 0}
    domain_name = domain['name']

    synthesis_row = conn.execute(
        "SELECT content FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1", (domain_id,)
    ).fetchone()
    synthesis = synthesis_row['content'] if synthesis_row else "No synthesis available yet."
    conn.close()

    # Hybrid retrieval
    insights = search_insights_hybrid(domain_id, question, limit=15, db_path=db_path)

    insights_text = "\n".join(
        f"- [{i.get('insight_type', 'general')}] {i['title']}: {i['content']} (Source: {i.get('channel', 'Unknown')})"
        for i in insights
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
