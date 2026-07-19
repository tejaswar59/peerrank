"""Voter API: resolve a voting link, see rankable teammates, submit one ballot.

Self-exclusion and the window check happen SERVER-SIDE. The client is never
trusted to filter itself out of the roster or to honor the deadline.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..auth import SessionUser, current_user
from ..config import settings
from ..database import get_db
from ..models import utcnow
from ..ratelimit import rate_limit
from ..results import ballot_count
from ..schemas import (
    BallotIn,
    CandidateOut,
    ResultOut,
    VotePageOut,
)

router = APIRouter(prefix="/api/vote", tags=["voting"])


def _round_by_token(db: Session, token: str) -> models.VotingRound:
    rnd = db.scalar(
        select(models.VotingRound).where(models.VotingRound.vote_token == token)
    )
    if rnd is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Voting link not found")
    return rnd


def _roster(db: Session, team_id: int) -> list[models.TeamMember]:
    return db.scalars(
        select(models.TeamMember)
        .where(models.TeamMember.team_id == team_id)
        .order_by(models.TeamMember.id)
    ).all()


def _require_eligible(
    db: Session, rnd: models.VotingRound, email: str
) -> list[models.TeamMember]:
    """Fresh, server-side allowlist check on every request. Returns the roster."""
    roster = _roster(db, rnd.team_id)
    if email not in {m.email for m in roster}:
        # Being signed in proves identity, not membership in THIS round.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not on this team")
    return roster


@router.get("/{token}", response_model=VotePageOut)
def get_vote_page(
    token: str, db: Session = Depends(get_db), user: SessionUser = Depends(current_user)
):
    rnd = _round_by_token(db, token)
    roster = _require_eligible(db, rnd, user.email)

    already = db.scalar(
        select(models.ParticipationLog.id).where(
            models.ParticipationLog.round_id == rnd.id,
            models.ParticipationLog.email == user.email,
        )
    )
    # Self-exclusion at the query level: you never receive yourself as a candidate.
    candidates = [
        CandidateOut(id=m.id, display_name=m.display_name, email=m.email)
        for m in roster
        if m.email != user.email
    ]
    return VotePageOut(
        round_id=rnd.id,
        round_name=rnd.name,
        team_name=rnd.team.name,
        signed_in_as=user.email,
        end_at=rnd.end_at,
        status=rnd.status,
        already_voted=already is not None,
        candidates=candidates,
    )


@router.post("/{token}", status_code=201)
def submit_ballot(
    token: str,
    body: BallotIn,
    db: Session = Depends(get_db),
    user: SessionUser = Depends(current_user),
    _: None = Depends(
        rate_limit(settings.submit_rate_max, settings.submit_rate_window, bucket="submit")
    ),
):
    rnd = _round_by_token(db, token)
    roster = _require_eligible(db, rnd, user.email)

    # --- window enforcement: server clock is the only clock that counts ---
    now = utcnow()
    if rnd.status != "open" or now < rnd.start_at or now > rnd.end_at:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Voting is not open")

    # --- validate the ranking: exactly the teammates, no self, no dupes/strangers ---
    expected = {m.id for m in roster if m.email != user.email}
    submitted = body.ranked_member_ids
    if len(submitted) != len(set(submitted)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate entries in ranking")
    if set(submitted) != expected:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Ranking must include every teammate exactly once (and not yourself)",
        )

    # --- one transaction: participation flag + anonymous ballot, together ---
    # The unique(round_id, email) constraint is the real duplicate-vote guard:
    # two simultaneous submits from two tabs cannot both insert.
    db.add(models.ParticipationLog(round_id=rnd.id, email=user.email))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "You have already voted")

    # Ballot carries NO identity — it is not linkable to the row just inserted.
    db.add(models.Ballot(round_id=rnd.id, ranked_member_ids=submitted))
    db.commit()
    return {"status": "submitted"}


@router.get("/{token}/results", response_model=ResultOut)
def voter_results(
    token: str, db: Session = Depends(get_db), user: SessionUser = Depends(current_user)
):
    """Members can see the frozen leaderboard once the round is closed."""
    rnd = _round_by_token(db, token)
    _require_eligible(db, rnd, user.email)
    if rnd.status != "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Results available after close")
    snapshot = db.scalar(
        select(models.ResultSnapshot).where(models.ResultSnapshot.round_id == rnd.id)
    )
    if snapshot is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Results not computed yet")
    votes = ballot_count(db, rnd.id)
    if votes < settings.min_result_voters:
        so_far = f"{votes} {'person has' if votes == 1 else 'people have'} voted so far."
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Results stay hidden until at least {settings.min_result_voters} "
            f"teammates vote. {so_far}",
        )
    return ResultOut(
        round_id=rnd.id, computed_at=snapshot.computed_at, ranking=snapshot.ranked_output
    )
