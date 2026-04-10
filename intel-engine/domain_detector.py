"""
Domain detection — auto-classifies content into a hierarchical taxonomy.

Uses a 3-layer matching strategy:
1. RapidFuzz string similarity (instant, free) — catches obvious matches
2. OpenAI embeddings cosine similarity (fast, $0.0001) — catches semantic matches
3. GPT classification (slower, $0.01) — only for genuinely new domains

Creates specific domains with:
- Parent category (broader grouping, level 0)
- Main domain (specific topic, level 1) — sources attach here
- Sub-topics (detected from content, level 2) — navigational grouping
"""

import json
import logging
import re
import sqlite3
import threading
from datetime import datetime, timezone

from openai import OpenAI

# Serialize domain creation to prevent duplicate level-0/level-1 entries
# during parallel playlist ingestion (3 workers).
_domain_create_lock = threading.Lock()


def _get_conn(db_path):
    """Get a DB connection with WAL mode and busy_timeout for concurrent access."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn

try:
    from rapidfuzz import fuzz
except ImportError:
    fuzz = None

import config
from embeddings import generate_embedding, batch_generate_embeddings, cosine_similarity

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

RULES:

1. **WHAT IS THIS CONTENT ACTUALLY ABOUT?** Read the excerpt. Ignore the title — titles are clickbait. Ask: "What expertise does someone gain from consuming this?" The answer is the domain.

2. **MATCH EXISTING only when the content genuinely deepens that domain's knowledge.** Sharing a keyword is NOT enough. A video mentioning "apps" doesn't belong in "Mobile Apps" if it's really teaching business strategy. Only reuse a domain (is_new=false) when this content would make a reader of that domain smarter about that specific subject.

3. **DOMAIN NAME** = the core subject, 1-3 words. Could be a tool ("Claude Code"), a discipline ("Data Engineering"), a concept ("Growth Strategy"), or a field ("Behavioral Economics"). Whatever best answers: "This is a source about ___."

4. **PARENT CATEGORY**: Broad 2-3 word grouping. STRONGLY PREFER reusing an existing parent — create a new one ONLY if NONE of the existing parents could reasonably contain this domain. Ask: "Would someone browsing the existing categories be surprised to find this domain there?" If not, reuse it.

5. **SUB-TOPICS**: 2-4 thematic areas this content covers. Think "what chapters would this belong to" — not granular steps.

6. **ICON**: A single emoji that visually represents this specific DOMAIN (not the parent). Be distinctive — \U0001f916 for AI, \U0001f4f1 for mobile, \U0001f527 for tools, \U0001f9e0 for psychology, \U0001f3a8 for design, \U0001f4bb for programming, \U0001f680 for startups, \U0001f4ca for data, \U0001f512 for security, \U0001f3ac for video, \U0001f4c8 for trading/finance. Pick the MOST specific emoji. Never use \U0001f4da.

7. **PARENT_ICON**: Same — a single emoji for the parent category.

CONTENT TITLE: {title}
CONTENT SOURCE: {channel}
EXCERPT: {excerpt}

Return ONLY valid JSON:
{{"domain": "Name", "parent": "Category", "sub_topics": ["Topic1", "Topic2"], "description": "One sentence", "is_new": true/false, "icon": "\U0001f916", "parent_icon": "\U0001f4e6"}}"""


def get_existing_domains(db_path=None, user_id=None) -> list[dict]:
    """Get all existing domains with hierarchy info."""
    db_path = db_path or config.DB_PATH
    if not db_path.exists():
        return []
    try:
        conn = _get_conn(db_path)
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


