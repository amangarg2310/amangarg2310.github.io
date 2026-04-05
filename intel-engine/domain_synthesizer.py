"""
Domain synthesis — compounds knowledge as new sources are ingested.

After each new source is processed, the synthesizer:
1. Loads the existing synthesis for the domain
2. Loads all new insights from the just-processed source
3. Sends both to GPT to create an updated, comprehensive synthesis
4. Stores the new synthesis with an incremented version number
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone

from openai import OpenAI

import config

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """You are a world-class technical knowledge synthesizer. Your job is to maintain a DETAILED, PRACTICAL knowledge base for the domain: "{domain_name}".

{existing_section}

NEW INSIGHTS (from: "{source_title}" by {channel}, added {source_date}):
{new_insights}

YOUR TASK:
Create an updated, comprehensive synthesis that someone can USE as a reference to actually DO things — not just understand them at a high level.

RULES:
1. PRESERVE GRANULAR DETAIL — specific tool names, commands, config values, step-by-step procedures, exact settings. Never flatten "install via Docker using docker run -p 3000:3000 openinterpreter/openinterpreter" into "can be installed using Docker."
2. INTEGRATE new insights with existing knowledge — merge, don't just append. But NEVER lose specific details during merging.
3. When multiple sources cover the same topic, show the BEST/most detailed version and note consensus or disagreements.
4. Organize by WORKFLOW/TASK, not by abstract category. Group by "what someone would be trying to do" — e.g. "Setting Up Daily Briefs" not "Configuration Options."
5. Preserve warnings, gotchas, and "what NOT to do" — these are high-value.
6. Note which expert/source each key insight comes from.
7. TEMPORAL AWARENESS: Source dates are provided. When new information contradicts older information:
   - If the newer source says something is "deprecated", "removed", "no longer available", "changed", "replaced", or "updated" — UPDATE the synthesis to reflect the current state. Remove or clearly mark the outdated info.
   - When sources disagree, prefer the MORE RECENT source and note the change: "As of [date], X replaced Y" or "Previously recommended X, now Y is preferred (Source: Channel, Date)."
   - Never keep both old and new versions of the same fact as if they're both current.
8. Source dates are approximate (when the source was added). Treat them as indicators of relative recency.

FORMAT as clean markdown:

Start with a ## TLDR section (3-5 bullet points) summarizing the most important takeaways:
- What this domain is about (1 sentence)
- The single most important thing to know
- Key tools/commands/resources mentioned
- Any critical warnings or gotchas

Then continue with detailed sections:
- ## Headers organized by task/workflow (not abstract categories)
- Numbered steps for procedures (1. Do X, 2. Then Y...)
- Bullet points for tips, options, and alternatives
- **Bold** for critical warnings and key recommendations
- `code formatting` for commands, file paths, tool names, config values
- > Blockquotes for important direct quotes
- Attribution in parentheses (Source: Channel Name)

Be THOROUGH. This is a reference document, not an executive summary. Include everything someone would need to know. Longer is fine if the detail is useful and actionable."""


FULL_RESYNTHESIS_PROMPT = """You are a world-class technical knowledge synthesizer. Your job is to create a DETAILED, PRACTICAL knowledge base for the domain: "{domain_name}".

You are given ALL insights from ALL sources in this domain. Build a comprehensive synthesis from scratch.

{all_insights}

YOUR TASK:
Create a complete, well-organized synthesis from all the insights above.

RULES:
1. PRESERVE GRANULAR DETAIL — specific tool names, commands, config values, step-by-step procedures, exact settings.
2. When multiple sources cover the same topic, show the BEST/most detailed version and note consensus or disagreements.
3. Organize by WORKFLOW/TASK, not by abstract category.
4. Preserve warnings, gotchas, and "what NOT to do."
5. Note which expert/source each key insight comes from.
6. TEMPORAL AWARENESS: Sources are listed chronologically (oldest first). When a newer source contradicts an older one:
   - Use the NEWER information as the current truth.
   - Mark significant changes: "As of [source date], X was replaced by Y."
   - Do NOT present outdated information alongside current information as if both are valid.

FORMAT as clean markdown:

