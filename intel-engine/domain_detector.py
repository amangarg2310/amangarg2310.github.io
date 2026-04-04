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

RULES:
1. **Be SPECIFIC**: Use the actual tool, product, framework, or concept name — NOT a generic category.
   - Good: "OpenClaw" / Bad: "AI Automation Tools"
   - Good: "React Router" / Bad: "Web Development"
   - Good: "Product-Led Growth" / Bad: "Growth"
2. **Suggest a parent category** (2-3 words) that groups related domains together.
3. **Detect sub-topics** present in this specific content (2-5 sub-topics).
4. If the content clearly fits an EXISTING domain (exact match), return that domain name.
5. If it's a new specific topic, create a new domain — don't force it into a generic existing one.
6. Domain names should be professional and recognizable (proper noun if it's a named tool/product).

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
        # Show hierarchy to GPT
        lines = []
        for d in existing:
            indent = "  " * (d.get('level') or 0)
            count = d.get('source_count') or 0
            desc = d.get('description') or ''
            lines.append(f"{indent}- {d['name']} ({count} sources): {desc}")
        existing_section = f"EXISTING DOMAIN HIERARCHY:\n" + "\n".join(lines) + "\n"
    else:
        existing_section = "No existing domains yet — create a new hierarchy.\n"

    words = transcript_excerpt.split()[:500]
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


def ensure_domain_hierarchy(name: str, parent_name: str, sub_topics: list, description: str = "",
                            db_path=None, user_id=None) -> int:
    """Create the full domain hierarchy (parent → domain → sub-topics) and return the domain_id."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    now = datetime.now(timezone.utc).isoformat()

    # 1. Find or create parent (level 0)
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

    # 3. Find or create sub-topics (level 2)
    for sub in (sub_topics or [])[:5]:  # Cap at 5
        sub = sub.strip()
        if sub:
            _find_or_create_domain(
                conn, sub, level=2, parent_id=domain_id,
                path=f"/{parent_name}/{name}/{sub}",
                description=f"{name} — {sub}",
                user_id=user_id, now=now,
            )

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
