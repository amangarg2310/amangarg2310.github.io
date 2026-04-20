"""
Global configuration for the Domain Intelligence Engine.
"""

import os
import sqlite3
import logging
import threading
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# ── Paths ──
PROJECT_ROOT = Path(__file__).parent
# On Render, disk is mounted at the old monorepo path — use it if it exists
_RENDER_DATA = Path("/opt/render/project/src/intel-engine/data")
DATA_DIR = _RENDER_DATA if _RENDER_DATA.exists() else PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "intel_engine.db"
UPLOADS_DIR = DATA_DIR / "uploads"

DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# ── Upload limits ──
MAX_UPLOAD_SIZE_MB = 50
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp'}

# ── Playlist limits ──
MAX_PLAYLIST_VIDEOS = 50  # Soft cap on new (non-deduped) videos per playlist submission

# ── API concurrency ──
# Global semaphore to limit concurrent LLM API calls across all threads.
# Prevents rate limiting when processing playlists + other sources simultaneously.
api_semaphore = threading.Semaphore(6)


def rate_limited_call(fn, *args, **kwargs):
    """Execute an API call within the global semaphore.
    
    Usage: result = config.rate_limited_call(client.messages.create, model=..., messages=...)
    """
    with api_semaphore:
        return fn(*args, **kwargs)

# ── OpenAI ──
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MAX_TOKENS = 4096
OPENAI_TEMPERATURE = 0.3

# ── Embeddings ──
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSION = 1536

# ── Anthropic ──
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")  # For visuals
ANTHROPIC_HAIKU_MODEL = os.getenv("ANTHROPIC_HAIKU_MODEL", "claude-haiku-4-5-20251001")  # For text gen


def get_api_key(service: str) -> str:
    """Get API key from database first, fall back to environment variable."""
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH))
            row = conn.execute(
                "SELECT api_key FROM api_credentials WHERE service = ?",
                (service,),
            ).fetchone()
            conn.close()
            if row:
                return row[0]
        except Exception:
            pass

    env_map = {
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
        'supadata': 'SUPADATA_API_KEY',
    }
    env_var = env_map.get(service)
    if env_var:
        return os.getenv(env_var, '')
    return ''
