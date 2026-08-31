"""Test fixtures for Peer Rank.

Env vars MUST be set before `app.config` is imported, because Settings() and the
SQLAlchemy engine are both built at module import time. So this file configures a
throwaway SQLite DB in a temp dir at import, before any `app.*` import.
"""
import base64
import json
import os
import tempfile

_TMPDIR = tempfile.mkdtemp(prefix="peerrank-tests-")
_DB_PATH = os.path.join(_TMPDIR, "test.db").replace("\\", "/")

TEST_SECRET = "test-secret-key-for-session-signing"
ADMIN_EMAIL = "admin@arcitech.ai"

os.environ.update(
    DATABASE_URL=f"sqlite:///{_DB_PATH}",
    SECRET_KEY=TEST_SECRET,
    GOOGLE_CLIENT_ID="fake-client-id",
    GOOGLE_CLIENT_SECRET="fake-client-secret",
    APP_BASE_URL="http://localhost:8000",
    ADMIN_EMAILS=ADMIN_EMAIL,
    ALLOWED_EMAIL_DOMAIN="arcitech.ai",
    ALLOWED_EMAIL_EXCEPTIONS="",
    CORS_ORIGINS="*",
    HTTPS_ONLY="false",
    SWEEP_INTERVAL_SECONDS="1",
)

import itsdangerous  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import models, ratelimit  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402


def make_session_cookie(email: str, name: str = "Test User", is_admin: bool | None = None) -> str:
    """Forge the exact cookie Starlette's SessionMiddleware would set, so tests
    exercise the real middleware + get_current_user path (no dependency stubbing)."""
    if is_admin is None:
        is_admin = email.lower() in settings.admin_emails_set
    payload = {"user": {"email": email, "name": name, "is_admin": is_admin}}
    data = base64.b64encode(json.dumps(payload).encode("utf-8"))
    signed = itsdangerous.TimestampSigner(str(TEST_SECRET)).sign(data)
    return signed.decode("utf-8")


@pytest.fixture(scope="session")
def client():
    # `with` block is required: it runs the lifespan (create_all + sweep loop).
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def clean_state():
    """Wipe rows + the in-process rate limiter between tests so ordering never
    couples one test to another (submit limit is 10/60s per IP)."""
    ratelimit._hits.clear()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(table.delete())
        db.commit()
    finally:
        db.close()
    yield
    ratelimit._hits.clear()


def as_(client, email, name="Test User", is_admin=None):
    """Point the shared client at a given identity.

    Must clear first: the server echoes a Set-Cookie scoped to domain
    "testserver", and httpx would keep that alongside a domain-less cookie we
    set by hand, sending both and letting the stale one win."""
    client.cookies.clear()
    client.cookies.set("peerrank_session", make_session_cookie(email, name, is_admin))
    return client


def anon(client):
    client.cookies.clear()
    return client


ROSTER = [
    {"name": "Alice", "email": "alice@arcitech.ai"},
    {"name": "Bob", "email": "bob@arcitech.ai"},
    {"name": "Carol", "email": "carol@arcitech.ai"},
]


@pytest.fixture
def poll(client):
    """A fresh open poll created by the admin. Returns the create-poll payload."""
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.post(
        "/api/polls",
        json={"name": "Q3 Peer Review", "members": ROSTER, "duration_minutes": 60},
    )
    assert r.status_code == 201, r.text
    return r.json()


def member_id(poll_json, display_name):
    return next(m["id"] for m in poll_json["members"] if m["display_name"] == display_name)