Start with a ## TLDR section (3-5 bullet points) summarizing the most important takeaways:
- What this domain is about (1 sentence)
- The single most important thing to know
- Key tools/commands/resources mentioned
- Any critical warnings or gotchas

Then continue with detailed sections:
- ## Headers organized by task/workflow (not abstract categories)
- Numbered steps for procedures (1. Do X, 2. Then Y...)
- Bullet points for tips, options, and alternatives
- **Bold** for critical warnings and key recommendations
- `code formatting` for commands, file paths, tool names, config values
- > Blockquotes for important direct quotes
- Attribution in parentheses (Source: Channel Name)

Be THOROUGH. This is a reference document, not an executive summary."""


def _update_parent_counts(conn, domain_id: int, now: str):
    """Roll up source/insight counts to the parent category."""
    parent_row = conn.execute("SELECT parent_id FROM domains WHERE id = ?", (domain_id,)).fetchone()
    if parent_row and parent_row[0]:
        parent_id = parent_row[0]
        agg = conn.execute("""
            SELECT COALESCE(SUM(source_count), 0), COALESCE(SUM(insight_count), 0)
            FROM domains WHERE parent_id = ? AND level = 1
        """, (parent_id,)).fetchone()
        conn.execute(
            "UPDATE domains SET source_count = ?, insight_count = ?, updated_at = ? WHERE id = ?",
            (agg[0], agg[1], now, parent_id),
        )


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


def synthesize_domain(domain_id: int, source_id: int, source_title: str, channel: str, db_path=None, source_date: str = None) -> str:
    """Create or update the domain synthesis after a new source is processed."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    current = get_current_synthesis(domain_id, db_path)

    if current:
        existing_section = f"EXISTING SYNTHESIS (v{current['version']}, from {current['source_count']} sources, {current['insight_count']} insights):\n{current['content']}"
        next_version = current['version'] + 1
    else:
        existing_section = "No existing synthesis yet — this is the first source for this domain. Create a comprehensive foundation."
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

    if not source_date:
        source_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You synthesize knowledge into detailed, practical reference documents. Preserve specific steps, commands, tool names, configurations, and actionable detail. Write in clean markdown. This is a how-to reference, not an executive summary."},
            {"role": "user", "content": SYNTHESIS_PROMPT.format(
                domain_name=domain_name,
                existing_section=existing_section,
                source_title=source_title,
                channel=channel,
                source_date=source_date,
                new_insights=new_insights_text,
            )},
        ],
        temperature=0.3,
        max_tokens=8000,
    )

    synthesis_content = response.choices[0].message.content.strip()

    # Generate suggested questions
    suggested = _generate_suggested_questions(client, domain_name, synthesis_content)

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, suggested_questions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (domain_id, synthesis_content, source_count, insight_count, next_version, suggested, now),
    )
    conn.execute(
        "UPDATE domains SET source_count = ?, insight_count = ?, updated_at = ? WHERE id = ?",
        (source_count, insight_count, now, domain_id),
    )
    # Roll up counts to parent category
    _update_parent_counts(conn, domain_id, now)
    conn.commit()
    conn.close()

    logger.info(f"Created synthesis v{next_version} for '{domain_name}' ({source_count} sources, {insight_count} insights)")
    return synthesis_content


