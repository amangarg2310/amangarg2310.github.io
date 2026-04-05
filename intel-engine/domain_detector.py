"""
Domain detection — auto-classifies content into a hierarchical taxonomy.

Creates specific domains (e.g., "OpenClaw" not "AI Automation Tools") with:
- Parent category (broader grouping, level 0)
- Main domain (specific topic, level 1) — sources attach here
- Sub-topics (detected from content, level 2) — navigational grouping
"""

import json
import logging
import re
import sqlite3
from datetime import datetime, timezone

from openai import OpenAI

import config

logger = logging.getLogger(__name__)

DOMAIN_ICONS = {
    "product marketing": "📦", "growth": "📈", "sales": "💰",
    "engineering": "⚙️", "design": "🎨", "data science": "📊",
    "ai tools": "🤖", "ai agents": "🤖", "leadership": "👑", "startups": "🚀",
    "finance": "💵", "content creation": "🎬", "social media": "📱",
    "seo": "🔍", "copywriting": "✍️", "psychology": "🧠",
    "productivity": "⏱️", "health & fitness": "💪", "cooking": "🍳",
    "music": "🎵", "programming": "💻", "education": "📖",
    "science": "🔬", "business strategy": "♟️", "entrepreneurship": "🏗️",
    "investing": "📉", "real estate": "🏠", "career development": "🎯",
    "communication": "🗣️", "negotiation": "🤝", "customer success": "🌟",
    "devops": "🔧", "cybersecurity": "🔒", "blockchain": "⛓️",
    "gaming": "🎮", "photography": "📷", "writing": "📝",
    "mathematics": "🔢", "philosophy": "💭", "history": "🏛️",
    "marketing": "📣", "branding": "🏷️", "analytics": "📈",
    "ux design": "✨", "web development": "🌐", "mobile development": "📱",
}

DETECTION_PROMPT = """You are a domain taxonomy classifier. Given content metadata and an excerpt, classify it into a SPECIFIC, HIERARCHICAL domain structure.

{existing_domains_section}

CLASSIFICATION PRIORITY:
1. **PRIMARY SIGNAL — TITLE**: The content TITLE tells you WHAT this is about. Use it as the main classification signal.
2. **SECONDARY — EXCERPT**: The excerpt provides supporting context to confirm the domain and detect sub-topics.
3. **MATCH FIRST**: Before creating anything new, check if this content belongs to an EXISTING domain:
   - Same tool/product/concept? → Use the existing domain name EXACTLY.
   - Same broader category? → Create a SIBLING domain under the SAME existing parent.
   - Truly new topic with no related parent? → Only then create a new parent + domain.

SIBLING RULE:
If the content is about a DIFFERENT tool/product within an existing parent category, create it as a SIBLING under that SAME parent. NEVER create a near-duplicate parent.
  - Existing: "AI Tools" → "OpenClaw"
  - New video about Claude Code → "AI Tools" → "Claude Code" (sibling under SAME parent)
  - WRONG: Creating "AI Automation" or "AI Development" alongside existing "AI Tools"

DOMAIN NAMING:
- Be SPECIFIC: Use the actual tool, product, framework, or concept name — NOT a generic category.
  - Good: "OpenClaw" / Bad: "AI Automation Tools"
  - Good: "React Router" / Bad: "Web Development"
  - Good: "Product-Led Growth" / Bad: "Growth"
- Domain names should be professional and recognizable (proper noun if it's a named tool/product).

SUB-TOPIC RULES:
- Sub-topics should be BROAD workflow categories, not specific steps.
- Good: "Setup & Installation", "Daily Workflows", "Troubleshooting"
- Bad: "Installing Docker Container", "Configuring Port 3000", "Fixing SSL Errors"
- Aim for 3-5 sub-topics that could each contain MULTIPLE sources.
- Think of sub-topics as CHAPTERS in a book, not individual pages.

CONTENT TITLE: {title}
CONTENT SOURCE: {channel}
EXCERPT: {excerpt}

Return ONLY a JSON object:
{{"domain": "Specific Name", "parent": "Broader Category", "sub_topics": ["Sub-topic 1", "Sub-topic 2"], "description": "One sentence describing this specific domain", "is_new": true/false}}"""


