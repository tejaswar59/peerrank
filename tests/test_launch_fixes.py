"""Regression tests for the pre-launch blocker fixes.

Each test here maps to a defect found in the launch audit. They exist so the
specific failure mode cannot come back unnoticed.
"""
from tests.conftest import ADMIN_EMAIL, anon, as_, member_id


# ---------- off-roster creator can still see the live view ----------
def test_creator_not_on_roster_can_read_status(client, poll):
    """A manager running a ranking for a team they aren't part of is not on the
    roster. They must still get status, or PollLiveView renders empty forever."""
    as_(client, ADMIN_EMAIL, "Admin")  # ADMIN_EMAIL is not in ROSTER
    r = client.get(f"/api/polls/{poll['vote_token']}/status")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["my_member_id"] is None, "off-roster viewer must not be offered a ballot"
    assert body["total_members"] == 3


def test_off_roster_non_admin_still_blocked(client, poll):
    """The fix above must not open status up to any signed-in user."""
    as_(client, "stranger@arcitech.ai", "Stranger")
    r = client.get(f"/api/polls/{poll['vote_token']}/status")
    assert r.status_code == 403, r.text


def test_off_roster_creator_cannot_vote(client, poll):
    """Reading status is not permission to submit a ballot. Sends a
    well-formed ballot so this reaches the identity gate rather than stopping
    at schema validation."""
    as_(client, ADMIN_EMAIL, "Admin")
    alice, bob, carol = (member_id(poll, n) for n in ("Alice", "Bob", "Carol"))
    r = client.post(
        f"/api/polls/{poll['vote_token']}/vote",
        json={"member_id": alice, "ranked_member_ids": [bob, carol]},
    )
    assert r.status_code == 403, r.text
    assert "yourself" in r.json()["detail"].lower()


# ---------- rate limiting is per-identity, and anonymous hits cost nothing ----------
def test_anonymous_requests_do_not_exhaust_the_vote_limit(client, poll):
    """The limiter is a route-level dependency, so it resolves BEFORE the
    endpoint's get_current_user. If anonymous 401s consumed the bucket, anyone
    could lock every real voter out of a poll."""
    anon(client)
    for _ in range(40):
        r = client.post(
            f"/api/polls/{poll['vote_token']}/vote",
            json={"member_id": 1, "ranked_member_ids": [2, 3]},
        )
        assert r.status_code == 401, r.text

    # A real voter is unaffected by that flood.
    alice = member_id(poll, "Alice")
    as_(client, "alice@arcitech.ai", "Alice")
    r = client.get(f"/api/polls/{poll['vote_token']}/candidates/{alice}")
    assert r.status_code == 200, r.text


def test_one_voter_cannot_exhaust_another_voters_budget(client, poll):
    """Per-user keying: Alice burning her own bucket must not touch Bob's."""
    alice, bob, carol = (member_id(poll, n) for n in ("Alice", "Bob", "Carol"))

    as_(client, "alice@arcitech.ai", "Alice")
    for _ in range(12):
        client.post(
            f"/api/polls/{poll['vote_token']}/vote",
            json={"member_id": alice, "ranked_member_ids": []},  # invalid on purpose
        )

    as_(client, "bob@arcitech.ai", "Bob")
    r = client.post(
        f"/api/polls/{poll['vote_token']}/vote",
        json={"member_id": bob, "ranked_member_ids": [alice, carol]},
    )
    assert r.status_code == 201, r.text
