"""
Domain detection — automatically classifies video content into knowledge domains.

Uses GPT to analyze the video title, channel, and first chunk of transcript to
determine which domain the content belongs to. Creates new domains automatically
when content doesn't fit existing ones.
"""

import json
import logging
import sqlite3
from datetime import datetime, timezone

from openai import OpenAI

import config

logger = logging.getLogger(__name__)

DOMAIN_ICONS = {
    "product marketing": "📦",
    "growth": "📈",
    "sales": "💰",
    "engineering": "⚙️",
    "design": "🎨",
    "data science": "📊",
    "ai & machine learning": "🤖",
    "leadership": "👑",
    "startups": "🚀",
    "finance": "💵",
    "content creation": "🎬",
    "social media": "📱",
    "seo": "🔍",
    "copywriting": "✍️",
    "psychology": "🧠",
    "productivity": "⏱️",
    "health & fitness": "💪",
    "cooking": "🍳",
    "music": "🎵",
    "programming": "💻",
    "education": "📖",
    "science": "🔬",
    "business strategy": "♟️",
    "entrepreneurship": "🏗️",
    "investing": "📉",
    "real estate": "🏠",
    "career development": "🎯",
    "communication": "🗣️",
    "negotiation": "🤝",
    "customer success": "🌟",
}

DETECTION_PROMPT = """You are a domain classifier. Given a video's title, channel, and transcript excerpt, determine which knowledge domain this content belongs to.

{existing_domains_section}

RULES:
1. If the content clearly fits an existing domain, return that domain name EXACTLY as listed.
2. If the content is a genuinely new topic not covered by any existing domain, create a concise new domain name (2-4 words, Title Case).
3. Be specific but not too narrow — "Product Marketing" is good, "Product Marketing for SaaS B2B Companies" is too narrow.
4. Domain names should be professional and clear.

VIDEO TITLE: {title}
CHANNEL: {channel}
TRANSCRIPT EXCERPT: {excerpt}

Return ONLY a JSON object:
{{"domain": "Domain Name", "description": "One-sentence description of what this domain covers", "is_new": true/false}}"""


def get_existing_domains(db_path=None) -> list[dict]:
    """Get all existing domains from the database."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return []

    try:
        conn = sqlite3.connect(str(db_path))
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT name, description, source_count FROM intel_domains ORDER BY source_count DESC"
        ).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except sqlite3.OperationalError:
        return []


def detect_domain(title: str, channel: str, transcript_excerpt: str, db_path=None) -> dict:
    """
    Detect or create the appropriate domain for video content.

    Args:
        title: Video title
        channel: Channel name
        transcript_excerpt: First ~500 words of transcript

    Returns:
        dict with: domain_name, description, is_new, domain_id
    """
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    existing = get_existing_domains(db_path)

    if existing:
        domain_list = "\n".join(f"- {d['name']} ({d['source_count']} videos): {d['description'] or 'No description'}" for d in existing)
        existing_section = f"EXISTING DOMAINS:\n{domain_list}\n"
    else:
        existing_section = "No existing domains yet — you must create a new one.\n"

    # Truncate transcript for prompt
    words = transcript_excerpt.split()[:500]
    excerpt = " ".join(words)

    client = OpenAI(api_key=api_key)

    response = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=[
            {"role": "system", "content": "You classify content into knowledge domains. Return only valid JSON."},
            {"role": "user", "content": DETECTION_PROMPT.format(
                existing_domains_section=existing_section,
                title=title,
                channel=channel,
                excerpt=excerpt,
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

    result = json.loads(content)
    domain_name = result['domain']
    description = result.get('description', '')
    is_new = result.get('is_new', True)

    # Ensure domain exists in database
    domain_id = ensure_domain_exists(domain_name, description, db_path)

    return {
        'domain_name': domain_name,
        'description': description,
        'is_new': is_new,
        'domain_id': domain_id,
    }


def ensure_domain_exists(name: str, description: str = "", db_path=None) -> int:
    """Create domain if it doesn't exist, return its ID."""
    db_path = db_path or config.DB_PATH
    conn = sqlite3.connect(str(db_path))
    now = datetime.now(timezone.utc).isoformat()

    # Check if exists (case-insensitive)
    row = conn.execute(
        "SELECT id FROM intel_domains WHERE name = ? COLLATE NOCASE", (name,)
    ).fetchone()

    if row:
        domain_id = row[0]
    else:
        # Pick an icon
        icon = DOMAIN_ICONS.get(name.lower(), "📚")
        cursor = conn.execute(
            "INSERT INTO intel_domains (name, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            (name, description, icon, now, now),
        )
        domain_id = cursor.lastrowid
        logger.info(f"Created new domain: {name} (id={domain_id})")

    conn.commit()
    conn.close()
    return domain_id
