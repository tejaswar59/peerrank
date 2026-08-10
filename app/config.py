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

    # Allowed browser origins for the API. "*" (default) is fine for local dev;
    # in production set to your real frontend origin(s), comma-separated, e.g.
    # CORS_ORIGINS="https://peerrank.arcitech.ai". Because the SPA is served from
    # the same origin as the API, you can even lock this to that one origin.
    cors_origins: str = "*"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
