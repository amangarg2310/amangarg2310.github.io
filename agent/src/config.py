from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Agent identity
    agent_name: str = Field(default="SCOUT", alias="AGENT_NAME")
    agent_log_level: str = Field(default="INFO", alias="AGENT_LOG_LEVEL")
    agent_approval_default: bool = Field(default=True, alias="AGENT_APPROVAL_DEFAULT")

    # Claude / Anthropic
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    claude_default_model: str = Field(
        default="claude-sonnet-4-20250514", alias="CLAUDE_DEFAULT_MODEL"
    )
    claude_max_tokens: int = Field(default=4096, alias="CLAUDE_MAX_TOKENS")
    claude_daily_budget_usd: float = Field(default=50.0, alias="CLAUDE_DAILY_BUDGET_USD")

    # Database
    database_url: str = Field(
        default="postgresql+asyncpg://agent:password@localhost:5432/agent_db",
        alias="DATABASE_URL",
    )
    pgvector_dimensions: int = Field(default=1536, alias="PGVECTOR_DIMENSIONS")

    # Redis
    redis_url: str = Field(default="redis://localhost:6379", alias="REDIS_URL")

    # SQS (optional, falls back to Redis)
    sqs_queue_url: str = Field(default="", alias="SQS_QUEUE_URL")

    # Slack
    slack_bot_token: str = Field(default="", alias="SLACK_BOT_TOKEN")
    slack_signing_secret: str = Field(default="", alias="SLACK_SIGNING_SECRET")
    slack_channel_intake: str = Field(default="", alias="SLACK_CHANNEL_INTAKE")

    # Gmail
    gmail_credentials_json: str = Field(default="", alias="GMAIL_CREDENTIALS_JSON")
    gmail_watch_labels: str = Field(default="INBOX", alias="GMAIL_WATCH_LABELS")

    # JIRA
    jira_base_url: str = Field(default="", alias="JIRA_BASE_URL")
    jira_email: str = Field(default="", alias="JIRA_EMAIL")
    jira_api_token: str = Field(default="", alias="JIRA_API_TOKEN")
    jira_project_key: str = Field(default="AGENT", alias="JIRA_PROJECT_KEY")

    # GitHub
    github_token: str = Field(default="", alias="GITHUB_TOKEN")
    github_org: str = Field(default="", alias="GITHUB_ORG")
    github_default_repo: str = Field(default="", alias="GITHUB_DEFAULT_REPO")

    # Social media
    bluesky_handle: str = Field(default="", alias="BLUESKY_HANDLE")
    bluesky_app_password: str = Field(default="", alias="BLUESKY_APP_PASSWORD")
    linkedin_access_token: str = Field(default="", alias="LINKEDIN_ACCESS_TOKEN")
    threads_access_token: str = Field(default="", alias="THREADS_ACCESS_TOKEN")

    # Media
    heygen_api_key: str = Field(default="", alias="HEYGEN_API_KEY")
    elevenlabs_api_key: str = Field(default="", alias="ELEVENLABS_API_KEY")
    elevenlabs_voice_id: str = Field(default="", alias="ELEVENLABS_VOICE_ID")

    # Recall.ai
    recall_api_key: str = Field(default="", alias="RECALL_API_KEY")

    # SPY dashboard
    spy_dashboard_port: int = Field(default=8081, alias="SPY_DASHBOARD_PORT")

    # Orchestrator
    orchestrator_poll_interval: float = Field(default=2.0)
    orchestrator_max_retries: int = Field(default=3)

    @property
    def sync_database_url(self) -> str:
        return self.database_url.replace("+asyncpg", "")


settings = Settings()


# Autonomy configuration — adjustable at runtime
AUTONOMY_CONFIG: dict = {
    "content_creation": {
        "approval_required": True,
        "confidence_threshold": 0.85,
        "max_revisions": 3,
        "allowed_models": ["claude-sonnet-4-20250514"],
    },
    "social_posting": {
        "approval_required": True,
        "confidence_threshold": 0.90,
        "max_revisions": 2,
        "allowed_models": ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"],
    },
    "community_reply": {
        "approval_required": False,
        "confidence_threshold": 0.80,
        "max_revisions": 1,
        "allowed_models": ["claude-haiku-4-5-20251001"],
    },
    "meeting_notes": {
        "approval_required": False,
        "confidence_threshold": 0.70,
        "max_revisions": 1,
        "allowed_models": ["claude-sonnet-4-20250514"],
    },
    "email": {
        "approval_required": True,
        "confidence_threshold": 0.85,
        "max_revisions": 2,
        "allowed_models": ["claude-sonnet-4-20250514"],
    },
    "development": {
        "approval_required": True,
        "confidence_threshold": 0.95,
        "max_revisions": 3,
        "timeout_minutes": 120,
        "allowed_models": ["claude-sonnet-4-20250514", "claude-opus-4-6"],
    },
    "research": {
        "approval_required": False,
        "confidence_threshold": 0.75,
        "max_revisions": 2,
        "allowed_models": ["claude-sonnet-4-20250514"],
    },
}
