"""
Domain synthesis — compounds knowledge as new sources are ingested.

Uses Anthropic Haiku 4.5 for superior long-form synthesis quality.

After each new source is processed, the synthesizer:
1. Loads the existing synthesis for the domain
2. Loads all new insights from the just-processed source
3. Sends both to Claude to create an updated, comprehensive synthesis
4. Stores the new synthesis with an incremented version number
"""

import json
import logging
import sqlite3
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from anthropic import Anthropic

import config

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """You are a world-class technical knowledge synthesizer. Your job is to maintain a DETAILED, PRACTICAL knowledge base for the domain: "{domain_name}".

{existing_section}

NEW INSIGHTS (from: "{source_title}" by {channel}, added {source_date}):
{new_insights}

YOUR TASK:
Create an updated, comprehensive synthesis that someone can USE as a reference to actually DO things — not just understand them at a high level.

COGNITIVE LEVEL: Write at the KNOWLEDGE and COMPREHENSION level — focus on facts, procedures, and descriptions. What are the specific tools, steps, and configurations? Be concrete and procedural. This is where the user comes to remember how things work and follow along step by step.

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

Start with a ## TLDR section — 3-5 bullet points that capture the MOST IMPORTANT takeaways from this specific domain's content. Each bullet should be concrete and actionable (include exact commands, URLs, specific names, or precise steps — never vague).

CRITICAL: Do NOT use a fixed template or fixed bullet labels. The TLDR should organically reflect whatever matters most for THIS specific topic. A cooking domain's TLDR looks nothing like a programming domain's TLDR. Let the content dictate the structure. Never use labels like "Fastest start:" or "Most valuable capability:" — just write natural, specific bullets.

Bad example: "- **Fastest start:** Install X" (templated label)
Good example: "- Install with `pip install openinterpreter`, run `interpreter` — you'll have a working AI coding assistant in 30 seconds" (natural, specific)

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

Start with a ## TLDR section — 3-5 bullet points that capture the MOST IMPORTANT takeaways from this specific domain's content. Each bullet should be concrete and actionable (include exact commands, URLs, specific names, or precise steps — never vague).

CRITICAL: Do NOT use a fixed template or fixed bullet labels. The TLDR should organically reflect whatever matters most for THIS specific topic. A cooking domain's TLDR looks nothing like a programming domain's TLDR. Let the content dictate the structure. Never use labels like "Fastest start:" or "Most valuable capability:" — just write natural, specific bullets.

Then continue with detailed sections:
- ## Headers organized by task/workflow (not abstract categories)
- Numbered steps for procedures (1. Do X, 2. Then Y...)
- Bullet points for tips, options, and alternatives
- **Bold** for critical warnings and key recommendations
- `code formatting` for commands, file paths, tool names, config values
- > Blockquotes for important direct quotes
- Attribution in parentheses (Source: Channel Name)

Be THOROUGH. This is a reference document, not an executive summary."""


DOMAIN_SYNTHESIS_PROMPT = """You are a knowledge architect. Your job is to create a MID-LEVEL THEMATIC OVERVIEW for the domain area: "{domain_name}".

You are given syntheses from the sub-topics within this domain. Write an overview that:
1. Captures the key themes and major tools/concepts across all sub-topics
2. Shows how sub-topics relate to each other (dependencies, alternatives, complementary tools)
3. Highlights the most important takeaways across the whole domain
4. Is scannable in under 3 minutes of reading

COGNITIVE LEVEL: Write at the ANALYSIS and APPLICATION level — compare approaches across sub-topics, identify patterns, explain when to use what, and note trade-offs. Don't just list facts — explain relationships, implications, and practical decision points. Help the reader understand WHY, not just WHAT.

PROGRESSIVE DEPTH: Reference specific sub-topics by name when discussing their content, so the reader knows where to drill deeper. Use phrases like "For detailed setup steps, see the [Sub-Topic Name] section" or "The [Sub-Topic Name] area covers this in depth."

SUB-TOPIC SYNTHESES:
{child_syntheses}

FORMAT as clean markdown:

Start with a ## TLDR — 3-5 bullets capturing the most important things about this domain area. Be concrete and specific, not abstract.

Then ## Key Themes and ## How Sub-Topics Connect sections. Keep it thematic — don't just concatenate the sub-topic summaries. Synthesize across them.

Source counts: {source_count} sources, {insight_count} insights across {child_count} sub-topics."""


