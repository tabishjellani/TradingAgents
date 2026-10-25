"""TradingAgents Backend Configuration.

Loads environment variables with safe defaults and validates settings.
"""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    """Application configuration and environment bounds."""

    # Service info
    app_name: str = "TradingAgents PWA Backend"
    app_version: str = "0.7.0"
    environment: str = "development"
    debug: bool = True

    # Server binding
    host: str = "127.0.0.1"
    port: int = 8000
    gateway_shared_secret: str = ""

    # CORS configuration
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
        "http://localhost:3000",
    ]

    # Supabase credentials (optional for offline/mock development)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    # Live trading mandatory safety controls (hard-disabled by default)
    enable_live_trading: bool = False
    broker_sandbox_mode: bool = True
    max_order_notional_usd: float = 1000.0
    daily_loss_limit_pct: float = 2.0

    # AI & Compute Budgets
    default_ai_provider: str = "google"
    default_quick_model: str = "gemini-3.8-flash"
    default_deep_model: str = "gemini-3.8-flash"
    max_job_timeout_seconds: int = 300
    user_daily_job_quota: int = 20

    # Storage paths
    data_dir: Path = Path("./data")

    model_config = SettingsConfigDict(
        env_file=(
            str(_REPO_ROOT / ".env"),
            str(_REPO_ROOT / ".env.local"),
            ".env",
            ".env.local",
            "backend/.env",
            "backend/.env.local",
        ),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    def model_post_init(self, __context):
        if self.is_production:
            self.debug = False


settings = Settings()


