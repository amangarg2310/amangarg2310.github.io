"""
Global configuration for the Outlier Content Engine.

All brand-specific values come from the active YAML profile.
This module only holds environment-driven settings and defaults.

API keys can now be stored in database (preferred) or .env (fallback).
"""

import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── Paths ──
PROJECT_ROOT = Path(__file__).parent
PROFILES_DIR = PROJECT_ROOT / "profiles"
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = DATA_DIR / "content_engine.db"

# Ensure data directory exists
DATA_DIR.mkdir(exist_ok=True)

# ── Active Profile ──
ACTIVE_PROFILE = os.getenv("ACTIVE_PROFILE") or None

# ── Active Vertical (new system) ──
ACTIVE_VERTICAL = os.getenv("ACTIVE_VERTICAL")


def get_api_key(service: str) -> str:
    """
    Get API key from database first, fall back to environment variable.

    Args:
        service: 'rapidapi', 'openai', 'tiktok'

    Returns:
        API key string or empty string if not found
    """
    # Try database first
    if DB_PATH.exists():
        try:
            conn = sqlite3.connect(str(DB_PATH))
            row = conn.execute(
                "SELECT api_key FROM api_credentials WHERE service = ?",
                (service,)
            ).fetchone()
            conn.close()

            if row:
                return row[0]
        except Exception:
            pass  # Database not ready yet, fall back to env

    # Fall back to environment variables
    env_map = {
        'apify': 'APIFY_API_TOKEN',
        'rapidapi': 'RAPIDAPI_KEY',
        'openai': 'OPENAI_API_KEY',
        'tiktok': 'TIKTOK_RAPIDAPI_KEY',
    }

    env_var = env_map.get(service)
    if env_var:
        return os.getenv(env_var, '')

    return ''


# ── OpenAI ──
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")  # Fallback, use get_api_key('openai')
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_MAX_TOKENS = 4096
OPENAI_TEMPERATURE = 0.7

# ── Cost Control ──
MONTHLY_COST_LIMIT_USD = float(os.getenv("MONTHLY_COST_LIMIT_USD", "4.50"))
# GPT-4o-mini pricing (per 1K tokens)
COST_PER_1K_INPUT_TOKENS = 0.00015
COST_PER_1K_OUTPUT_TOKENS = 0.00060

# ── Instagram Data Collection ──
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")  # Fallback, use get_api_key('rapidapi')
APIFY_API_TOKEN = get_api_key('apify') or os.getenv("APIFY_API_TOKEN")
COLLECTION_SOURCE = get_api_key('collection_source') or os.getenv("COLLECTION_SOURCE", "apify")
DEFAULT_POSTS_PER_COMPETITOR = 12

# ── Instagram Graph API (own-channel only, provides saves/shares) ──
IG_GRAPH_ACCESS_TOKEN = os.getenv("IG_GRAPH_ACCESS_TOKEN")

# ── TikTok Data Collection ──
TIKTOK_RAPIDAPI_KEY = os.getenv("TIKTOK_RAPIDAPI_KEY", os.getenv("RAPIDAPI_KEY", ""))  # Fallback
# Use collection_source from database if available, otherwise fall back to env or "apify"
_collection_source_db = get_api_key('collection_source')
TIKTOK_COLLECTION_SOURCE = _collection_source_db or os.getenv("TIKTOK_COLLECTION_SOURCE", "apify")

# ── Email (Gmail SMTP) ──
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_APP_PASSWORD")
EMAIL_RECIPIENTS = [
    r.strip() for r in os.getenv("EMAIL_RECIPIENTS", "").split(",") if r.strip()
]

# ── Analysis Rate Limiting ──
ANALYSIS_COOLDOWN_MINUTES = int(os.getenv("ANALYSIS_COOLDOWN_MINUTES", "0"))  # Disabled for testing
DAILY_RUN_CAP = int(os.getenv("DAILY_RUN_CAP", "999"))  # Effectively unlimited for testing
ADMIN_MODE = os.getenv("ADMIN_MODE", "").lower() in ("1", "true", "yes")  # Bypass rate limits

# ── Logging ──
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