CATEGORY_SYNTHESIS_PROMPT = """You are a senior analyst. Your job is to create an EXECUTIVE BRIEFING for the knowledge category: "{domain_name}".

You are given overview syntheses from domains within this category. Write a high-level briefing that:
1. Summarizes the major domains and what each covers
2. Identifies the most important things to know across the whole category
3. Notes which domains are most developed (deep coverage) vs. thin
4. Is readable in under 1 minute

COGNITIVE LEVEL: Write at the EVALUATION and SYNTHESIS level — assess the overall landscape, identify strategic decisions, evaluate which approaches have the most evidence behind them, and highlight where the field is heading. Think like a senior advisor giving a briefing, not a researcher listing findings.

PROGRESSIVE DEPTH: Reference specific domains by name when discussing their content. Use phrases like "The [Domain Name] area covers this in depth" or "See [Domain Name] for a detailed comparison." The reader should know exactly where to go for more detail.

DOMAIN SYNTHESES:
{child_syntheses}

FORMAT as clean markdown:

## TLDR — 2-3 bullets, the absolute most important things about this category.

## Domains at a Glance — brief description of each domain area and its coverage depth.

Keep this SHORT and strategic. This is a bird's-eye view, not a detailed reference."""


def _cascade_synthesis(domain_id: int, db_path, user_id=None):
    """After synthesizing a sub-topic, cascade upward: re-synthesize parent domain, then grandparent category."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    domain = conn.execute("SELECT parent_id, level FROM domains WHERE id = ?", (domain_id,)).fetchone()
    conn.close()

    if not domain or not domain['parent_id']:
        return

    parent_id = domain['parent_id']
    _synthesize_parent(parent_id, db_path)

    # Check if grandparent exists
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    parent = conn.execute("SELECT parent_id FROM domains WHERE id = ?", (parent_id,)).fetchone()
    conn.close()

    if parent and parent['parent_id']:
        _synthesize_parent(parent['parent_id'], db_path)


def _synthesize_parent(parent_id: int, db_path):
    """Synthesize a parent domain (level 0 or 1) from its children's syntheses."""
    api_key = config.get_api_key('anthropic')
    if not api_key:
        return

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    parent = conn.execute("SELECT id, name, level, source_count, insight_count FROM domains WHERE id = ?", (parent_id,)).fetchone()
    if not parent:
        conn.close()
        return

    # Get child domain syntheses
    children = conn.execute("""
        SELECT d.name, d.source_count, d.insight_count,
               (SELECT s.content FROM syntheses s WHERE s.domain_id = d.id ORDER BY s.version DESC LIMIT 1) as synthesis
        FROM domains d WHERE d.parent_id = ? AND d.source_count > 0
        ORDER BY d.source_count DESC
    """, (parent_id,)).fetchall()

    current = conn.execute(
        "SELECT version FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1", (parent_id,)
    ).fetchone()
    next_version = (current['version'] + 1) if current else 1
    conn.close()

    if not children:
        return

    child_syntheses_text = "\n\n---\n\n".join(
        f"### {c['name']} ({c['source_count']} sources, {c['insight_count']} insights)\n{c['synthesis'] or 'No synthesis yet.'}"
        for c in children
    )

    # Choose prompt based on level
    level = parent['level']
    if level == 0:
        prompt = CATEGORY_SYNTHESIS_PROMPT.format(
            domain_name=parent['name'],
            child_syntheses=child_syntheses_text,
        )
    else:
        prompt = DOMAIN_SYNTHESIS_PROMPT.format(
            domain_name=parent['name'],
            child_syntheses=child_syntheses_text,
            source_count=parent['source_count'],
            insight_count=parent['insight_count'],
            child_count=len(children),
        )

    client = Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="You synthesize knowledge across sub-domains into clear, structured overviews. Write in clean markdown.",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=4000,
        )
        content = response.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Parent synthesis failed for domain {parent_id}: {e}")
        return

    synthesis_level = 'category' if level == 0 else 'domain'
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, synthesis_level, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (parent_id, content, parent['source_count'], parent['insight_count'], next_version, synthesis_level, now),
    )
    conn.commit()
    conn.close()
    logger.info(f"Cascaded {synthesis_level} synthesis v{next_version} for '{parent['name']}'")


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
        "SELECT id, content, source_count, insight_count, version, convergence_data FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
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


