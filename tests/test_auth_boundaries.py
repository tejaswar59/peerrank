"""Auth boundaries: every admin route must reject anonymous (401) and
signed-in-non-admin (403). Plus vote_token / admin_token separation."""
import pytest

from tests.conftest import ADMIN_EMAIL, ROSTER, anon, as_

NON_ADMIN = "alice@arcitech.ai"


def admin_routes(poll):
    """(method, path) for every route CLAUDE.md marks **admin**."""
    pid = poll["id"]
    return [
        ("POST", "/api/polls", {"name": "x", "members": ROSTER, "duration_minutes": 5}),
        ("GET", "/api/polls/mine", None),
        ("GET", "/api/admin/polls", None),
        ("GET", f"/api/admin/polls/{pid}", None),
        ("GET", f"/api/admin/polls/{pid}/results", None),
        ("POST", f"/api/admin/polls/{pid}/duplicate",
         {"name": "dup", "members": ROSTER, "duration_minutes": 5}),
        ("GET", f"/api/admin/{poll['admin_token']}/votes", None),
    ]


def test_anonymous_gets_401_on_every_admin_route(client, poll):
    routes = admin_routes(poll)
    anon(client)
    failures = []
    for method, path, body in routes:
        r = client.request(method, path, json=body)
        if r.status_code != 401:
            failures.append((method, path, r.status_code))
    assert not failures, f"anonymous did not get 401: {failures}"


def test_non_admin_gets_403_on_every_admin_route(client, poll):
    routes = admin_routes(poll)
    as_(client, NON_ADMIN, "Alice")
    failures = []
    for method, path, body in routes:
        r = client.request(method, path, json=body)
        if r.status_code != 403:
            failures.append((method, path, r.status_code, r.text[:120]))
    assert not failures, f"signed-in non-admin did not get 403: {failures}"


def test_voter_cannot_create_a_poll(client):
    as_(client, NON_ADMIN, "Alice")
    r = client.post(
        "/api/polls", json={"name": "sneaky", "members": ROSTER, "duration_minutes": 5}
    )
    assert r.status_code == 403, r.text


def test_is_admin_claim_in_cookie_is_trusted_only_from_signed_cookie(client, poll):
    """The session cookie is signed; a tampered payload must not grant admin."""
    anon(client)
    client.cookies.set("peerrank_session", "eyJ1c2VyIjp7ImlzX2FkbWluIjp0cnVlfX0=.bogus.sig")
    r = client.get("/api/admin/polls")
    assert r.status_code == 401, r.text


# ---------- voter routes require sign-in too ----------
@pytest.mark.parametrize("path_tpl", [
    "/api/polls/{vt}/status",
    "/api/polls/{vt}/candidates/1",
])
def test_voter_routes_require_signin(client, poll, path_tpl):
    anon(client)
    r = client.get(path_tpl.format(vt=poll["vote_token"]))
    assert r.status_code == 401, r.text


def test_vote_submit_requires_signin(client, poll):
    anon(client)
    r = client.post(f"/api/polls/{poll['vote_token']}/vote",
                    json={"member_id": 1, "ranked_member_ids": [2, 3]})
    assert r.status_code == 401, r.text


def test_non_roster_signed_in_user_cannot_see_poll(client, poll):
    as_(client, "stranger@arcitech.ai", "Stranger")
    r = client.get(f"/api/polls/{poll['vote_token']}/status")
    assert r.status_code == 403, r.text


# ---------- token separation, both directions ----------
def test_vote_token_does_not_work_on_admin_results(client, poll):
    # Signed in, so a 404 proves the token lookup rejected a vote_token rather
    # than the request simply bouncing off the session requirement.
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(f"/api/admin/{poll['vote_token']}/results")
    assert r.status_code == 404, r.text


def test_admin_results_requires_a_session(client, poll):
    """admin_token is the authorising secret, but it is not a bearer credential
    on its own - a 6-char token in a URL must not be enough by itself."""
    anon(client)
    r = client.get(f"/api/admin/{poll['admin_token']}/results")
    assert r.status_code == 401, r.text


def test_vote_token_does_not_work_on_admin_votes(client, poll):
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(f"/api/admin/{poll['vote_token']}/votes")
    assert r.status_code == 404, r.text


def test_admin_token_does_not_work_on_voter_routes(client, poll):
    as_(client, "alice@arcitech.ai", "Alice")
    at = poll["admin_token"]
    assert client.get(f"/api/polls/{at}/status").status_code == 404
    assert client.get(f"/api/polls/{at}/candidates/1").status_code == 404
    assert client.post(f"/api/polls/{at}/vote",
                       json={"member_id": 1, "ranked_member_ids": [2, 3]}).status_code == 404
