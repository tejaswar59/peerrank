"""The entire API. No accounts, no login.

  * One person creates a poll: a question, a fixed roster of names, a timer.
    They get back TWO secrets: vote_token (share this) and admin_token
    (private — see app/models.py's Poll docstring for why these are kept
    structurally separate; results can only ever be fetched with admin_token).
  * Anyone who opens the vote_token link picks their own name off the roster,
    ranks everyone else, and submits.
  * The poll closes itself the moment the timer runs out OR everyone on the
    roster has voted, whichever happens first (see app/scheduler.py for the
    timer side; submit_ballot below handles the all-voted side instantly).

Note there is deliberately NO endpoint that returns an individual ballot —
that data path does not exist (see app/models.py's anonymity-wall docstring).
"""
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user, require_admin
from ..config import settings
from ..database import get_db
from ..models import utcnow
from ..ratelimit import rate_limit
from ..results import close_poll
from ..schemas import (
    BallotPageOut,
    CandidateOut,
    PollIn,
    PollOut,
    PollStatusOut,
    PollSummaryOut,
    ResultOut,
    RosterMemberStatus,
    VoteIn,
)

router = APIRouter(prefix="/api", tags=["polls"])


def _norm(name: str) -> str:
    """Normalised form for case-insensitive, whitespace-insensitive name compare."""
    return " ".join(name.split()).lower()


def _make_token(db: Session, column) -> str:
    """Short 6-char slug, unique against the given Poll column (vote_token or
    admin_token — both draw from the same alphabet/length, so one helper)."""
    alphabet = "abcdefghijkmnopqrstuvwxyz23456789"  # no 0/O, 1/l/I — easy to type
    for _ in range(30):
        token = "".join(secrets.choice(alphabet) for _ in range(6))
        if not db.scalar(select(models.Poll.id).where(column == token)):
            return token
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate a link")


def _get_poll(db: Session, token: str) -> models.Poll:
    """Look up by the PUBLIC vote_token. Never accepts admin_token — keeping
    these two lookups structurally separate is what makes admin_token an
    actual access boundary rather than a UI convention."""
    poll = db.scalar(select(models.Poll).where(models.Poll.vote_token == token))
    if poll is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That link doesn't match a poll")
    return poll


def _get_poll_by_admin_token(db: Session, admin_token: str) -> models.Poll:
    poll = db.scalar(select(models.Poll).where(models.Poll.admin_token == admin_token))
    if poll is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That admin link doesn't match a poll")
    return poll


def _roster(db: Session, poll_id: int) -> list[models.Candidate]:
    return db.scalars(
        select(models.Candidate)
        .where(models.Candidate.poll_id == poll_id)
        .order_by(models.Candidate.id)
    ).all()


def _voted_ids(db: Session, poll_id: int) -> set[int]:
    return set(
        db.scalars(
            select(models.ParticipationLog.member_id).where(
                models.ParticipationLog.poll_id == poll_id
            )
        ).all()
    )


def _maybe_close_if_expired(db: Session, poll: models.Poll) -> None:
    """A visitor can land on an already-expired-but-not-yet-swept poll between
    background sweeps; close it right away instead of making them wait."""
    if poll.status == "open" and poll.closes_at <= utcnow():
        close_poll(db, poll)


def _create_poll(
    db: Session, name: str, members: list[dict], duration_minutes: int, created_by_email: str | None
) -> models.Poll:
    """Shared validation + creation logic for both a fresh poll and a
    duplicate — the two only differ in where members/name come from.
    `members` is a list of {"name": str, "email": str}."""
    name = name.strip()
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Poll name cannot be empty")
    if not (settings.min_duration_minutes <= duration_minutes <= settings.max_duration_minutes):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Timer must be between {settings.min_duration_minutes} and "
            f"{settings.max_duration_minutes} minutes.",
        )

    seen_emails: set[str] = set()
    seen_names: set[str] = set()
    unique_members: list[tuple[str, str]] = []
    for m in members:
        cleaned_name = m["name"].strip()
        cleaned_email = m["email"].strip().lower()
        if not cleaned_name or not cleaned_email:
            continue
        if cleaned_email in seen_emails:
            continue
        norm_name = _norm(cleaned_name)
        if norm_name in seen_names:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Duplicate display name: {cleaned_name}",
            )
        seen_emails.add(cleaned_email)
        seen_names.add(norm_name)
        unique_members.append((cleaned_name, cleaned_email))

    if len(unique_members) < 3:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Add at least 3 different members before creating the poll.",
        )

    now = utcnow()
    poll = models.Poll(
        name=name,
        vote_token=_make_token(db, models.Poll.vote_token),
        admin_token=_make_token(db, models.Poll.admin_token),
        duration_minutes=duration_minutes,
        closes_at=models.Poll.compute_closes_at(duration_minutes, now),
        status="open",
        created_at=now,
        created_by_email=created_by_email,
    )
    db.add(poll)
    db.flush()  # assign poll.id before adding members
    for member_name, member_email in unique_members:
        poll.members.append(models.Candidate(display_name=member_name, email=member_email))
    db.commit()
    db.refresh(poll)
    return poll