def _try_semantic_match(title: str, existing: list[dict], db_path=None) -> dict | None:
    """Try to match content to an existing domain using fuzzy string + embedding similarity.

    Returns a domain result dict if a confident match is found, None otherwise.
    This avoids calling GPT for obvious matches like "Claude Code Tips" → "Claude Code".
    """
    if not existing:
        return None

    level1_domains = [d for d in existing if d.get('level') == 1]
    if not level1_domains:
        return None

    title_lower = title.lower()
    best_match = None
    best_score = 0

    # Layer 1: RapidFuzz token_set_ratio (handles word reordering, substrings)
    if fuzz:
        for d in level1_domains:
            score = fuzz.token_set_ratio(title_lower, d['name'].lower())
            if score > best_score:
                best_score = score
                best_match = d

        if best_score >= 85:  # High confidence fuzzy match
            logger.info(f"RapidFuzz matched title '{title}' → domain '{best_match['name']}' (score={best_score})")
            path = best_match.get('path', '')
            parent_name = path.split('/')[1] if path and len(path.split('/')) > 1 else 'General'
            return {
                'domain': best_match['name'],
                'parent': parent_name,
                'sub_topics': [],
                'description': best_match.get('description', ''),
                'is_new': False,
            }

    # Layer 2: Embedding cosine similarity (semantic understanding)
    # Batch all texts in a single API call instead of N+1 sequential calls
    domain_texts = [f"{d['name']}: {d.get('description', '')}" for d in level1_domains]
    all_texts = [title] + domain_texts
    all_embeddings = batch_generate_embeddings(all_texts)
    title_embedding = all_embeddings[0] if all_embeddings else None
    domain_embeddings = all_embeddings[1:] if all_embeddings else []

    if title_embedding:
        best_match = None
        best_sim = 0
        for d, d_emb in zip(level1_domains, domain_embeddings):
            if d_emb:
                sim = cosine_similarity(title_embedding, d_emb)
                if sim > best_sim:
                    best_sim = sim
                    best_match = d

        if best_sim >= 0.78 and best_match:  # High semantic similarity
            logger.info(f"Embedding matched title '{title}' → domain '{best_match['name']}' (similarity={best_sim:.3f})")
            path = best_match.get('path', '')
            parent_name = path.split('/')[1] if path and len(path.split('/')) > 1 else 'General'
            return {
                'domain': best_match['name'],
                'parent': parent_name,
                'sub_topics': [],
                'description': best_match.get('description', ''),
                'is_new': False,
            }

    return None  # No confident match — fall back to GPT


def detect_domain_hierarchical(title: str, channel: str, transcript_excerpt: str, db_path=None, user_id=None) -> dict:
    """Detect or create a hierarchical domain structure for the content.

    Uses 3-layer matching: rapidfuzz → embeddings → GPT (only for new domains).
    """
    api_key = config.get_api_key('openai')
    if not api_key:
        raise ValueError("OpenAI API key not configured")

    existing = get_existing_domains(db_path, user_id)

    # Layer 1+2: Try semantic matching before calling GPT
    if existing:
        semantic_match = _try_semantic_match(title, existing, db_path)
        if semantic_match:
            # Found a confident match — create/reuse hierarchy without GPT
            domain_id = ensure_domain_hierarchy(
                name=semantic_match['domain'],
                parent_name=semantic_match.get('parent', 'General'),
                sub_topics=semantic_match.get('sub_topics', []),
                description=semantic_match.get('description', ''),
                db_path=db_path,
                user_id=user_id,
                icon=semantic_match.get('icon'),
                parent_icon=semantic_match.get('parent_icon'),
            )
            return {
                'domain_name': semantic_match['domain'],
                'description': semantic_match.get('description', ''),
                'is_new': False,
                'domain_id': domain_id,
                'parent_name': semantic_match.get('parent', 'General'),
                'sub_topics': semantic_match.get('sub_topics', []),
            }

    # Layer 3: GPT classification (only for genuinely new or ambiguous content)
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

    response = config.rate_limited_call(
        client.chat.completions.create,
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
        timeout=60,
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
        icon=result.get('icon'),
        parent_icon=result.get('parent_icon'),
    )

    return {
        'domain_name': result['domain'],
        'description': result.get('description', ''),
        'is_new': result.get('is_new', True),
        'domain_id': domain_id,
        'parent_name': result.get('parent', 'General'),
        'sub_topics': result.get('sub_topics', []),
    }


