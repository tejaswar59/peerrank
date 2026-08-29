"""Application settings, loaded from environment / .env (see .env.example)."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # SQLite by default; set DATABASE_URL to a Postgres URL later with no code change.
    database_url: str = "sqlite:///./peerrank.db"

    app_name: str = "Peer Rank"

    # Postgres only. How long a single connection attempt may take, and how long
    # startup keeps retrying before giving up — a managed database is often still
    # waking up when the app container starts, and crash-looping on that wastes
    # far more time than waiting a few seconds.
    db_connect_timeout: int = 10
    db_startup_retries: int = 5
    db_startup_retry_delay: float = 3.0

    # Auto-close sweep. The loop does NOT tick on a fixed interval: it sleeps
    # until the next poll is actually due to close, and falls back to
    # sweep_idle_interval_seconds when nothing is open at all. That keeps a
    # metered/serverless Postgres from being woken thousands of times a day for
    # no reason. Closing is also handled inline on any visitor request and on the
    # final vote, so this loop is only the nobody-is-watching backstop.
    sweep_interval_seconds: int = 5  # retained for compatibility; see scheduler
    sweep_idle_interval_seconds: int = 300

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

    # Token sizes. The alphabets live in app/routers/polls.py next to the
    # generator; these are the lengths.
    #
    # They are deliberately NOT symmetric. vote_token is a 5-DIGIT number: it is
    # read off a screen, retyped and dictated, so it is optimised for that.
    # admin_token is letters+digits at 6 and never typed by anyone.
    #
    #   vote_token   10^5 = 100,000 combinations
    #   admin_token  33^6 ~= 1.3 billion
    #
    # 100,000 is SMALL. It is only defensible because of three things together:
    #   * lookup_miss_max below caps failed guesses per IP (30/min by default),
    #   * a poll is only guessable while it is open — usually minutes,
    #   * a vote_token hit exposes a roster of first names and the ability to
    #     vote as a name that has not voted; it can never reach results.
    # If polls ever get long windows, high volume, or anything more sensitive
    # than first names, raise this back to 6 and use letters again.
    vote_token_length: int = 5
    admin_token_length: int = 6

    # Failed token lookups per client IP. A vote/admin token is 6 characters
    # from a 33-symbol alphabet, and /status needs no credential, so without
    # this an attacker can search the keyspace at full network speed looking for
    # live polls. Only MISSES are counted, so ordinary polling — which always
    # hits — is completely unaffected no matter how many people share one IP.
    lookup_miss_max: int = 30
    lookup_miss_window: int = 60

    # How long a closed poll's frozen leaderboard stays readable, measured from
    # the moment it was computed. Once this elapses the poll and everything
    # under it (roster, participation log, ballots, snapshot) is deleted
    # permanently — results are meant to be seen, discussed and then gone, not
    # to sit in a database indefinitely.
    #
    # This is real deletion, not hiding: after it runs there is nothing left to
    # recover, which is the point. Set to 0 to keep results forever.
    results_retention_seconds: int = 30 * 60

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
