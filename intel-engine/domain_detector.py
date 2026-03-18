"""
Domain detection — auto-classifies video content into knowledge domains.
Creates new domains when content doesn't fit existing ones.
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
    "ai & machine learning": "🤖", "leadership": "👑", "startups": "🚀",
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

DETECTION_PROMPT = """You are a domain classifier. Given a video's title, channel, and transcript excerpt, determine which knowledge domain this content belongs to.

{existing_domains_section}

RULES:
1. If the content clearly fits an existing domain, return that domain name EXACTLY as listed.
2. If the content is a genuinely new topic, create a concise new domain name (2-4 words, Title Case).
3. Be specific but not too narrow — "Product Marketing" is good, "Product Marketing for SaaS B2B Companies" is too narrow.
4. Domain names should be professional and clear.

VIDEO TITLE: {title}
CHANNEL: {channel}
TRANSCRIPT EXCERPT: {excerpt}

Return ONLY a JSON object:
{{"domain": "Domain Name", "description": "One-sentence description of what this domain covers", "is_new": true/false}}"""


def get_existing_domains(db_path=None) -> list[dict]:
    """Get all existing domains."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT name, description, source_count FROM domains ORDER BY source_count DESC"
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []


def detect_domain(title: str, channel: str, transcript_excerpt: str, db_path=None) -> dict:
    """Detect or create the appropriate domain for video content."""
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    existing = get_existing_domains(db_path)

    if existing:
        domain_list = "\n".join(
            f"- {d['name']} ({d['source_count']} videos): {d['description'] or 'No description'}"
            for d in existing
        )
        existing_section = f"EXISTING DOMAINS:\n{domain_list}\n"
    else:
        existing_section = "No existing domains yet — you must create a new one.\n"

    words = transcript_excerpt.split()[:500]
    excerpt = " ".join(words)

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You classify content into knowledge domains. Return only valid JSON."},
            {"role": "user", "content": DETECTION_PROMPT.format(
                existing_domains_section=existing_section,
                title=title, channel=channel, excerpt=excerpt,
            )},
        ],
        temperature=0.2,
        max_tokens=200,
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
        # Try regex extraction
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            try:
                result = json.loads(match.group())
            except (json.JSONDecodeError, TypeError):
                pass

    if not result or not isinstance(result, dict) or 'domain' not in result:
        logger.warning(f"Domain detection failed to parse response, using fallback. Response: {content[:200]}")
        result = {'domain': 'General Knowledge', 'description': 'Uncategorized knowledge', 'is_new': True}

    domain_id = ensure_domain_exists(result['domain'], result.get('description', ''), db_path)

    return {
        'domain_name': result['domain'],
        'description': result.get('description', ''),
        'is_new': result.get('is_new', True),
        'domain_id': domain_id,
    }


def ensure_domain_exists(name: str, description: str = "", db_path=None) -> int:
    """Create domain if it doesn't exist, return its ID."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    now = datetime.now(timezone.utc).isoformat()

    row = conn.execute(
        "SELECT id FROM domains WHERE name = ? COLLATE NOCASE", (name,)
    ).fetchone()

    if row:
        domain_id = row[0]
    else:
        icon = DOMAIN_ICONS.get(name.lower(), "📚")
        cursor = conn.execute(
            "INSERT INTO domains (name, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (name, description, icon, now, now),
        )
        domain_id = cursor.lastrowid
        logger.info(f"Created new domain: {name} (id={domain_id})")

    conn.commit()
    conn.close()
    return domain_id
