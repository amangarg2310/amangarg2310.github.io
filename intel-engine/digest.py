"""
Knowledge Digest Generator — creates a weekly knowledge brief from synthesized learning.

Pulls the richest data available: synthesis TLDRs, convergence agreements,
ingestion impacts, and high-actionability insights.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone, timedelta

import config

logger = logging.getLogger(__name__)


def _get_conn(db_path=None):
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _extract_tldr(synthesis_content):
    """Extract the TLDR/first paragraph from synthesis markdown as complete sentences."""
    if not synthesis_content:
        return ""
    lines = synthesis_content.strip().split("\n")
    tldr_lines = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if tldr_lines:
                break
            continue
        if stripped.startswith("#"):
            continue
        if stripped in ("---", "***", "___"):
            continue
        if stripped.startswith("- ") or stripped.startswith("* "):
            if not tldr_lines:
                continue
            break
        tldr_lines.append(stripped)
    full = " ".join(tldr_lines)
    if len(full) <= 300:
        return full
    # Truncate at last sentence boundary before 300 chars
    truncated = full[:300]
    last_period = truncated.rfind(".")
    last_dash = truncated.rfind("\u2014")
    cut = max(last_period, last_dash)
    if cut > 100:
        return truncated[:cut + 1]
    return truncated.rsplit(" ", 1)[0] + "..."


def _extract_convergence(convergence_json):
    """Extract top agreements from convergence data."""
    if not convergence_json:
        return []
    try:
        data = json.loads(convergence_json)
        agreements = data.get("agreements", [])
        return [
            {
                "claim": a.get("claim", ""),
                "sources": a.get("sources", []),
                "count": len(a.get("sources", [])),
            }
            for a in agreements[:3]
            if a.get("claim")
        ]
    except (json.JSONDecodeError, TypeError):
        return []


def generate_digest(user_id, since_date=None, db_path=None):
    """Generate a knowledge brief for a user.

    Returns structured digest with TLDRs, convergence, impacts, and action items.
    """
    if not since_date:
        since_date = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    conn = _get_conn(db_path)

    # Get new sources since the date
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
            "has_content": False,
        }

    # Group sources by domain
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

    # Build rich domain updates
    domain_updates = []
    total_insights = 0

    for did, group in domain_groups.items():
        source_ids = [s["id"] for s in group["sources"]]
        placeholders = ",".join("?" * len(source_ids))

        # Count total insights
        insight_count = conn.execute(
            "SELECT COUNT(*) FROM insights WHERE source_id IN (%s)" % placeholders,
            source_ids,
        ).fetchone()[0]
        total_insights += insight_count

        # Get synthesis TLDR + convergence
        synth = conn.execute(
            "SELECT content, convergence_data, suggested_questions FROM syntheses WHERE domain_id = ? ORDER BY version DESC LIMIT 1",
            (did,),
        ).fetchone()

        tldr = _extract_tldr(synth["content"]) if synth and synth["content"] else ""
        validated = _extract_convergence(synth["convergence_data"]) if synth else []

        suggested_q = ""
        if synth and synth["suggested_questions"]:
            try:
                qs = json.loads(synth["suggested_questions"])
                suggested_q = qs[0] if isinstance(qs, list) and qs else ""
            except (json.JSONDecodeError, TypeError):
                pass

        # Get the latest ingestion impact (what the most recent source added)
        latest_impact = ""
        for s in group["sources"]:
            if s.get("ingestion_impact"):
                latest_impact = s["ingestion_impact"][:200]
                break

        # Get top high-actionability insight
        action_item = conn.execute(
            "SELECT title FROM insights WHERE source_id IN (%s) AND actionability = 'high' ORDER BY ROWID DESC LIMIT 1" % placeholders,
            source_ids,
        ).fetchone()
        action_text = action_item["title"] if action_item else ""

        # Simplified source list (just title + channel)
        source_names = []
        for s in group["sources"][:4]:
            name = s["title"] or "Untitled"
            if s.get("channel"):
                name += " \u00b7 " + s["channel"]
            source_names.append(name)

        domain_updates.append({
            "domain_name": group["domain_name"],
            "domain_icon": group["domain_icon"],
            "domain_id": did,
            "insight_count": insight_count,
            "source_count": len(group["sources"]),
            "tldr": tldr,
            "new_sources": source_names,
            "what_changed": latest_impact,
            "validated": validated,
            "action_item": action_text,
            "explore": suggested_q,
        })

    conn.close()

    # Sort by source count (most active first), cap at 5
    domain_updates.sort(key=lambda d: d["source_count"], reverse=True)
    domain_updates = domain_updates[:5]

    # Stats from shown domains only
    shown_sources = sum(d["source_count"] for d in domain_updates)
    shown_insights = sum(d["insight_count"] for d in domain_updates)

    # Date range
    since_dt = datetime.fromisoformat(since_date.replace("Z", "+00:00"))
    now = datetime.now(timezone.utc)
    date_range = since_dt.strftime("%b %d") + " \u2013 " + now.strftime("%b %d, %Y")

    return {
        "subject": "Your Knowledge Brief",
        "domain_updates": domain_updates,
        "stats": {
            "new_sources": shown_sources,
            "new_insights": shown_insights,
            "domains_updated": len(domain_updates),
        },
        "date_range": date_range,
        "has_content": True,
    }
