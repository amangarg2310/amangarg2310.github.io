import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = PROJECT_ROOT / "config"
TRANSCRIPTS_DIR = PROJECT_ROOT / "transcripts"
PROMPTS_DIR_PROCESSING = PROJECT_ROOT / "processing" / "prompts"
PROMPTS_DIR_QUERY = PROJECT_ROOT / "query" / "prompts"
PROMPTS_DIR_SYNTHESIS = PROJECT_ROOT / "synthesis" / "prompts"

# Ensure directories exist
TRANSCRIPTS_DIR.mkdir(exist_ok=True)

# API Keys
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# App config
DEFAULT_DOMAIN = os.getenv("DEFAULT_DOMAIN", "product_marketing")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = int(os.getenv("EMBEDDING_DIMENSIONS", "1536"))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "4000"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "200"))

# LLM models
PROCESSING_MODEL = "claude-sonnet-4-20250514"
SYNTHESIS_MODEL = "claude-opus-4-20250514"

# Source registry DB path
SOURCE_REGISTRY_DB = PROJECT_ROOT / "source_registry.db"
