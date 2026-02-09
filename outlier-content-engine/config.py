"""
Global configuration for the Outlier Content Engine.

All brand-specific values come from the active YAML profile.
This module only holds environment-driven settings and defaults.
"""

import os
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
ACTIVE_PROFILE = os.getenv("ACTIVE_PROFILE", "heritage")

# ── OpenAI ──
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_MAX_TOKENS = 4096
OPENAI_TEMPERATURE = 0.7

# ── Cost Control ──
MONTHLY_COST_LIMIT_USD = float(os.getenv("MONTHLY_COST_LIMIT_USD", "4.50"))
# GPT-4o-mini pricing (per 1K tokens)
COST_PER_1K_INPUT_TOKENS = 0.00015
COST_PER_1K_OUTPUT_TOKENS = 0.00060

# ── Instagram Data Collection ──
RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY")
APIFY_API_TOKEN = os.getenv("APIFY_API_TOKEN")
COLLECTION_SOURCE = os.getenv("COLLECTION_SOURCE", "rapidapi")
DEFAULT_POSTS_PER_COMPETITOR = 12

# ── Email (Gmail SMTP) ──
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = os.getenv("EMAIL_ADDRESS")
EMAIL_PASSWORD = os.getenv("EMAIL_APP_PASSWORD")
EMAIL_RECIPIENTS = [
    r.strip() for r in os.getenv("EMAIL_RECIPIENTS", "").split(",") if r.strip()
]

# ── Logging ──
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
