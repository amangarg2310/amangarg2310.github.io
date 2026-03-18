"""
Global configuration for the Domain Intelligence Engine.
"""

import os
import sqlite3
import logging
from pathlib import Path
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# ── Paths ──
PROJECT_ROOT = Path(__file__).parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "intel_engine.db"
UPLOADS_DIR = DATA_DIR / "uploads"

DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)

# ── Upload limits ──
MAX_UPLOAD_SIZE_MB = 50
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg', 'gif', 'webp'}

# ── OpenAI ──
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_MAX_TOKENS = 4096
OPENAI_TEMPERATURE = 0.3


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
    }
    env_var = env_map.get(service)
    if env_var:
        return os.getenv(env_var, '')
    return ''