def get_existing_domains(db_path=None, user_id=None) -> list[dict]:
    """Get all existing domains with hierarchy info."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        if user_id:
            rows = conn.execute(
                "SELECT name, description, source_count, level, path, parent_id FROM domains WHERE (user_id = ? OR user_id IS NULL) ORDER BY level ASC, source_count DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT name, description, source_count, level, path, parent_id FROM domains ORDER BY level ASC, source_count DESC"
            ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []


def detect_domain_hierarchical(title: str, channel: str, transcript_excerpt: str, db_path=None, user_id=None) -> dict:
    """Detect or create a hierarchical domain structure for the content."""
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    existing = get_existing_domains(db_path, user_id)

    if existing:
        # Show hierarchy to GPT grouped by parent
        parents = {}
        orphans = []
        for d in existing:
            level = d.get('level') or 0
            if level == 0:
                parents[d['name']] = {'desc': d.get('description', ''), 'count': d.get('source_count', 0), 'children': []}
            elif level == 1:
                # Find parent name from path
                path = d.get('path', '')
                parent_name = path.split('/')[1] if path and len(path.split('/')) > 1 else None
                if parent_name and parent_name in parents:
                    parents[parent_name]['children'].append(d)
                else:
                    orphans.append(d)
            # Skip level 2 (sub-topics) — GPT doesn't need them for classification
        lines = []
        for pname, pdata in parents.items():
            lines.append(f"Parent: {pname}")
            for child in pdata['children']:
                count = child.get('source_count', 0)
                lines.append(f"  └─ {child['name']} ({count} sources): {child.get('description', '')}")
        for d in orphans:
            lines.append(f"  - {d['name']} ({d.get('source_count', 0)} sources)")
        existing_section = "EXISTING DOMAIN HIERARCHY (reuse these parents when possible!):\n" + "\n".join(lines) + "\n"
    else:
        existing_section = "No existing domains yet — create a new hierarchy.\n"

    words = transcript_excerpt.split()[:300]  # Reduced from 500 — title is primary signal
    excerpt = " ".join(words)

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You classify content into specific, hierarchical knowledge domains. Return only valid JSON."},
            {"role": "user", "content": DETECTION_PROMPT.format(
                existing_domains_section=existing_section,
                title=title, channel=channel, excerpt=excerpt,
            )},
        ],
        temperature=0.2,
        max_tokens=300,
    )

    content = response.choices[0].message.content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1] if "\n" in content else content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

    # Parse with fallback
    result = None
    try:
        result = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group())
            except (json.JSONDecodeError, TypeError):
                pass

    if not result or not isinstance(result, dict) or 'domain' not in result:
        logger.warning(f"Domain detection parse failed, using fallback. Response: {content[:200]}")
        result = {
            'domain': title[:50] if title else 'General Knowledge',
            'parent': 'General',
            'sub_topics': [],
            'description': 'Auto-detected domain',
            'is_new': True,
        }

    # Ensure hierarchy exists
    domain_id = ensure_domain_hierarchy(
        name=result['domain'],
        parent_name=result.get('parent', 'General'),
        sub_topics=result.get('sub_topics', []),
        description=result.get('description', ''),
        db_path=db_path,
        user_id=user_id,
    )

    return {
        'domain_name': result['domain'],
        'description': result.get('description', ''),
        'is_new': result.get('is_new', True),
        'domain_id': domain_id,
        'parent_name': result.get('parent', 'General'),
        'sub_topics': result.get('sub_topics', []),
    }


_PARENT_STOP_WORDS = {'tools', 'development', 'management', 'engineering', 'automation', 'technology', 'platform', 'software', 'systems'}


def _normalize_parent(name: str) -> str:
    """Strip common suffixes for fuzzy parent comparison."""
    words = name.lower().split()
    core = [w for w in words if w not in _PARENT_STOP_WORDS]
    return ' '.join(core) if core else name.lower()


def _find_matching_parent(conn, parent_name: str, user_id=None) -> tuple[int, str] | None:
    """Find an existing parent category that matches semantically. Returns (id, name) or None."""
    # 1. Exact case-insensitive match
    if user_id:
        row = conn.execute(
            "SELECT id, name FROM domains WHERE name = ? COLLATE NOCASE AND level = 0 AND (user_id = ? OR user_id IS NULL)",
            (parent_name, user_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT id, name FROM domains WHERE name = ? COLLATE NOCASE AND level = 0",
            (parent_name,),
        ).fetchone()
    if row:
        return (row[0], row[1])

    # 2. Normalized stem match (e.g., "AI Automation" matches "AI Tools" → both normalize to "ai")
    normalized = _normalize_parent(parent_name)
    if user_id:
        parents = conn.execute(
            "SELECT id, name FROM domains WHERE level = 0 AND (user_id = ? OR user_id IS NULL)", (user_id,)
        ).fetchall()
    else:
        parents = conn.execute("SELECT id, name FROM domains WHERE level = 0").fetchall()

    for p in parents:
        if _normalize_parent(p[1]) == normalized:
            logger.info(f"Auto-merged parent '{parent_name}' → existing '{p[1]}'")
            return (p[0], p[1])

    return None


def ensure_domain_hierarchy(name: str, parent_name: str, sub_topics: list, description: str = "",
                            db_path=None, user_id=None) -> int:
    """Create the full domain hierarchy (parent → domain → sub-topics) and return the domain_id."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    now = datetime.now(timezone.utc).isoformat()

    # 1. Find existing parent via fuzzy match, or create new one
    matched = _find_matching_parent(conn, parent_name, user_id)
    if matched:
        parent_id, parent_name = matched  # Use the existing parent's actual name
    else:
        parent_id = _find_or_create_domain(
            conn, parent_name, level=0, parent_id=None,
            path=f"/{parent_name}",
            description=f"Category: {parent_name}",
            user_id=user_id, now=now,
        )

    # 2. Find or create main domain (level 1)
    domain_id = _find_or_create_domain(
        conn, name, level=1, parent_id=parent_id,
        path=f"/{parent_name}/{name}",
        description=description,
        user_id=user_id, now=now,
    )

    # 3. Find or create sub-topics (level 2) — with hard cap
    existing_subs = conn.execute(
        "SELECT name FROM domains WHERE parent_id = ? AND level = 2", (domain_id,)
    ).fetchall()
    existing_sub_count = len(existing_subs)

    for sub in (sub_topics or [])[:5]:  # Cap at 5 per ingestion
        sub = sub.strip()
        if not sub:
            continue
        if existing_sub_count >= 7:  # Hard cap at 7 sub-topics per domain
            logger.info(f"Sub-topic cap reached for domain {name}, skipping '{sub}'")
            break
        _find_or_create_domain(
            conn, sub, level=2, parent_id=domain_id,
            path=f"/{parent_name}/{name}/{sub}",
            description=f"{name} — {sub}",
            user_id=user_id, now=now,
        )
        # Only increment if we actually created a new one (not found existing)
        existing_sub_names = {r[0].lower() for r in existing_subs}
        if sub.lower() not in existing_sub_names:
            existing_sub_count += 1

    conn.commit()
    conn.close()
    return domain_id


def _find_or_create_domain(conn, name: str, level: int, parent_id: int | None,
                           path: str, description: str, user_id: int | None, now: str) -> int:
    """Find existing domain by name+level+user or create a new one."""
    if user_id:
        row = conn.execute(
            "SELECT id FROM domains WHERE name = ? COLLATE NOCASE AND level = ? AND (user_id = ? OR user_id IS NULL)",
            (name, level, user_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT id FROM domains WHERE name = ? COLLATE NOCASE AND level = ?",
            (name, level),
        ).fetchone()

    if row:
        return row[0]

    icon = DOMAIN_ICONS.get(name.lower(), "📚")
    cursor = conn.execute(
        "INSERT INTO domains (name, description, icon, parent_id, level, path, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (name, description, icon, parent_id, level, path, user_id, now, now),
    )
    logger.info(f"Created domain: {path} (level={level})")
    return cursor.lastrowid