_PARENT_STOP_WORDS = {'tools', 'development', 'management', 'engineering', 'automation', 'technology', 'platform', 'software', 'systems', 'setup', 'configuration', 'integration', 'applications'}


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

    # 3. RapidFuzz token match (e.g. "AI Tools Setup" ~ "AI Tools" → match)
    if fuzz:
        for p in parents:
            score = fuzz.token_set_ratio(parent_name.lower(), p[1].lower())
            if score >= 80:
                logger.info(f"Fuzzy-matched parent '{parent_name}' → existing '{p[1]}' (score={score})")
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
                            db_path=None, user_id=None, icon: str = None, parent_icon: str = None) -> int:
    """Create the full domain hierarchy (parent → domain → sub-topics) and return the domain_id."""
    db_path = db_path or config.DB_PATH
    conn = _get_conn(db_path)
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
            icon=parent_icon,
        )

    # 1b. Handle parent/domain name collision — collapse into level-0.
    # When the LLM returns the same name for both (e.g. domain="AI Tools", parent="AI Tools"),
    # skip creating a redundant level-1 domain. Attach sources directly to the level-0 parent.
    if name.lower().strip() == parent_name.lower().strip():
        logger.info(f"Domain/parent name collision: '{name}' == '{parent_name}'. "
                     f"Collapsing — sources will attach to level-0 parent (id={parent_id}).")

        # Create sub-topics under the parent directly (skip level-1 creation)
        existing_subs = conn.execute(
            "SELECT name FROM domains WHERE parent_id = ? AND level = 2", (parent_id,)
        ).fetchall()
        existing_sub_names = {r[0].lower() for r in existing_subs}
        for sub in (sub_topics or [])[:3]:
            sub = sub.strip()
            if not sub or sub.lower() in existing_sub_names:
                continue
            if sub.lower() == name.lower() or sub.lower() == parent_name.lower():
                continue
            if len(existing_sub_names) >= 5:
                break
            _find_or_create_domain(
                conn, sub, level=2, parent_id=parent_id,
                path=f"/{parent_name}/{sub}",
                description=f"{parent_name} — {sub}",
                user_id=user_id, now=now,
            )
            existing_sub_names.add(sub.lower())

        conn.commit()
        conn.close()
        return parent_id

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
            icon=icon,
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
        # Skip sub-topics that duplicate the domain or parent name
        if sub.lower() == name.lower() or sub.lower() == parent_name.lower():
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
                           path: str, description: str, user_id: int | None, now: str,
                           icon: str = None) -> int:
    """Find existing domain by name+level+user or create a new one.

    Uses _domain_create_lock to prevent parallel playlist workers from
    creating duplicate level-0/level-1 entries (no UNIQUE constraint exists
    since hierarchy allows the same name at different levels).
    """
    if level > 2:
        level = 2  # Hard cap: never create deeper than level 2

    with _domain_create_lock:
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
            # Backfill: if domain has default 📚 icon and we have a better one, update it
            if icon and icon != "📚":
                conn.execute(
                    "UPDATE domains SET icon = ? WHERE id = ? AND icon = '📚'",
                    (icon, row[0]),
                )
                conn.commit()
            return row[0]

        icon = icon or DOMAIN_ICONS.get(name.lower(), "📚")
        try:
            cursor = conn.execute(
                "INSERT INTO domains (name, description, icon, parent_id, level, path, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, description, icon, parent_id, level, path, user_id, now, now),
            )
            conn.commit()  # Commit immediately so other threads see the new row
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


# ══════════════════════════════════════════════════════════════
# Taxonomy Evolution (Tier 3A)
# ══════════════════════════════════════════════════════════════

def propose_taxonomy_evolution(domain_id: int, new_insights: list[dict], db_path=None, user_id=None) -> dict | None:
    """After classifying a source, check if the taxonomy should evolve.

    Proposes:
    - New sub-topics when insights don't fit existing ones
    - Sub-topic splits when one sub-topic covers too many distinct concepts

    Returns a dict describing the proposed change, or None if no change needed.
    """
    db_path = db_path or config.DB_PATH
    api_key = config.get_api_key('openai')
    if not api_key:
        return None

    conn = _get_conn(db_path)

    domain = conn.execute("SELECT id, name, level, parent_id FROM domains WHERE id = ?", (domain_id,)).fetchone()
    if not domain or domain['level'] != 1:
        conn.close()
        return None  # Only evolve level-1 domains

    # Get existing sub-topics for this domain
    sub_topics = conn.execute(
        "SELECT id, name, source_count FROM domains WHERE parent_id = ? AND level = 2",
        (domain_id,),
    ).fetchall()
    conn.close()

    existing_subs = [dict(s) for s in sub_topics]
    if not new_insights:
        return None

    # Extract topic keywords from new insights
    insight_topics = set()
    for ins in new_insights:
        if isinstance(ins, dict):
            for t in ins.get('topics', []):
                if isinstance(t, str):
                    insight_topics.add(t.lower())
            insight_topics.add(ins.get('title', '').lower()[:50])

    existing_sub_names = [s['name'] for s in existing_subs]

    # Only call LLM if we have enough insights and existing sub-topics to evaluate
    if len(existing_subs) < 1 and len(new_insights) < 5:
        return None  # Too early to evolve

    client = OpenAI(api_key=api_key)
    try:
        response = config.rate_limited_call(
            client.chat.completions.create,
            model=config.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "You analyze how a learner's understanding of a domain evolves as they consume new content. Return only valid JSON."},
                {"role": "user", "content": f"""Domain: {domain['name']}
Current understanding structure (sub-topics): {', '.join(existing_sub_names) if existing_sub_names else 'None yet — this is a new area of learning'}

New insights from the latest source (topics covered):
{chr(10).join(f'- {ins.get("title", "")}: topics={ins.get("topics", [])}' for ins in new_insights[:15])}

As the user's understanding of "{domain['name']}" deepens with this new source, should their mental model evolve?

1. EXPAND: Their understanding now covers a new area that doesn't fit existing sub-topics — a new dimension of the domain has emerged
2. REFINE: One area of understanding has become nuanced enough to distinguish into more specific concepts — what felt like one thing is actually two
3. NONE: The current structure adequately captures this new knowledge

Return ONLY valid JSON:
{{"action": "none", "details": {{}}}}
or
{{"action": "create", "details": {{"name": "New Area Name", "reason": "what new dimension of understanding this represents"}}}}
or
{{"action": "split", "details": {{"original": "Existing Area", "new_names": ["More Specific A", "More Specific B"], "reason": "what distinction has become clear"}}}}"""},
            ],
            temperature=0.2,
            max_tokens=300,
            timeout=60,
        )

        text = response.choices[0].message.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        result = json.loads(text)
        action = result.get('action', 'none')

        if action == 'none':
            return None

        # Execute the taxonomy change
        if action == 'create':
            details = result.get('details', {})
            new_name = details.get('name', '').strip()
            if new_name and new_name not in existing_sub_names:
                _execute_taxonomy_create(domain_id, domain['name'], new_name, db_path, user_id)
                return {'action': 'create', 'domain': domain['name'], 'new_sub_topic': new_name,
                        'reason': details.get('reason', '')}

        elif action == 'split':
            details = result.get('details', {})
            original = details.get('original', '')
            new_names = details.get('new_names', [])
            if original and len(new_names) == 2:
                _execute_taxonomy_split(domain_id, domain['name'], original, new_names, db_path, user_id)
                return {'action': 'split', 'domain': domain['name'], 'original': original,
                        'new_sub_topics': new_names, 'reason': details.get('reason', '')}

        return None

    except Exception as e:
        logger.warning(f"Taxonomy evolution check failed for domain {domain_id}: {e}")
        return None


