"""Close a round and freeze its leaderboard. Idempotent: computing twice returns
the existing snapshot rather than recomputing (results stay exactly as announced)."""
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .models import utcnow
from .scoring import compute_ranking


def ballot_count(db: Session, round_id: int) -> int:
    """How many ballots were submitted for a round (== number of voters)."""
    return db.scalar(
        select(func.count()).select_from(models.Ballot).where(
            models.Ballot.round_id == round_id
        )
    ) or 0


def results_are_visible(db: Session, round_id: int) -> bool:
    """Anonymity floor: only reveal a leaderboard once enough people voted."""
    return ballot_count(db, round_id) >= settings.min_result_voters


def compute_and_freeze(db: Session, round_id: int) -> models.ResultSnapshot:
    """Compute the ranking from ballots and store a ResultSnapshot once."""
    existing = db.scalar(
        select(models.ResultSnapshot).where(
            models.ResultSnapshot.round_id == round_id
        )
    )
    if existing:
        return existing  # idempotent

    rnd = db.get(models.VotingRound, round_id)
    if rnd is None:
        raise ValueError(f"round {round_id} not found")

    members = db.scalars(
        select(models.TeamMember)
        .where(models.TeamMember.team_id == rnd.team_id)
        .order_by(models.TeamMember.id)
    ).all()
    member_ids = [m.id for m in members]
    names = {m.id: m.display_name for m in members}

    ballots = db.scalars(
        select(models.Ballot.ranked_member_ids).where(
            models.Ballot.round_id == round_id
        )
    ).all()

    ranking = compute_ranking(ballots, member_ids, names)

    snapshot = models.ResultSnapshot(
        round_id=round_id, computed_at=utcnow(), ranked_output=ranking
    )
    db.add(snapshot)
    return snapshot


def close_round(db: Session, rnd: models.VotingRound, actor_email: str) -> models.ResultSnapshot:
    """Flip a round to closed and freeze results, in one transaction.

    Idempotent: closing an already-closed round just ensures the snapshot exists
    and does not add a second audit entry. This lets the client safely nudge a
    close the instant a window elapses without racing the auto-close sweep."""
    already_closed = rnd.status == "closed"
    rnd.status = "closed"
    snapshot = compute_and_freeze(db, rnd.id)
    if not already_closed:
        db.add(
            models.AuditLog(
                actor_email=actor_email,
                action="round.close",
                detail=f"round={rnd.id} name={rnd.name!r}",
            )
        )
    db.commit()
    db.refresh(snapshot)
    return snapshot
