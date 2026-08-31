"""Application settings, loaded from environment / .env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default; set DATABASE_URL to a Postgres URL later with no code change.
    database_url: str = "sqlite:///./peerrank.db"

    app_name: str = "Peer Rank"

    # How often the auto-close sweep runs (seconds) — closes any poll whose
    # timer has run out even if nobody has the page open.
    sweep_interval_seconds: int = 15

    # Duration options offered when creating a poll (minutes). The creator
    # picks one; anything outside this range is rejected server-side too.
    min_duration_minutes: int = 1
    max_duration_minutes: int = 24 * 60  # 1 day

    # Rate limit for ballot submission (per client IP, fixed window) — the
    # one endpoint worth throttling since it's write-heavy and has no login
    # to rely on for abuse control.
    submit_rate_max: int = 10
    submit_rate_window: int = 60

    # Rate limit for poll creation (per client IP) — prevents link-spam.
    create_rate_max: int = 20
    create_rate_window: int = 300

    # ---- Auth ----
    # Signing key for the Starlette SessionMiddleware cookie.
    secret_key: str = "dev-insecure-change-me"

    # Google OAuth 2.0 credentials (from Google Cloud Console, OAuth 2.0 Web client).
    google_client_id: str = ""
    google_client_secret: str = ""

    # Base URL of the deployed app — used to construct the OAuth redirect_uri.
    # Dev: http://localhost:5173 (Vite) or http://127.0.0.1:8000 (direct uvicorn)
    # Prod: https://peerrank.arcitech.ai
    app_base_url: str = "http://localhost:5173"

    # Set True when running behind HTTPS in production.
    https_only: bool = False

    # Allowed browser origins for the API. "*" (default) is fine for local dev;
    # in production set to your real frontend origin(s), comma-separated, e.g.
    # CORS_ORIGINS="https://peerrank.arcitech.ai". Because the SPA is served from
    # the same origin as the API, you can even lock this to that one origin.
    cors_origins: str = "*"

    # Only Google accounts on this domain can sign in (no leading @).
    allowed_email_domain: str = "arcitech.ai"

    # Whitelisted email exceptions outside allowed_email_domain, comma-separated.
    allowed_email_exceptions: str = ""

    # Admin emails, comma-separated (case-insensitive). These get admin role on
    # Google sign-in and are the only accounts that can open admin APIs / results.
    admin_emails: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_email_exceptions_set(self) -> set[str]:
        return {e.strip().lower() for e in self.allowed_email_exceptions.split(",") if e.strip()}

    @property
    def admin_emails_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}


settings = Settings()