def _execute_taxonomy_create(domain_id: int, domain_name: str, sub_topic_name: str, db_path, user_id=None):
    """Create a new sub-topic under a domain."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn(db_path)

    # Get parent path
    domain = conn.execute("SELECT path FROM domains WHERE id = ?", (domain_id,)).fetchone()
    parent_path = domain[0] if domain else f"/{domain_name}"

    conn.execute("""
        INSERT OR IGNORE INTO domains (name, level, parent_id, path, user_id, icon, source_count, insight_count, created_at, updated_at)
        VALUES (?, 2, ?, ?, ?, '📌', 0, 0, ?, ?)
    """, (sub_topic_name, domain_id, f"{parent_path}/{sub_topic_name}", user_id, now, now))
    conn.commit()
    conn.close()

    # Record the change
    _record_taxonomy_change(domain_id, 'create', f"Your understanding of {domain_name} expanded to include {sub_topic_name}", db_path, user_id)
    logger.info(f"Schema evolution: Understanding of '{domain_name}' expanded to include '{sub_topic_name}'")


def _execute_taxonomy_split(domain_id: int, domain_name: str, original: str, new_names: list, db_path, user_id=None):
    """Split an existing sub-topic into two new ones."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn(db_path)

    domain = conn.execute("SELECT path FROM domains WHERE id = ?", (domain_id,)).fetchone()
    parent_path = domain[0] if domain else f"/{domain_name}"

    for name in new_names:
        conn.execute("""
            INSERT OR IGNORE INTO domains (name, level, parent_id, path, user_id, icon, source_count, insight_count, created_at, updated_at)
            VALUES (?, 2, ?, ?, ?, '📌', 0, 0, ?, ?)
        """, (name, domain_id, f"{parent_path}/{name}", user_id, now, now))
    conn.commit()
    conn.close()

    _record_taxonomy_change(domain_id, 'split',
                            f"Your understanding of {domain_name} refined — '{original}' is now distinguished as '{new_names[0]}' and '{new_names[1]}'",
                            db_path, user_id)
    logger.info(f"Schema evolution: Understanding of '{domain_name}' refined — '{original}' → {new_names}")


def _record_taxonomy_change(domain_id: int, change_type: str, description: str, db_path, user_id=None):
    """Record a taxonomy change event."""
    now = datetime.now(timezone.utc).isoformat()
    conn = _get_conn(db_path)
    try:
        conn.execute("""
            INSERT INTO taxonomy_changes (domain_id, change_type, description, user_id, created_at)
            VALUES (?, ?, ?, ?, ?)
        """, (domain_id, change_type, description, user_id, now))
        conn.commit()
    except sqlite3.OperationalError:
        pass  # Table may not exist yet
    conn.close()
