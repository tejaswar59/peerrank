"""Database engine, session factory, and Base. Sync SQLAlchemy 2.0 — simplest to
run and inspect; swap DATABASE_URL for Postgres later without touching models."""
import logging

from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

log = logging.getLogger("peerrank.database")


def _normalise_url(raw: str) -> str:
    """Point a bare `postgresql://` URL at the driver we actually ship.

    SQLAlchemy maps `postgresql://` to psycopg2, but requirements.txt installs
    psycopg (v3). Copy a connection string straight out of a provider's
    dashboard and you get the bare form, which fails at import with
    `ModuleNotFoundError: No module named 'psycopg2'` — before any of the
    friendly startup diagnostics can run. Rewriting the driver here is safer
    than expecting everyone to remember the `+psycopg` suffix.
    """
    try:
        url = make_url(raw)
    except Exception:
        return raw
    if url.drivername in ("postgresql", "postgres"):
        log.info("DATABASE_URL had no driver suffix — using postgresql+psycopg")
        # render_as_string(hide_password=False), NOT str(): SQLAlchemy's __str__
        # masks the password as "***", so str() here would silently hand the
        # engine a URL with a bogus password and every connection would fail
        # authentication.
        return url.set(drivername="postgresql+psycopg").render_as_string(
            hide_password=False
        )
    return raw


DATABASE_URL = _normalise_url(settings.database_url)
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    # check_same_thread=False lets the background sweep task use the same file.
    connect_args: dict = {"check_same_thread": False}
    engine_kwargs: dict = {}
else:
    # Managed Postgres closes idle connections and sits behind proxies that can
    # drop them silently. Without pre_ping the first query after an idle spell
    # fails on a dead socket; without a recycle those sockets pile up.
    connect_args = {
        "connect_timeout": settings.db_connect_timeout,
        # Disable psycopg's automatic prepared statements. A connection pooler
        # in TRANSACTION mode (Supabase port 6543, pgbouncer, etc.) hands each
        # transaction a different backend, so a statement prepared on one is
        # missing on the next — surfacing as confusing DuplicatePreparedStatement
        # / "prepared statement does not exist" errors under load. This app runs
        # a handful of tiny queries, so the lost caching is irrelevant next to
        # working on every pooler mode.
        "prepare_threshold": None,
    }
    engine_kwargs = {
        "pool_pre_ping": True,
        "pool_recycle": 1800,
        "pool_size": 5,
        "max_overflow": 5,
    }

engine = create_engine(
    DATABASE_URL, connect_args=connect_args, future=True, **engine_kwargs
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def describe_db_target() -> str:
    """Host:port of the configured database, with NO credentials — safe to log.

    Deliberately reconstructed from the parsed URL rather than printing
    DATABASE_URL, which contains the password.
    """
    try:
        url = engine.url
        if IS_SQLITE:
            return f"sqlite file {url.database}"
        return f"{url.drivername} at {url.host}:{url.port or 5432}/{url.database}"
    except Exception:
        return "the configured database"


def get_db():
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
