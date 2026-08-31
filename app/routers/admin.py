"""Admin-only endpoints: vote transparency list, dashboard, and poll duplication."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..auth import require_admin
from ..database import get_db
from ..routers.polls import _create_poll, _get_poll_by_admin_token, _maybe_close_if_expired, _result_out
from ..schemas import (
    AdminVoteOut,
    DuplicateIn,
    MemberDetail,
    PollDetailOut,
    PollOut,
    PollSummaryOut,
    RankedMemberOut,
    ResultOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _get_poll_by_id(db: Session, poll_id: int) -> models.Poll:
    poll = db.get(models.Poll, poll_id)
    if poll is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No poll with that id")
    return poll


@router.get("/{admin_token}/votes", response_model=list[AdminVoteOut])
def admin_votes(
    admin_token: str,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    poll = _get_poll_by_admin_token(db, admin_token)
    candidates = db.scalars(
        select(models.Candidate)
        .where(models.Candidate.poll_id == poll.id)
        .order_by(models.Candidate.id)
    ).all()
    name_map = {c.id: c.display_name for c in candidates}

    records = db.scalars(
        select(models.AdminVoteRecord)
        .where(models.AdminVoteRecord.poll_id == poll.id)
        .order_by(models.AdminVoteRecord.voted_at)
    ).all()

    return [
        AdminVoteOut(
            voter_email=rec.voter_email,
            display_name=rec.voter_display_name,
            ranked_members=[
                RankedMemberOut(rank=i + 1, member_id=mid, name=name_map.get(mid, f"#{mid}"))
                for i, mid in enumerate(rec.ranked_member_ids)
            ],
        )
        for rec in records
    ]


@router.get("/polls", response_model=list[PollSummaryOut])
def list_polls(db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """The dashboard: every poll any admin has created, newest first."""
    polls = db.scalars(select(models.Poll).order_by(models.Poll.created_at.desc())).all()
    summaries = []
    for poll in polls:
        _maybe_close_if_expired(db, poll)
        total_members = db.scalar(
            select(func.count()).select_from(models.Candidate).where(models.Candidate.poll_id == poll.id)
        ) or 0
        voted_count = db.scalar(
            select(func.count()).select_from(models.ParticipationLog).where(
                models.ParticipationLog.poll_id == poll.id
            )
        ) or 0
        has_results = db.scalar(
            select(models.ResultSnapshot.id).where(models.ResultSnapshot.poll_id == poll.id)
        ) is not None
        summaries.append(
            PollSummaryOut(
                id=poll.id,
                name=poll.name,
                status=poll.status,
                created_at=poll.created_at,
                closes_at=poll.closes_at,
                duration_minutes=poll.duration_minutes,
                created_by_email=poll.created_by_email,
                total_members=total_members,
                voted_count=voted_count,
                has_results=has_results,
            )
        )
    return summaries


@router.get("/polls/{poll_id}", response_model=PollDetailOut)
def poll_detail(poll_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    """Just enough to pre-fill the duplicate-poll form."""
    poll = _get_poll_by_id(db, poll_id)
    roster = db.scalars(
        select(models.Candidate).where(models.Candidate.poll_id == poll.id).order_by(models.Candidate.id)
    ).all()
    return PollDetailOut(
        id=poll.id,
        name=poll.name,
        status=poll.status,
        members=[{"name": m.display_name, "email": m.email} for m in roster],
    )


@router.get("/polls/{poll_id}/results", response_model=ResultOut)
def poll_results_by_id(poll_id: int, db: Session = Depends(get_db), _admin: dict = Depends(require_admin)):
    poll = _get_poll_by_id(db, poll_id)
    _maybe_close_if_expired(db, poll)
    return _result_out(db, poll)


@router.post("/polls/{poll_id}/duplicate", response_model=PollOut, status_code=201)
def duplicate_poll(
    poll_id: int,
    body: DuplicateIn,
    db: Session = Depends(get_db),
    admin: dict = Depends(require_admin),
):
    _get_poll_by_id(db, poll_id)  # 404s if the source poll doesn't exist
    members = [{"name": m.name, "email": m.email} for m in body.members]
    return _create_poll(db, body.name, members, body.duration_minutes, admin["email"])
