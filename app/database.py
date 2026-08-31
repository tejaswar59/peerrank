"""Database engine, session factory, and Base. Sync SQLAlchemy 2.0 — simplest to
run and inspect; swap DATABASE_URL for Postgres later without touching models."""
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings


def _normalise(url: str) -> str:
    """Force the psycopg (v3) driver for Postgres URLs.

    Managed Postgres providers hand out bare `postgresql://` (and Heroku-style
    `postgres://`) URLs. SQLAlchemy maps both to psycopg2, which this project
    does not install - requirements.txt pins psycopg[binary] v3 - so pasting a
    provider URL in verbatim fails at first connection with
    "No module named 'psycopg2'". Normalising here means the deploy works with
    whatever the provider's copy button produced.
    """
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _normalise(settings.database_url)

# check_same_thread=False lets the background sweep task use the same SQLite file.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
