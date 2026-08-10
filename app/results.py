"""Close a poll and freeze its leaderboard. Idempotent: computing twice returns
the existing snapshot rather than recomputing (results stay exactly as announced)."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .models import utcnow
from .scoring import compute_ranking


def ballot_count(db: Session, poll_id: int) -> int:
    """How many ballots were submitted for a poll (== number of voters)."""
    return db.scalar(
        select(func.count()).select_from(models.Ballot).where(
            models.Ballot.poll_id == poll_id
        )
    ) or 0


def compute_and_freeze(db: Session, poll_id: int) -> models.ResultSnapshot:
    """Compute the ranking from ballots and store a ResultSnapshot once."""
    existing = db.scalar(
        select(models.ResultSnapshot).where(
            models.ResultSnapshot.poll_id == poll_id
        )
    )
    if existing:
        return existing  # idempotent

    members = db.scalars(
        select(models.Candidate)
        .where(models.Candidate.poll_id == poll_id)
        .order_by(models.Candidate.id)
    ).all()
    member_ids = [m.id for m in members]
    names = {m.id: m.display_name for m in members}

    ballots = db.scalars(
        select(models.Ballot.ranked_member_ids).where(
            models.Ballot.poll_id == poll_id
        )
    ).all()

    ranking = compute_ranking(ballots, member_ids, names)

    snapshot = models.ResultSnapshot(
        poll_id=poll_id, computed_at=utcnow(), ranked_output=ranking
    )
    db.add(snapshot)
    return snapshot


def close_poll(db: Session, poll: models.Poll) -> models.ResultSnapshot:
    """Flip a poll to closed and freeze results, in one transaction.

    Idempotent: closing an already-closed poll just ensures the snapshot
    exists. This lets the client safely nudge a close the instant the timer
    or all-voted condition is hit, without racing the background sweep."""
    poll.status = "closed"
    snapshot = compute_and_freeze(db, poll.id)
    db.commit()
    db.refresh(snapshot)
    return snapshot