def _analyze_convergence(domain_id: int, db_path) -> str:
    """Analyze cross-source convergence — agreements, disagreements, unique contributions (Tier 3C).

    Returns JSON string with convergence data or empty string if insufficient data.
    """
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Get insights grouped by source
    rows = conn.execute("""
        SELECT i.title, i.content, i.confidence, s.title as source_title, s.channel
        FROM insights i JOIN sources s ON i.source_id = s.id
        WHERE i.domain_id = ? AND s.status = 'processed'
        ORDER BY s.title, i.chunk_index
    """, (domain_id,)).fetchall()
    conn.close()

    if len(rows) < 3:
        return ""  # Need at least a few insights to find convergence

    # Group insights by source
    sources = {}
    for r in rows:
        key = r['source_title'] or r['channel'] or 'Unknown'
        if key not in sources:
            sources[key] = []
        sources[key].append(f"- {r['title']}: {r['content'][:200]}")

    if len(sources) < 2:
        return ""  # Need multiple sources for convergence

    grouped_text = "\n\n".join(
        f"### {source} ({len(insights)} insights)\n" + "\n".join(insights[:8])
        for source, insights in sources.items()
    )

    api_key = config.get_api_key('anthropic')
    if not api_key:
        return ""

    client = Anthropic(api_key=api_key)
    try:
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="You analyze cross-source agreement patterns. Return ONLY valid JSON.",
            messages=[{"role": "user", "content": f"""Analyze these insights from {len(sources)} sources about the same domain.

{grouped_text}

Identify:
1. Points of AGREEMENT (claimed or demonstrated by 2+ sources independently)
2. Points of DISAGREEMENT (sources contradict each other)
3. UNIQUE contributions (notable claims from only one source)

Return ONLY valid JSON:
{{"agreements": [{{"claim": "...", "sources": ["source1", "source2"]}}], "disagreements": [{{"topic": "...", "views": [{{"source": "...", "position": "..."}}]}}], "unique": [{{"claim": "...", "source": "..."}}]}}

Keep each array to max 5 entries. Be specific about what the agreement/disagreement is."""}],
            temperature=0.2,
            max_tokens=2000,
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Convergence analysis failed for domain {domain_id}: {e}")
        return ""


def _generate_ingestion_impact(client, domain_name: str, prev_synthesis: str, new_synthesis: str, source_title: str) -> str:
    """Generate a brief summary of what a source added to the knowledge base (Tier 4B)."""
    try:
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="You summarize knowledge changes concisely. Return 2-3 plain sentences only.",
            messages=[{"role": "user", "content": f"""The knowledge base for "{domain_name}" was updated after ingesting "{source_title}".

PREVIOUS SYNTHESIS (excerpt):
{prev_synthesis[:1500]}

UPDATED SYNTHESIS (excerpt):
{new_synthesis[:1500]}

In 2-3 sentences, describe what new information this source added. Focus on: new claims or concepts introduced, existing points that were reinforced with new evidence, and any perspectives that changed. Be specific about WHAT was added, not just "new information was added"."""}],
            temperature=0.3,
            max_tokens=300,
        )
        return response.content[0].text.strip()
    except Exception as e:
        logger.warning(f"Ingestion impact generation failed: {e}")
        return ""


