"""
Domain synthesis — compounds knowledge as new videos are ingested.

After each new video is processed, the synthesizer:
1. Loads the existing synthesis for the domain
2. Loads all new insights from the just-processed video
3. Sends both to GPT to create an updated, comprehensive synthesis
4. Stores the new synthesis with an incremented version number
"""

import logging
import sqlite3
from datetime import datetime, timezone

from openai import OpenAI

import config

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """You are a world-class knowledge synthesizer. Your job is to maintain a comprehensive, evolving knowledge base for the domain: "{domain_name}".

{existing_section}

NEW INSIGHTS (from: "{video_title}" by {channel}):
{new_insights}

YOUR TASK:
Create an updated, comprehensive synthesis that:
1. INTEGRATES the new insights with existing knowledge — don't just append, truly synthesize
2. Resolves any contradictions between old and new information (note which expert said what)
3. Highlights consensus where multiple sources agree
4. Preserves the most actionable, high-value information
5. Organizes by sub-topics within the domain
6. Notes which expert/source each key insight comes from

FORMAT your synthesis as clean markdown with:
- Clear section headers (## Sub-topic)
- Bullet points for key insights
- Bold for critical takeaways
- Attribution in parentheses (Source: Channel Name)

Keep the synthesis focused, actionable, and well-organized. Remove redundancy.
Target length: comprehensive but concise — quality over quantity."""


def get_current_synthesis(domain_id: int, db_path=None) -> dict | None:
    """Get the latest synthesis for a domain."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT id, content, source_count, insight_count, version FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
        (domain_id,),
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_domain_insights_for_source(source_id: int, db_path=None) -> list[dict]:
    """Get all insights extracted from a specific source."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT title, content, insight_type, actionability, key_quotes FROM insights WHERE source_id = ? ORDER BY chunk_index",
        (source_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def synthesize_domain(domain_id: int, source_id: int, video_title: str, channel: str, db_path=None) -> str:
    """Create or update the domain synthesis after a new video is processed."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    current = get_current_synthesis(domain_id, db_path)

    if current:
        existing_section = f"EXISTING SYNTHESIS (v{current['version']}, from {current['source_count']} videos, {current['insight_count']} insights):\n{current['content']}"
        next_version = current['version'] + 1
    else:
        existing_section = "No existing synthesis yet — this is the first video for this domain. Create a comprehensive foundation."
        next_version = 1

    new_insights_data = get_domain_insights_for_source(source_id, db_path)
    if not new_insights_data:
        return current['content'] if current else ""

    new_insights_text = "\n".join(
        f"- **{i['title']}** [{i['insight_type']}, {i['actionability']}]: {i['content']}"
        + (f'\n  > "{i["key_quotes"]}"' if i.get('key_quotes') else "")
        for i in new_insights_data
    )

    conn = sqlite3.connect(str(db_path))
    domain_row = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
    domain_name = domain_row[0] if domain_row else "Unknown"

    source_count = conn.execute(
        "SELECT COUNT(*) FROM sources WHERE domain_id = ? AND status = 'processed'", (domain_id,)
    ).fetchone()[0]
    insight_count = conn.execute(
        "SELECT COUNT(*) FROM insights WHERE domain_id = ?", (domain_id,)
    ).fetchone()[0]
    conn.close()

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You synthesize knowledge into comprehensive, well-organized documents. Write in clean markdown."},
            {"role": "user", "content": SYNTHESIS_PROMPT.format(
                domain_name=domain_name,
                existing_section=existing_section,
                video_title=video_title,
                channel=channel,
                new_insights=new_insights_text,
            )},
        ],
        temperature=0.4,
        max_tokens=4000,
    )

    synthesis_content = response.choices[0].message.content.strip()

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (domain_id, synthesis_content, source_count, insight_count, next_version, now),
    )
    conn.execute(
        "UPDATE domains SET source_count = ?, insight_count = ?, updated_at = ? WHERE id = ?",
        (source_count, insight_count, now, domain_id),
    )
    conn.commit()
    conn.close()

    logger.info(f"Created synthesis v{next_version} for '{domain_name}' ({source_count} sources, {insight_count} insights)")
    return synthesis_content
