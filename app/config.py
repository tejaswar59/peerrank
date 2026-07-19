"""Application settings, loaded from environment / .env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default; set DATABASE_URL to a Postgres URL later with no code change.
    database_url: str = "sqlite:///./peerrank.db"

    secret_key: str = "dev-secret-change-me"
    token_ttl_seconds: int = 60 * 60 * 8  # 8 hours

    # --- Temporary dev login. Replaced by Google OAuth later. ---
    admin_username: str = "admin"
    voter_username: str = "user"
    dev_password: str = "123"
    admin_email: str = "admin@peerrank.local"
    dev_voter_email: str = "teja@aufgang.com"

    # How often the auto-close sweep runs (seconds).
    sweep_interval_seconds: int = 60

    # Anonymity floor: a leaderboard is only revealed once at least this many
    # people have voted. With 1–2 ballots on a small team, the ranking could
    # leak how an individual voted, so results stay hidden below this count.
    min_result_voters: int = 3

    # Rate limits (per client IP, fixed window). Tunable without code changes.
    login_rate_max: int = 10
    login_rate_window: int = 60
    submit_rate_max: int = 5
    submit_rate_window: int = 60
    otp_rate_max: int = 5          # signup/resend requests per window per IP
    otp_rate_window: int = 300

    # --- Sign-up + email OTP verification ---
    app_name: str = "Peer Rank"
    password_min_length: int = 8
    otp_length: int = 6
    otp_ttl_seconds: int = 600     # 10 minutes
    otp_max_attempts: int = 5

    # DEV master OTP: when set, this code verifies ANY email without the real
    # emailed code — a bypass so sign-up works before SMTP is wired up.
    # SECURITY: it lets anyone verify any address. MUST be cleared (MASTER_OTP="")
    # in production. See the DEPLOY.md checklist.
    master_otp: str = "112233"

    # SMTP for sending the OTP email. Leave SMTP_HOST empty in dev — the code is
    # then logged to the server console instead of emailed. In production set
    # these to your provider (e.g. AWS SES SMTP endpoint + credentials).
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = "Peer Rank <no-reply@peerrank.local>"
    smtp_use_tls: bool = True

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
