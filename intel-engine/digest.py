"""
Knowledge Digest Generator — creates email-ready summaries of recent learning.

Generates HTML digest content from recent sources, grouped by domain.
Does NOT send emails — that requires an email service (Resend/SendGrid).
Use generate_digest() for preview and generate_digest_html() for email-ready output.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone, timedelta

import config

logger = logging.getLogger(__name__)


def _get_conn(db_path=None):
    """Get a DB connection with WAL mode."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def generate_digest(user_id: int, since_date: str = None, db_path=None) -> dict:
    """Generate a knowledge digest for a user.

    Args:
        user_id: The user ID
        since_date: ISO date string — only include sources after this date.
                    Defaults to 7 days ago.

    Returns:
        Dict with: subject, domain_updates (list), stats, html_content
    """
    if not since_date:
        since_date = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    conn = _get_conn(db_path)

    # Get new sources since the date, grouped by domain
    sources = conn.execute("""
        SELECT s.id, s.title, s.channel, s.source_type, s.ingestion_impact,
               s.created_at, d.id as domain_id, d.name as domain_name, d.icon as domain_icon
        FROM sources s
        JOIN domains d ON s.domain_id = d.id
        WHERE (s.user_id = ? OR s.user_id IS NULL)
          AND s.status IN ('processed', 'processed_empty')
          AND s.created_at >= ?
        ORDER BY d.name, s.created_at DESC
    """, (user_id, since_date)).fetchall()

    if not sources:
        conn.close()
        return {
            "subject": "No new knowledge this week",
            "domain_updates": [],
            "stats": {"new_sources": 0, "new_insights": 0, "domains_updated": 0},
            "html_content": "",
            "has_content": False,
        }

    # Group by domain
    domain_groups = {}
    for s in sources:
        did = s["domain_id"]
        if did not in domain_groups:
            domain_groups[did] = {
                "domain_id": did,
                "domain_name": s["domain_name"],
                "domain_icon": s["domain_icon"] or "\U0001f4a1",
                "sources": [],
            }
        domain_groups[did]["sources"].append(dict(s))

    # For each domain, get top insights and convergence
    domain_updates = []
    total_insights = 0

    for did, group in domain_groups.items():
        # Get new insights for these sources
        source_ids = [s["id"] for s in group["sources"]]
        placeholders = ",".join("?" * len(source_ids))
        insights = conn.execute(f"""
            SELECT title, content, actionability, insight_type
            FROM insights
            WHERE source_id IN ({placeholders})
            ORDER BY
                CASE actionability WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC
            LIMIT 3
        """, source_ids).fetchall()

        total_insights += len(insights)

        # Get suggested question
        synth = conn.execute("""
            SELECT suggested_questions FROM syntheses
            WHERE domain_id = ? ORDER BY version DESC LIMIT 1
        """, (did,)).fetchone()
        suggested_q = ""
        if synth and synth["suggested_questions"]:
            try:
                qs = json.loads(synth["suggested_questions"])
                if qs:
                    suggested_q = qs[0] if isinstance(qs, list) else str(qs)
            except (json.JSONDecodeError, TypeError):
                pass

        domain_updates.append({
            "domain_name": group["domain_name"],
            "domain_icon": group["domain_icon"],
            "domain_id": did,
            "sources": [
                {
                    "title": s["title"] or "Untitled",
                    "channel": s["channel"] or "",
                    "source_type": s["source_type"] or "article",
                    "impact": s["ingestion_impact"] or "",
                }
                for s in group["sources"][:5]  # Cap at 5 per domain
            ],
            "top_insights": [
                {"title": i["title"], "content": i["content"][:150], "type": i["insight_type"]}
                for i in insights
            ],
            "suggested_question": suggested_q,
        })

    conn.close()

    # Sort domains by source count (most active first), cap at 5
    domain_updates.sort(key=lambda d: len(d["sources"]), reverse=True)
    domain_updates = domain_updates[:5]

    stats = {
        "new_sources": len(sources),
        "new_insights": total_insights,
        "domains_updated": len(domain_updates),
    }

    # Generate date range string
    since_dt = datetime.fromisoformat(since_date.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    date_range = f"{since_dt.strftime('%b %d')} \u2013 {now.strftime('%b %d, %Y')}"

    subject = f"Your Knowledge Brief \u2014 {stats['new_sources']} new source{'s' if stats['new_sources'] != 1 else ''} across {stats['domains_updated']} domain{'s' if stats['domains_updated'] != 1 else ''}"

    html_content = _render_digest_html(domain_updates, stats, date_range)

    return {
        "subject": subject,
        "domain_updates": domain_updates,
        "stats": stats,
        "html_content": html_content,
        "has_content": True,
        "date_range": date_range,
    }


def _render_digest_html(domain_updates: list, stats: dict, date_range: str) -> str:
    """Render the digest as clean HTML suitable for email or web preview."""

    domain_sections = ""
    for d in domain_updates:
        sources_html = ""
        for s in d["sources"]:
            impact = f"<br><span style=\"color:#6b7280;font-size:12px;line-height:1.4;\">{s['impact'][:120]}</span>" if s["impact"] else ""
            channel = f" <span style=\"color:#9ca3af;\">\u00b7 {s['channel']}</span>" if s["channel"] else ""
            sources_html += f"""<div style="padding:6px 0;border-bottom:1px solid #f0ece4;">
                <span style="font-size:13px;font-weight:500;color:#1a1916;">{s['title'][:60]}</span>{channel}{impact}
            </div>"""

        insights_html = ""
        for ins in d["top_insights"]:
            insights_html += f"""<div style="padding:4px 0;">
                <span style="font-size:12px;color:#4f6ef7;font-weight:500;">[{ins['type']}]</span>
                <span style="font-size:12.5px;color:#1a1916;"> {ins['title']}</span>
            </div>"""

        question_html = ""
        if d["suggested_question"]:
            question_html = f"""<div style="margin-top:10px;padding:8px 12px;background:#f5f3fb;border-radius:8px;font-size:12.5px;color:#4f6ef7;">
                \U0001f4a1 {d['suggested_question']}
            </div>"""

        domain_sections += f"""
        <div style="margin-bottom:24px;padding:16px 20px;background:#ffffff;border:1px solid #e4e0da;border-left:3px solid #c4a46c;border-radius:8px;">
            <div style="font-size:16px;font-weight:600;color:#1a1916;margin-bottom:8px;">
                {d['domain_icon']} {d['domain_name']}
                <span style="font-size:11px;font-weight:400;color:#a8a49f;margin-left:8px;">{len(d['sources'])} new</span>
            </div>
            {sources_html}
            {insights_html}
            {question_html}
        </div>"""

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#fafaf8;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#a8a49f;margin-bottom:6px;">Your Knowledge Brief</div>
        <div style="font-size:22px;font-weight:700;color:#1a1916;">What you learned</div>
        <div style="font-size:13px;color:#5c5a56;margin-top:4px;">{date_range} \u00b7 {stats['new_sources']} source{'s' if stats['new_sources'] != 1 else ''} \u00b7 {stats['new_insights']} insight{'s' if stats['new_insights'] != 1 else ''}</div>
    </div>

    <!-- Domain Updates -->
    {domain_sections}

    <!-- Footer -->
    <div style="text-align:center;margin-top:32px;padding-top:20px;border-top:1px solid #e4e0da;">
        <div style="font-size:12px;color:#a8a49f;">
            <a href="https://distylme.com/knowledge" style="color:#4f6ef7;text-decoration:none;">View full knowledge base</a>
            \u00b7
            <a href="https://distylme.com" style="color:#4f6ef7;text-decoration:none;">Add more sources</a>
        </div>
        <div style="font-size:11px;color:#c8c4be;margin-top:8px;">distylme \u2014 Your knowledge, distilled.</div>
    </div>

</div>
</body>
</html>"""
