"""GET /api/polls/default-roster — the standing roster the create form pre-fills.

Covers the admin guard, the DEFAULT_ROSTER env override's parsing rules, and the
routing hazard: this literal path sits next to /polls/{token}/... routes, so it
must never be matched as a vote token (or shadow one).
"""
import pytest

from app.config import settings
from tests.conftest import ADMIN_EMAIL, anon, as_

ENDPOINT = "/api/polls/default-roster"

BUILTIN = [
    ("Anand Torati", "anand@arcitech.ai"),
    ("Ayushi Nigudkar", "ayushi@arcitech.ai"),
    ("Devesh Mathakar", "devesh@arcitech.ai"),
    ("Dhairyashil Pawar", "dhairyashil@arcitech.ai"),
    ("Hassaan Siddique", "hassaan@arcitech.ai"),
    ("Karthik Poojary", "karthik@arcitech.ai"),
    ("Mahesh Swami", "mahesh@arcitech.ai"),
    ("Prasad Barsinge", "prasad@arcitech.ai"),
    ("Prateek Karkera", "prateek@arcitech.ai"),
    ("Romit Addagatla", "romit@arcitech.ai"),
    ("Saurav Kothale", "saurav@arcitech.ai"),
    ("Shubham Sah", "shubham@arcitech.ai"),
    ("Sopan Kshirsagar", "sopan.kshirsagar@arcitech.ai"),
    ("Tejaswar Yambadi", "tejaswar@arcitech.ai"),
    ("Utkarsh Desai", "utkarsh@arcitech.ai"),
]


@pytest.fixture
def roster_env(monkeypatch):
    """Set DEFAULT_ROSTER on the live Settings instance. `default_roster_list`
    is a property, so patching the field is enough — no re-import needed."""
    def _set(value: str):
        monkeypatch.setattr(settings, "default_roster", value)
    return _set


# ---------- the built-in fallback ----------
def test_admin_gets_all_seven_builtin_members_in_order(client, roster_env):
    roster_env("")  # empty env var -> built-in list
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    members = r.json()["members"]
    assert [(m["name"], m["email"]) for m in members] == BUILTIN


# ---------- auth boundary: same guard as poll creation ----------
def test_anonymous_gets_401(client):
    anon(client)
    assert client.get(ENDPOINT).status_code == 401


def test_signed_in_non_admin_gets_403(client):
    as_(client, "alice@arcitech.ai", "Alice")
    assert client.get(ENDPOINT).status_code == 403


# ---------- DEFAULT_ROSTER override ----------
def test_env_override_replaces_builtin_list(client, roster_env):
    roster_env("Zoe Quill <ZOE@arcitech.ai>,  Ada Byron <ada@arcitech.ai>  ")
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    assert r.json()["members"] == [
        {"name": "Zoe Quill", "email": "zoe@arcitech.ai"},  # email lowercased
        {"name": "Ada Byron", "email": "ada@arcitech.ai"},
    ]


def test_malformed_entries_are_skipped_not_raised(client, roster_env):
    roster_env("no-brackets@arcitech.ai,Good One <good@arcitech.ai>,,<@>,Broken <nope>")
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    assert r.json()["members"] == [{"name": "Good One", "email": "good@arcitech.ai"}]


def test_fully_malformed_value_yields_empty_list_not_500(client, roster_env):
    roster_env("garbage,,,<<>>,also garbage")
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    assert r.json()["members"] == []


def test_duplicate_emails_are_deduped_first_wins(client, roster_env):
    roster_env(
        "First Label <dup@arcitech.ai>,Second Label <DUP@arcitech.ai>,"
        "Other <other@arcitech.ai>"
    )
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    assert r.json()["members"] == [
        {"name": "First Label", "email": "dup@arcitech.ai"},
        {"name": "Other", "email": "other@arcitech.ai"},
    ]


# ---------- routing hazard ----------
def test_default_roster_is_not_matched_as_a_vote_token(client, poll, roster_env):
    """If the literal route were shadowed by /polls/{token}/..., or if a token
    route were registered first, this would 404 as an unknown poll instead of
    returning the roster."""
    roster_env("")
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(ENDPOINT)
    assert r.status_code == 200, r.text
    assert len(r.json()["members"]) == len(BUILTIN)

    # And the reverse direction: the literal path must not shadow real tokens.
    s = client.get(f"/api/polls/{poll['vote_token']}/status")
    assert s.status_code == 200, s.text


def test_no_poll_named_default_roster_is_reachable(client):
    """There is no GET /api/polls/{token} route, so the only single-segment
    match under /api/polls is the literal one; a bogus sibling still 404s."""
    as_(client, ADMIN_EMAIL, "Admin")
    assert client.get("/api/polls/default-roster/status").status_code == 404
