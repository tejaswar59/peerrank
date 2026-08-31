"""Happy path, close behaviour (sweep loop + on-request close), and the frozen
snapshot. Also asserts the documented non-anonymity of /api/admin/{tok}/votes."""
import time
from datetime import timedelta

from sqlalchemy import select

from app import models
from app.database import SessionLocal
from app.models import utcnow
from tests.conftest import ADMIN_EMAIL, anon, as_, member_id


def _expire(poll_id, seconds=5):
    """Push a poll's closes_at into the past, directly in the DB."""
    db = SessionLocal()
    try:
        p = db.get(models.Poll, poll_id)
        p.closes_at = utcnow() - timedelta(seconds=seconds)
        db.commit()
    finally:
        db.close()


def _status_in_db(poll_id):
    db = SessionLocal()
    try:
        return db.get(models.Poll, poll_id).status
    finally:
        db.close()


def _vote_all(client, poll):
    ids = {m["display_name"]: m["id"] for m in poll["members"]}
    vt = poll["vote_token"]
    # Alice: Bob > Carol | Bob: Carol > Alice | Carol: Bob > Alice
    ballots = {
        "Alice": ["Bob", "Carol"],
        "Bob": ["Carol", "Alice"],
        "Carol": ["Bob", "Alice"],
    }
    for voter, ranking in ballots.items():
        as_(client, f"{voter.lower()}@arcitech.ai", voter)
        r = client.post(vt and f"/api/polls/{vt}/vote", json={
            "member_id": ids[voter],
            "ranked_member_ids": [ids[n] for n in ranking],
        })
        assert r.status_code == 201, (voter, r.status_code, r.text)
    return ids


def test_happy_path_create_vote_autoclose_results(client, poll):
    ids = _vote_all(client, poll)

    # all-voted -> auto-close immediately (no timer wait)
    assert _status_in_db(poll["id"]) == "closed"

    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(f"/api/admin/{poll['admin_token']}/results")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["poll_name"] == "Q3 Peer Review"
    assert data["vote_count"] == 3
    ranking = data["ranking"]
    assert [row["rank"] for row in ranking] == [1, 2, 3]
    assert len({row["points"] for row in ranking}) == 3, "points must be unique"
    assert [row["points"] for row in ranking] == sorted(
        (row["points"] for row in ranking), reverse=True)
    # Bob: 1st,1st -> 3+3=6 raw. Carol: 1st + 2nd -> 3+2=5. Alice: 2nd,2nd -> 4.
    assert [row["display_name"] for row in ranking] == ["Bob", "Carol", "Alice"]
    assert ranking[0]["member_id"] == ids["Bob"]


def test_snapshot_is_frozen_not_recomputed(client, poll):
    _vote_all(client, poll)
    as_(client, ADMIN_EMAIL, "Admin")
    first = client.get(f"/api/admin/{poll['admin_token']}/results").json()

    # Tamper with the underlying ballots after close; results must not change.
    db = SessionLocal()
    try:
        db.execute(models.Ballot.__table__.delete())
        db.commit()
    finally:
        db.close()

    second = client.get(f"/api/admin/{poll['admin_token']}/results").json()
    assert second["ranking"] == first["ranking"], "snapshot was recomputed live"
    assert second["computed_at"] == first["computed_at"]


def test_expired_poll_closes_on_next_request(client, poll):
    _expire(poll["id"])
    assert _status_in_db(poll["id"]) == "open"
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(f"/api/admin/{poll['admin_token']}/results")
    assert r.status_code == 200, r.text
    assert _status_in_db(poll["id"]) == "closed"
    assert r.json()["vote_count"] == 0


def test_expired_poll_closes_via_sweep_loop_without_any_request(client, poll):
    """SWEEP_INTERVAL_SECONDS=1 in conftest; the loop runs inside the lifespan."""
    _expire(poll["id"])
    deadline = time.time() + 10
    while time.time() < deadline:
        if _status_in_db(poll["id"]) == "closed":
            break
        time.sleep(0.25)
    assert _status_in_db(poll["id"]) == "closed", "background sweep never closed the poll"
    db = SessionLocal()
    try:
        snap = db.scalar(select(models.ResultSnapshot).where(
            models.ResultSnapshot.poll_id == poll["id"]))
        assert snap is not None, "sweep closed the poll but froze no snapshot"
    finally:
        db.close()


def test_voting_rejected_after_close(client, poll):
    ids = {m["display_name"]: m["id"] for m in poll["members"]}
    _expire(poll["id"])
    as_(client, "alice@arcitech.ai", "Alice")
    r = client.post(f"/api/polls/{poll['vote_token']}/vote", json={
        "member_id": ids["Alice"],
        "ranked_member_ids": [ids["Bob"], ids["Carol"]],
    })
    assert r.status_code == 403, r.text


def test_admin_votes_list_exposes_voter_identity_by_design(client, poll):
    """CLAUDE.md: AdminVoteRecord deliberately links email -> exact ranking.
    This test documents that the app is NOT anonymous to admins."""
    ids = _vote_all(client, poll)
    as_(client, ADMIN_EMAIL, "Admin")
    r = client.get(f"/api/admin/{poll['admin_token']}/votes")
    assert r.status_code == 200, r.text
    records = r.json()
    assert len(records) == 3
    alice = next(x for x in records if x["voter_email"] == "alice@arcitech.ai")
    assert [m["name"] for m in alice["ranked_members"]] == ["Bob", "Carol"]
    assert [m["rank"] for m in alice["ranked_members"]] == [1, 2]


def test_ballot_table_has_no_identity_columns():
    cols = set(models.Ballot.__table__.columns.keys())
    assert cols == {"id", "poll_id", "ranked_member_ids"}, cols
    forbidden = {"voter_email", "member_id", "user_id", "voted_at", "created_at", "ballot_id"}
    assert not (cols & forbidden)