def _snapshot_synthesis(current: dict, domain_id: int, db_path):
    """Archive the current synthesis version before creating a new one (Tier 4A)."""
    if not current or not current.get('content'):
        return
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn = sqlite3.connect(str(db_path))
        conn.execute("""
            INSERT INTO synthesis_versions
            (synthesis_id, domain_id, version_number, content, convergence_data, source_count, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            current.get('id', 0), domain_id, current.get('version', 0),
            current['content'], current.get('convergence_data', ''),
            current.get('source_count', 0), now,
        ))
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Synthesis snapshot failed for domain {domain_id}: {e}")


def synthesize_domain(domain_id: int, source_id: int, source_title: str, channel: str, db_path=None, source_date: str = None) -> str:
    """Create or update the domain synthesis after a new source is processed."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('anthropic')
    if not api_key:
        raise ValueError("Anthropic API key not configured")

    current = get_current_synthesis(domain_id, db_path)

    # Snapshot current version before overwriting (Tier 4A)
    _snapshot_synthesis(current, domain_id, db_path)

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

    client = Anthropic(api_key=api_key)

    response = client.messages.create(
        model=config.ANTHROPIC_HAIKU_MODEL,
        system="You synthesize knowledge into detailed, practical reference documents. Preserve specific steps, commands, tool names, configurations, and actionable detail. Write in clean markdown. This is a how-to reference, not an executive summary.",
        messages=[
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

    synthesis_content = response.content[0].text.strip()

    # Run follow-up LLM calls in parallel (all independent of each other)
    suggested = ""
    convergence = ""
    prev_content = current['content'] if current else ""

    def _do_suggested():
        return _generate_suggested_questions(client, domain_name, synthesis_content)

    def _do_convergence():
        return _analyze_convergence(domain_id, db_path)

    def _do_cross_refs():
        detect_cross_references(domain_id, synthesis_content, db_path)

    def _do_cascade():
        _cascade_synthesis(domain_id, db_path)

    def _do_impact():
        if prev_content and source_id:
            impact = _generate_ingestion_impact(
                client, domain_name, prev_content, synthesis_content, source_title
            )
            if impact:
                c = sqlite3.connect(str(db_path))
                c.execute("UPDATE sources SET ingestion_impact = ? WHERE id = ?", (impact, source_id))
                c.commit()
                c.close()

    with ThreadPoolExecutor(max_workers=5) as executor:
        f_suggested = executor.submit(_do_suggested)
        f_convergence = executor.submit(_do_convergence)
        f_cross = executor.submit(_do_cross_refs)
        f_cascade = executor.submit(_do_cascade)
        f_impact = executor.submit(_do_impact)

        try:
            suggested = f_suggested.result() or ""
        except Exception as e:
            logger.warning(f"Suggested questions skipped: {e}")
        try:
            convergence = f_convergence.result() or ""
        except Exception as e:
            logger.warning(f"Convergence analysis skipped: {e}")
        # Fire-and-forget: just log errors
        try:
            f_cross.result()
        except Exception as e:
            logger.warning(f"Cross-reference detection skipped: {e}")
        try:
            f_cascade.result()
        except Exception as e:
            logger.warning(f"Cascade synthesis skipped: {e}")
        try:
            f_impact.result()
        except Exception as e:
            logger.warning(f"Ingestion impact skipped: {e}")

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, suggested_questions, synthesis_level, convergence_data, created_at) VALUES (?, ?, ?, ?, ?, ?, 'sub_topic', ?, ?)",
        (domain_id, synthesis_content, source_count, insight_count, next_version, suggested, convergence, now),
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
    api_key = config.get_api_key('anthropic')
    if not api_key:
        raise ValueError("Anthropic API key not configured")

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

    client = Anthropic(api_key=api_key)

    response = client.messages.create(
        model=config.ANTHROPIC_HAIKU_MODEL,
        system="You synthesize knowledge into detailed, practical reference documents. Preserve specific steps, commands, tool names, configurations, and actionable detail. Write in clean markdown.",
        messages=[
            {"role": "user", "content": FULL_RESYNTHESIS_PROMPT.format(
                domain_name=domain_name,
                all_insights=all_insights_text,
            )},
        ],
        temperature=0.3,
        max_tokens=8000,
    )

    synthesis_content = response.content[0].text.strip()

    suggested = _generate_suggested_questions(client, domain_name, synthesis_content)

    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        "INSERT INTO syntheses (domain_id, content, source_count, insight_count, version, suggested_questions, synthesis_level, created_at) VALUES (?, ?, ?, ?, ?, ?, 'sub_topic', ?)",
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

    # Detect cross-domain references
    try:
        detect_cross_references(domain_id, synthesis_content, db_path)
    except Exception as e:
        logger.warning(f"Cross-reference detection skipped: {e}")

    return synthesis_content


CROSS_REFERENCE_PROMPT = """Given this knowledge brief about "{domain_name}":

{synthesis_excerpt}

Which of these other knowledge domains in the user's knowledge base are meaningfully connected to "{domain_name}"?

OTHER DOMAINS:
{other_domains}

Return a JSON array of connections. Only include STRONG, meaningful relationships — tools used together, prerequisite knowledge, direct alternatives, shared workflows. NOT vague "both relate to technology" associations.

Examples of GOOD connections:
- {{"domain": "Claude Code", "relationship": "uses"}} — if the synthesis mentions using Claude Code
- {{"domain": "Python", "relationship": "builds on"}} — if the domain requires Python knowledge
- {{"domain": "ChatGPT", "relationship": "alternative to"}} — if they solve the same problem

If none are strongly related, return [].

Return ONLY the JSON array:"""


def detect_cross_references(domain_id: int, synthesis_content: str, db_path=None):
    """Detect cross-domain references from synthesis content and store them."""
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('anthropic')
    if not api_key:
        return

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    # Get this domain's name and user_id
    domain_row = conn.execute("SELECT name, user_id FROM domains WHERE id = ?", (domain_id,)).fetchone()
    if not domain_row:
        conn.close()
        return
    domain_name = domain_row['name']
    user_id = domain_row['user_id']

    # Get all OTHER level-1 domains for this user (exclude self and level-0 categories)
    other_domains = conn.execute("""
        SELECT id, name FROM domains
        WHERE user_id = ? AND id != ? AND level = 1 AND source_count > 0
        ORDER BY name
    """, (user_id, domain_id)).fetchall()

    if len(other_domains) < 1:
        conn.close()
        return

    other_names = "\n".join(f"- {d['name']}" for d in other_domains)
    name_to_id = {d['name'].lower(): d['id'] for d in other_domains}

    # Use first ~1500 words of synthesis for context
    excerpt = " ".join(synthesis_content.split()[:1500])

    try:
        client = Anthropic(api_key=api_key)
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="You identify meaningful connections between knowledge domains. Return only valid JSON arrays.",
            messages=[
                {"role": "user", "content": CROSS_REFERENCE_PROMPT.format(
                    domain_name=domain_name,
                    synthesis_excerpt=excerpt,
                    other_domains=other_names,
                )},
            ],
            temperature=0.2,
            max_tokens=500,
        )

        content = response.content[0].text.strip()
        # Strip markdown code fences if present
        if content.startswith("```"):
            content = content.split("\n", 1)[1] if "\n" in content else content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()

        refs = json.loads(content)
        if not isinstance(refs, list):
            conn.close()
            return

        # Clear existing references from this domain (will be rebuilt)
        conn.execute("DELETE FROM domain_references WHERE source_domain_id = ?", (domain_id,))

        for ref in refs:
            target_name = ref.get("domain", "").lower()
            relationship = ref.get("relationship", "related to")
            target_id = name_to_id.get(target_name)
            if target_id:
                try:
                    conn.execute(
                        "INSERT OR REPLACE INTO domain_references (source_domain_id, target_domain_id, relationship) VALUES (?, ?, ?)",
                        (domain_id, target_id, relationship),
                    )
                except sqlite3.IntegrityError:
                    pass

        conn.commit()
        logger.info(f"Detected {len(refs)} cross-references for '{domain_name}'")

    except Exception as e:
        logger.warning(f"Cross-reference detection failed for domain {domain_id}: {e}")
    finally:
        conn.close()


def _generate_suggested_questions(client: Anthropic, domain_name: str, synthesis: str) -> str:
    """Generate 3 suggested starter questions based on the synthesis content."""
    try:
        # Use first ~1000 words of synthesis for context
        excerpt = " ".join(synthesis.split()[:1000])
        response = client.messages.create(
            model=config.ANTHROPIC_HAIKU_MODEL,
            system="Generate exactly 3 questions a learner would ask about this knowledge base. Return a JSON array of 3 strings. Questions should be specific and actionable, not generic.",
            messages=[
                {"role": "user", "content": f"Domain: {domain_name}\n\nKnowledge:\n{excerpt}\n\nReturn ONLY a JSON array of 3 question strings:"},
            ],
            temperature=0.5,
            max_tokens=300,
        )
        content = response.content[0].text.strip()
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
