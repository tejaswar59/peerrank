"""Identity binding and duplicate-vote rejection."""
from tests.conftest import anon, as_, member_id


def test_member_cannot_open_another_members_ranking_form(client, poll):
    bob = member_id(poll, "Bob")
    as_(client, "alice@arcitech.ai", "Alice")
    r = client.get(f"/api/polls/{poll['vote_token']}/candidates/{bob}")
    assert r.status_code == 403, r.text


def test_member_cannot_submit_a_ballot_as_a_different_member(client, poll):
    """BLOCKER if this fails: Alice must not be able to vote as Bob."""
    alice = member_id(poll, "Alice")
    bob = member_id(poll, "Bob")
    carol = member_id(poll, "Carol")
    as_(client, "alice@arcitech.ai", "Alice")
    r = client.post(
        f"/api/polls/{poll['vote_token']}/vote",
        json={"member_id": bob, "ranked_member_ids": [alice, carol]},
    )
    assert r.status_code == 403, f"Alice voted as Bob! status={r.status_code} body={r.text}"
    # and no ballot was recorded
    as_(client, "alice@arcitech.ai", "Alice")
    st = client.get(f"/api/polls/{poll['vote_token']}/status").json()
    assert st["voted_count"] == 0


def test_double_vote_is_rejected(client, poll):
    alice = member_id(poll, "Alice")
    bob = member_id(poll, "Bob")
    carol = member_id(poll, "Carol")
    as_(client, "alice@arcitech.ai", "Alice")
    body = {"member_id": alice, "ranked_member_ids": [bob, carol]}
    r1 = client.post(f"/api/polls/{poll['vote_token']}/vote", json=body)
    assert r1.status_code == 201, r1.text
    r2 = client.post(f"/api/polls/{poll['vote_token']}/vote", json=body)
    assert r2.status_code == 409, f"double vote accepted: {r2.status_code} {r2.text}"
    st = client.get(f"/api/polls/{poll['vote_token']}/status").json()
    assert st["voted_count"] == 1


def test_ranking_must_be_exactly_everyone_else(client, poll):
    alice = member_id(poll, "Alice")
    bob = member_id(poll, "Bob")
    carol = member_id(poll, "Carol")
    vt = poll["vote_token"]
    as_(client, "alice@arcitech.ai", "Alice")
    # self included
    assert client.post(f"/api/polls/{vt}/vote",
                       json={"member_id": alice, "ranked_member_ids": [alice, bob, carol]}
                       ).status_code == 400
    # duplicate entry
    assert client.post(f"/api/polls/{vt}/vote",
                       json={"member_id": alice, "ranked_member_ids": [bob, bob]}
                       ).status_code == 400
    # incomplete
    assert client.post(f"/api/polls/{vt}/vote",
                       json={"member_id": alice, "ranked_member_ids": [bob]}
                       ).status_code == 400
    # stranger id
    assert client.post(f"/api/polls/{vt}/vote",
                       json={"member_id": alice, "ranked_member_ids": [bob, 99999]}
                       ).status_code == 400


def test_results_unavailable_before_close(client, poll):
    as_(client, "admin@arcitech.ai", "Admin")
    r = client.get(f"/api/admin/{poll['admin_token']}/results")
    assert r.status_code == 409, r.text
