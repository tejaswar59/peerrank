"""Application settings, loaded from environment / .env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default; set DATABASE_URL to a Postgres URL later with no code change.
    database_url: str = "sqlite:///./peerrank.db"

    app_name: str = "Peer Rank"

    # How often the auto-close sweep runs (seconds) — closes any poll whose
    # timer has run out even if nobody has the page open. Must stay <=
    # min_duration_seconds, otherwise the shortest allowed poll could sit
    # "open" past its own deadline until the next sweep.
    sweep_interval_seconds: int = 5

    # Voting-window bounds (seconds). The creator picks any value in this range;
    # anything outside it is rejected server-side too, never just in the UI.
    # The 5s floor exists so a full create -> vote -> close -> results cycle can
    # be exercised end to end in one sitting.
    min_duration_seconds: int = 5
    max_duration_seconds: int = 24 * 60 * 60  # 1 day

    # Rate limit for ballot submission (per client IP, fixed window).
    #
    # Sized for the normal case, which is a whole team voting at once from ONE
    # shared public IP (an office NAT, or a mobile carrier gateway). A roster can
    # hold up to MAX_MEMBERS (100) people, so a limit of 10/minute would have
    # started rejecting real voters as soon as the 11th person in an office
    # submitted. This is abuse protection only — the actual duplicate-vote guard
    # is the unique(poll_id, member_id) constraint in the database, which no rate
    # limit is needed to enforce.
    submit_rate_max: int = 150
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
