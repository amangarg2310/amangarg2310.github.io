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

DETECTION_PROMPT = """You are a domain taxonomy classifier. Classify content into a HIERARCHICAL domain structure.

{existing_domains_section}

RULES (follow in order):

1. **MATCH EXISTING FIRST**: If this content is about a tool/product/concept that ALREADY EXISTS in the hierarchy above, return that EXACT domain name with is_new=false. Do NOT create variants.
   - Existing domain "Claude Code" + new video "Claude Code Marketing Team Demo" → domain = "Claude Code" (REUSE)
   - Existing domain "OpenClaw" + new video "5 OpenClaw Tricks" → domain = "OpenClaw" (REUSE)

2. **CANONICAL NAME**: Extract the core tool/product/concept name — NOT the video title.
   - "Ollama + Claude Code = 99% CHEAPER" → domain = "Claude Code" (or "Ollama" — pick the primary)
   - "Build Your Full AI Marketing Team (Agents + Claude Skills)" → domain = "Claude Code"
   - "The only OpenClaw video you'll ever need" → domain = "OpenClaw"
   - Domain names should be 1-3 words: the proper noun of the tool/product.

3. **PARENT CATEGORY**: Use an existing parent if one fits. Create a new parent only for truly new categories.
   - Parent should be a broad 2-3 word category: "AI Tools", "Marketing", "Finance"

4. **SUB-TOPICS**: 2-4 broad workflow categories (NOT specific steps).
   - Good: "Setup", "Core Workflows", "Tips & Tricks"
   - Bad: "Installing Docker", "Port 3000 Configuration"

CONTENT TITLE: {title}
CONTENT SOURCE: {channel}
EXCERPT: {excerpt}

Return ONLY valid JSON:
{{"domain": "ToolName", "parent": "Category", "sub_topics": ["Topic1", "Topic2"], "description": "One sentence", "is_new": true/false}}"""


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


def _find_matching_domain(conn, name: str, parent_id: int, user_id=None) -> tuple[int, str] | None:
    """Find existing level-1 domain that matches, including substring/fuzzy."""
    # 1. Exact case-insensitive match
    if user_id:
        row = conn.execute(
            "SELECT id, name FROM domains WHERE name = ? COLLATE NOCASE AND level = 1 AND parent_id = ? AND (user_id = ? OR user_id IS NULL)",
            (name, parent_id, user_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT id, name FROM domains WHERE name = ? COLLATE NOCASE AND level = 1 AND parent_id = ?",
            (name, parent_id),
        ).fetchone()
    if row:
        return (row[0], row[1])

    # 2. Substring match — reuse existing domain if its name is contained in the new name (or vice versa)
    if user_id:
        siblings = conn.execute(
            "SELECT id, name FROM domains WHERE level = 1 AND parent_id = ? AND (user_id = ? OR user_id IS NULL)",
            (parent_id, user_id),
        ).fetchall()
    else:
        siblings = conn.execute(
            "SELECT id, name FROM domains WHERE level = 1 AND parent_id = ?",
            (parent_id,),
        ).fetchall()

    name_lower = name.lower()
    for s in siblings:
        s_lower = s[1].lower()
        # "Claude Code" in "Claude Code Marketing Team" → reuse "Claude Code"
        # Only match if the shorter name is at least 3 chars (avoid "AI" matching everything)
        shorter = min(len(s_lower), len(name_lower))
        if shorter >= 3 and (s_lower in name_lower or name_lower in s_lower):
            logger.info(f"Fuzzy-matched domain '{name}' → existing '{s[1]}'")
            return (s[0], s[1])

    # 3. Also check across ALL parents — only exact or near-exact matches (not substring)
    if user_id:
        all_domains = conn.execute(
            "SELECT id, name FROM domains WHERE level = 1 AND (user_id = ? OR user_id IS NULL)",
            (user_id,),
        ).fetchall()
    else:
        all_domains = conn.execute("SELECT id, name FROM domains WHERE level = 1").fetchall()

    for d in all_domains:
        d_lower = d[1].lower()
        # Cross-parent: only exact match or the existing name is a prefix of the new name
        if d_lower == name_lower:
            logger.info(f"Cross-parent exact-matched domain '{name}' → existing '{d[1]}'")
            return (d[0], d[1])
        if len(d_lower) >= 5 and d_lower in name_lower:
            logger.info(f"Cross-parent prefix-matched domain '{name}' → existing '{d[1]}'")
            return (d[0], d[1])

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
        parent_id, parent_name = matched
    else:
        parent_id = _find_or_create_domain(
            conn, parent_name, level=0, parent_id=None,
            path=f"/{parent_name}",
            description=f"Category: {parent_name}",
            user_id=user_id, now=now,
        )

    # 2. Find existing domain via fuzzy match, or create new one (level 1)
    domain_match = _find_matching_domain(conn, name, parent_id, user_id)
    if domain_match:
        domain_id, name = domain_match
        # If matched domain is under a different parent, update its parent to the matched one
        actual = conn.execute("SELECT parent_id FROM domains WHERE id = ?", (domain_id,)).fetchone()
        if actual and actual[0] and actual[0] != parent_id:
            logger.info(f"Domain '{name}' found under different parent, keeping original parent_id={actual[0]}")
            parent_id = actual[0]  # Use the domain's actual parent, don't move it
    else:
        domain_id = _find_or_create_domain(
            conn, name, level=1, parent_id=parent_id,
            path=f"/{parent_name}/{name}",
            description=description,
            user_id=user_id, now=now,
        )

    # 3. Find or create sub-topics (level 2) — with hard cap of 5 total
    existing_subs = conn.execute(
        "SELECT name FROM domains WHERE parent_id = ? AND level = 2", (domain_id,)
    ).fetchall()
    existing_sub_names = {r[0].lower() for r in existing_subs}

    for sub in (sub_topics or [])[:3]:  # Cap at 3 per ingestion
        sub = sub.strip()
        if not sub or sub.lower() in existing_sub_names:
            continue
        if len(existing_sub_names) >= 5:  # Hard cap at 5 sub-topics per domain
            break
        _find_or_create_domain(
            conn, sub, level=2, parent_id=domain_id,
            path=f"/{parent_name}/{name}/{sub}",
            description=f"{name} — {sub}",
            user_id=user_id, now=now,
        )
        existing_sub_names.add(sub.lower())

    conn.commit()
    conn.close()
    return domain_id


def _find_or_create_domain(conn, name: str, level: int, parent_id: int | None,
                           path: str, description: str, user_id: int | None, now: str) -> int:
    """Find existing domain by name+level+user or create a new one."""
    if level > 2:
        level = 2  # Hard cap: never create deeper than level 2
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
    try:
        cursor = conn.execute(
            "INSERT INTO domains (name, description, icon, parent_id, level, path, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, description, icon, parent_id, level, path, user_id, now, now),
        )
        logger.info(f"Created domain: {path} (level={level})")
        return cursor.lastrowid
    except sqlite3.IntegrityError:
        # UNIQUE constraint — domain with this name already exists (possibly at different level)
        # Find the existing one regardless of level
        row = conn.execute(
            "SELECT id FROM domains WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row:
            # Update its level and parent if needed
            conn.execute(
                "UPDATE domains SET level = ?, parent_id = ?, path = ?, updated_at = ? WHERE id = ?",
                (level, parent_id, path, now, row[0]),
            )
            logger.info(f"Reused existing domain '{name}' (updated level={level})")
            return row[0]
        raise