def resynthesize_domain_full(domain_id: int, db_path=None) -> str:
    """
    Rebuild the domain synthesis from ALL remaining insights.

    Used after a source is deleted or after re-processing — rebuilds from scratch
    rather than doing incremental synthesis.
    """
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    domain_row = conn.execute("SELECT name FROM domains WHERE id = ?", (domain_id,)).fetchone()
    domain_name = domain_row[0] if domain_row else "Unknown"

    # Get all insights grouped by source, ordered chronologically
    rows = conn.execute("""
        SELECT i.title, i.content, i.insight_type, i.actionability, i.key_quotes,
               s.title as source_title, s.channel, s.created_at as source_date, s.source_type
        FROM insights i
        JOIN sources s ON i.source_id = s.id
        WHERE i.domain_id = ? AND s.status = 'processed'
        ORDER BY s.created_at ASC, i.chunk_index ASC
    """, (domain_id,)).fetchall()

    source_count = conn.execute(
        "SELECT COUNT(*) FROM sources WHERE domain_id = ? AND status = 'processed'", (domain_id,)
    ).fetchone()[0]
    insight_count = len(rows)

    current = get_current_synthesis(domain_id, db_path)
    next_version = (current['version'] + 1) if current else 1

    conn.close()

    if not rows:
        # No insights remain — clear synthesis
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute(
            "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, created_at) VALUES (?, ?, 0, 0, ?, ?)",
            (domain_id, "", next_version, now),
        )
        conn.execute(
            "UPDATE domains SET source_count = 0, insight_count = 0, updated_at = ? WHERE id = ?",
            (now, domain_id),
        )
        conn.commit()
        conn.close()
        return ""

    # Group insights by source for the prompt
    source_groups = {}
    for row in rows:
        row = dict(row)
        key = (row['source_title'], row['channel'], row['source_date'], row.get('source_type', 'youtube'))
        if key not in source_groups:
            source_groups[key] = []
        source_groups[key].append(row)

    # Build the all-insights text with token guard
    all_insights_parts = []
    total_words = 0
    max_words = 6000

    for (src_title, channel, src_date, src_type), insights in source_groups.items():
        date_str = src_date[:10] if src_date else "unknown date"
        type_label = {"youtube": "Video", "article": "Article", "pdf": "PDF", "docx": "Document", "pptx": "Slides", "image": "Image", "text": "Text"}.get(src_type, "Source")
        header = f"\n### From: \"{src_title}\" by {channel} ({type_label}, {date_str})\n"
        all_insights_parts.append(header)
        total_words += len(header.split())

        for i in insights:
            line = f"- **{i['title']}** [{i['insight_type']}, {i['actionability']}]: {i['content']}"
            if i.get('key_quotes'):
                line += f'\n  > "{i["key_quotes"]}"'
            line_words = len(line.split())
            if total_words + line_words > max_words:
                all_insights_parts.append("\n[... additional insights truncated for length ...]")
                break
            all_insights_parts.append(line)
            total_words += line_words
        else:
            continue
        break

    all_insights_text = "\n".join(all_insights_parts)

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You synthesize knowledge into detailed, practical reference documents. Preserve specific steps, commands, tool names, configurations, and actionable detail. Write in clean markdown."},
            {"role": "user", "content": FULL_RESYNTHESIS_PROMPT.format(
                domain_name=domain_name,
                all_insights=all_insights_text,
            )},
        ],
        temperature=0.3,
        max_tokens=8000,
    )

    synthesis_content = response.choices[0].message.content.strip()

    suggested = _generate_suggested_questions(client, domain_name, synthesis_content)

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, suggested_questions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (domain_id, synthesis_content, source_count, insight_count, next_version, suggested, now),
    )
    conn.execute(
        "UPDATE domains SET source_count = ?, insight_count = ?, updated_at = ? WHERE id = ?",
        (source_count, insight_count, now, domain_id),
    )
    _update_parent_counts(conn, domain_id, now)
    conn.commit()
    conn.close()

    logger.info(f"Full re-synthesis v{next_version} for '{domain_name}' ({source_count} sources, {insight_count} insights)")
    return synthesis_content


def _generate_suggested_questions(client: OpenAI, domain_name: str, synthesis: str) -> str:
    """Generate 3 suggested starter questions based on the synthesis content."""
    try:
        # Use first ~1000 words of synthesis for context
        excerpt = " ".join(synthesis.split()[:1000])
        response = client.chat.completions.create(
            model=config.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "Generate exactly 3 questions a learner would ask about this knowledge base. Return a JSON array of 3 strings. Questions should be specific and actionable, not generic."},
                {"role": "user", "content": f"Domain: {domain_name}\n\nKnowledge:\n{excerpt}\n\nReturn ONLY a JSON array of 3 question strings:"},
            ],
            temperature=0.5,
            max_tokens=300,
        )
        content = response.choices[0].message.content.strip()
        # Strip markdown
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
        questions = json.loads(content)
        if isinstance(questions, list) and len(questions) >= 1:
            return json.dumps(questions[:3])
    except Exception as e:
        logger.warning(f"Failed to generate suggested questions: {e}")
    return "[]"