# ---------------- my polls (admin-scoped) ----------------
@router.get("/polls/mine", response_model=list[PollSummaryOut])
def my_polls(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    """Polls created by the calling admin, newest first. Powers the
    'Your polls' section on the Landing page."""
    polls = db.scalars(
        select(models.Poll)
        .where(models.Poll.created_by_email == admin["email"])
        .order_by(models.Poll.created_at.desc())
    ).all()
    summaries = []
    for poll in polls:
        _maybe_close_if_expired(db, poll)
        total = db.scalar(
            select(func.count()).select_from(models.Candidate)
            .where(models.Candidate.poll_id == poll.id)
        ) or 0
        voted = db.scalar(
            select(func.count()).select_from(models.ParticipationLog)
            .where(models.ParticipationLog.poll_id == poll.id)
        ) or 0
        has_results = db.scalar(
            select(models.ResultSnapshot.id)
            .where(models.ResultSnapshot.poll_id == poll.id)
        ) is not None
        summaries.append(PollSummaryOut(
            id=poll.id,
            name=poll.name,
            status=poll.status,
            created_at=poll.created_at,
            closes_at=poll.closes_at,
            duration_minutes=poll.duration_minutes,
            created_by_email=poll.created_by_email,
            total_members=total,
            voted_count=voted,
            has_results=has_results,
        ))
    return summaries


# ---------------- create ----------------
@router.post(
    "/polls",
    response_model=PollOut,
    status_code=201,
    dependencies=[Depends(rate_limit(settings.create_rate_max, settings.create_rate_window, bucket="create"))],
)
def create_poll(body: PollIn, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    members = [{"name": m.name, "email": m.email} for m in body.members]
    return _create_poll(db, body.name, members, body.duration_minutes, admin["email"])


# ---------------- the link: status / select-name / rank / submit / results ----------------
@router.get("/polls/{token}/status", response_model=PollStatusOut)
def poll_status(token: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Powers both the "select your name" screen and the creator's live count.
    Identity-bound: only someone whose signed-in email is on the roster can
    view the poll at all."""
    poll = _get_poll(db, token)
    _maybe_close_if_expired(db, poll)
    roster = _roster(db, poll.id)
    me = next((m for m in roster if m.email.lower() == user["email"].lower()), None)
    if me is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You are not on this poll's roster")
    voted = _voted_ids(db, poll.id)
    remaining = max(0, int((poll.closes_at - utcnow()).total_seconds())) if poll.status == "open" else 0
    return PollStatusOut(
        name=poll.name,
        status=poll.status,
        closes_at=poll.closes_at,
        seconds_remaining=remaining,
        total_members=len(roster),
        voted_count=len(voted),
        my_member_id=me.id,
        members=[
            RosterMemberStatus(id=m.id, display_name=m.display_name, voted=m.id in voted)
            for m in roster
        ],
    )


@router.get("/polls/{token}/candidates/{member_id}", response_model=BallotPageOut)
def candidates_for(token: str, member_id: int, db: Session = Depends(get_db),
                   user: dict = Depends(get_current_user)):
    """After picking a name, the ranking screen for THAT name — everyone else,
    self excluded. Rejects a name that's already voted so the same identity
    can't be reused to peek at the form twice."""
    poll = _get_poll(db, token)
    _maybe_close_if_expired(db, poll)
    roster = _roster(db, poll.id)
    me = next((m for m in roster if m.id == member_id), None)
    if me is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That name isn't on this poll")
    if user["email"].lower() != me.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only vote as yourself")
    if poll.status != "open":
        raise HTTPException(status.HTTP_409_CONFLICT, "Voting has closed")
    if member_id in _voted_ids(db, poll.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already voted as this name")
    return BallotPageOut(
        poll_name=poll.name,
        member_id=me.id,
        member_name=me.display_name,
        status=poll.status,
        closes_at=poll.closes_at,
        candidates=[CandidateOut(id=m.id, display_name=m.display_name) for m in roster if m.id != member_id],
    )


@router.post(
    "/polls/{token}/vote",
    status_code=201,
    dependencies=[Depends(rate_limit(settings.submit_rate_max, settings.submit_rate_window, bucket="submit"))],
)
def submit_ballot(token: str, body: VoteIn, db: Session = Depends(get_db),
                  user: dict = Depends(get_current_user)):
    poll = _get_poll(db, token)
    _maybe_close_if_expired(db, poll)
    if poll.status != "open":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Voting is not open")

    roster = _roster(db, poll.id)
    roster_ids = {m.id for m in roster}
    if body.member_id not in roster_ids:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That name isn't on this poll")

    me = next(m for m in roster if m.id == body.member_id)
    if user["email"].lower() != me.email.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only vote as yourself")

    # --- validate the ranking: exactly everyone else, no self, no dupes/strangers ---
    expected = roster_ids - {body.member_id}
    submitted = body.ranked_member_ids
    if len(submitted) != len(set(submitted)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Duplicate entries in ranking")
    if set(submitted) != expected:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Ranking must include everyone else on the list exactly once (and not yourself)",
        )

    # --- one transaction: participation flag + anonymous ballot, together ---
    # The unique(poll_id, member_id) constraint is the real duplicate-vote
    # guard: two simultaneous submits for the same picked name can't both insert.
    db.add(models.ParticipationLog(poll_id=poll.id, member_id=body.member_id))
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This name has already voted")

    # Ballot carries NO identity — it is not linkable to the row just inserted.
    db.add(models.Ballot(poll_id=poll.id, ranked_member_ids=submitted))

    # Admin transparency record: who voted and what they voted (non-anonymous companion).
    # No FK to Ballot — the two tables share only poll_id and content, not any row link.
    db.add(models.AdminVoteRecord(
        poll_id=poll.id,
        voter_email=user["email"],
        voter_display_name=me.display_name,
        ranked_member_ids=submitted,
    ))

    db.commit()

    # Auto-close the moment EVERY name has voted: freeze the results
    # immediately instead of waiting for the timer.
    voted_count = db.scalar(
        select(func.count())
        .select_from(models.ParticipationLog)
        .where(models.ParticipationLog.poll_id == poll.id)
    ) or 0
    if poll.status == "open" and voted_count >= len(roster):
        close_poll(db, poll)

    return {"status": "submitted"}


def _result_out(db: Session, poll: models.Poll) -> ResultOut:
    """Shared by both the admin_token-keyed and poll_id-keyed results
    endpoints — same snapshot lookup either way."""
    if poll.status != "closed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Results available after the poll closes")
    snapshot = db.scalar(
        select(models.ResultSnapshot).where(models.ResultSnapshot.poll_id == poll.id)
    )
    if snapshot is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Results not computed yet")
    from ..results import ballot_count
    return ResultOut(
        poll_name=poll.name,
        computed_at=snapshot.computed_at,
        vote_count=ballot_count(db, poll.id),
        ranking=snapshot.ranked_output,
    )


# ---------------- admin-only: results ----------------
# Deliberately NOT under /polls/{vote_token}/... — a voter's link can never
# reach this. See app/models.py's Poll docstring for why admin_token exists.
@router.get("/admin/{admin_token}/results", response_model=ResultOut)
def poll_results(admin_token: str, db: Session = Depends(get_db)):
    """The creator's leaderboard — available once the poll has closed, either
    by the timer or by everyone having voted. Nobody who only has the voter
    link can reach this endpoint; there is no vote_token variant of it."""
    poll = _get_poll_by_admin_token(db, admin_token)
    _maybe_close_if_expired(db, poll)
    return _result_out(db, poll)
