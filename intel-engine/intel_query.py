"""
Query engine — answer questions against a domain's accumulated knowledge.
Uses keyword-based retrieval + GPT answer synthesis with citations.
"""

import logging
import sqlite3

from openai import OpenAI

import config

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
4. Be concise but thorough
5. Use bullet points for multi-part answers
6. Highlight actionable takeaways in bold"""


def search_insights(domain_id: int, query: str, limit: int = 15, db_path=None) -> list[dict]:
    """Search insights by keyword matching within a domain."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    stop_words = {'the', 'and', 'for', 'that', 'this', 'with', 'from', 'have', 'what', 'how', 'when', 'where', 'which', 'about', 'your', 'they', 'will', 'been', 'some', 'into', 'than', 'also', 'just', 'more', 'most', 'very', 'does', 'should'}
    words = [w.lower() for w in query.split() if len(w) > 3 and w.lower() not in stop_words]

    if not words:
        rows = conn.execute(
            """SELECT i.title, i.content, i.insight_type, i.actionability, i.key_quotes,
                      s.title as video_title, s.channel
               FROM insights i JOIN sources s ON i.source_id = s.id
               WHERE i.domain_id = ? ORDER BY i.id DESC LIMIT ?""",
            (domain_id, limit),
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    conditions = []
    params = []
    for word in words:
        conditions.append("(LOWER(i.title) LIKE ? OR LOWER(i.content) LIKE ?)")
        params.extend([f"%{word}%", f"%{word}%"])

    scoring_params = []
    for word in words:
        scoring_params.extend([f"%{word}%", f"%{word}%"])

    query_sql = f"""
        SELECT i.title, i.content, i.insight_type, i.actionability, i.key_quotes,
               s.title as video_title, s.channel,
               ({' + '.join(f"(CASE WHEN LOWER(i.title) LIKE ? OR LOWER(i.content) LIKE ? THEN 1 ELSE 0 END)" for _ in words)}) as relevance
        FROM insights i JOIN sources s ON i.source_id = s.id
        WHERE i.domain_id = ? AND ({' OR '.join(conditions)})
        ORDER BY relevance DESC, i.id DESC LIMIT ?
    """

    all_params = scoring_params + [domain_id] + params + [limit]
    rows = conn.execute(query_sql, all_params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def query_domain(domain_id: int, question: str, db_path=None) -> dict:
    """Answer a question using domain knowledge."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('openai')
    if not api_key:
        return {"answer": "OpenAI API key not configured. Please add it in Settings.", "sources_used": 0}

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

    insights = search_insights(domain_id, question, limit=10, db_path=db_path)

    insights_text = "\n".join(
        f"- [{i['insight_type']}] {i['title']}: {i['content']} (Source: {i['channel']})"
        for i in insights
    ) if insights else "No specific insights found matching this query."

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You are a helpful domain expert. Answer questions using only provided knowledge."},
            {"role": "user", "content": ANSWER_PROMPT.format(
                domain_name=domain_name, synthesis=synthesis,
                insights=insights_text, question=question,
            )},
        ],
        temperature=0.3,
        max_tokens=1500,
    )

    answer = response.choices[0].message.content.strip()
    sources = set()
    for i in insights:
        sources.add(f"{i['video_title']} by {i['channel']}")

    return {"answer": answer, "sources_used": len(sources), "insights_found": len(insights)}
