"""Admin API: teams, members, voting rounds, participation, results.

Teams are top-level (no project grouping). Every endpoint here requires the
admin role. Note there is deliberately NO endpoint that returns an individual
ballot — that data path does not exist.
"""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..auth import SessionUser, require_admin
from ..database import get_db
from ..results import ballot_count, close_round
from ..schemas import (
    DirectoryUserOut,
    MemberIn,
    MemberOut,
    ParticipationOut,
    ParticipationRow,
    ResultOut,
    RoundIn,
    RoundOut,
    TeamIn,
    TeamOut,
)

router = APIRouter(prefix="/api", tags=["admin"], dependencies=[Depends(require_admin)])

def _make_vote_token(db: Session) -> str:
    """Short 5-digit numeric code (e.g. '04821'), unique across rounds.
    Leading zeros are kept, so all 100k combinations are usable."""
    for _ in range(30):
        token = "".join(secrets.choice("0123456789") for _ in range(5))
        if not db.scalar(
            select(models.VotingRound.id).where(models.VotingRound.vote_token == token)
        ):
            return token
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate token")


def _to_naive_utc(dt: datetime) -> datetime:
    """Normalize any incoming datetime to naive UTC for consistent storage."""
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _audit(db: Session, actor: str, action: str, detail: str = "") -> None:
    db.add(models.AuditLog(actor_email=actor, action=action, detail=detail))


def _norm(name: str) -> str:
    """Normalised form for case-insensitive, whitespace-insensitive name compare."""
    return " ".join(name.split()).lower()


def _directory_names(db: Session, emails: list[str]) -> dict[str, str]:
    """Real display names for any of `emails` that belong to a verified,
    registered (non-admin) account — so picking someone from the "existing
    users" autocomplete shows their actual name on the roster instead of a
    guessed local-part. Anyone not registered (e.g. an external teammate
    added by raw email) is simply absent from the map — callers fall back."""
    if not emails:
        return {}
    rows = db.execute(
        select(models.User.email, models.User.display_name).where(
            models.User.email.in_(emails),
            models.User.role == "member",
            models.User.is_verified.is_(True),
        )
    ).all()
    return {email: name for email, name in rows if name}


@router.get("/users", response_model=list[DirectoryUserOut])
def list_directory_users(db: Session = Depends(get_db)):
    """Verified, non-admin accounts, alphabetical by name — lets an admin pick
    a teammate by typing their name instead of remembering/retyping every
    email. Capped well above any realistic single-org directory size; raise
    the limit (or add search-side pagination) if that ever changes."""
    rows = db.scalars(
        select(models.User)
        .where(models.User.role == "member", models.User.is_verified.is_(True))
        .order_by(func.lower(models.User.display_name))
        .limit(1000)
    ).all()
    return rows


def _soft_delete_teams(db: Session, team_ids: list[int], now) -> None:
    """Mark teams and their members as deleted (data is retained)."""
    if not team_ids:
        return
    db.query(models.TeamMember).filter(models.TeamMember.team_id.in_(team_ids)).update(
        {"deleted_at": now}, synchronize_session=False
    )
    db.query(models.Team).filter(models.Team.id.in_(team_ids)).update(
        {"deleted_at": now}, synchronize_session=False
    )


# ---------------- teams / members ----------------
@router.post("/teams", response_model=TeamOut, status_code=201)
def create_team(
    body: TeamIn,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    name = body.name.strip()
    # No two ACTIVE teams may share a name.
    dup = db.scalar(
        select(models.Team.id).where(
            models.Team.deleted_at.is_(None),
            func.lower(func.trim(models.Team.name)) == _norm(name),
        )
    )
    if dup:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A team named “{name}” already exists."
        )

    # De-dupe up front so the minimum applies to UNIQUE members, not the raw
    # submitted count (someone pasting the same email 3 times shouldn't pass).
    unique_emails: list[str] = list(dict.fromkeys(str(e).lower() for e in body.emails))
    if len(unique_emails) < 3:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "A team needs at least 3 members to create — please add a few more teammates.",
        )

    team = models.Team(name=name)
    db.add(team)
    db.flush()  # assign team.id before adding members
    directory = _directory_names(db, unique_emails)
    seen_names: set[str] = set()
    for addr in unique_emails:
        # Prefer the real name from a registered account (picked via the
        # teammate autocomplete); fall back to guessing from the email for
        # anyone added by raw address. Keep names distinct on the ballot: if
        # the guess collides (e.g. john@a.com & john@b.com), fall back to the
        # full email.
        display = directory.get(addr) or addr.split("@")[0]
        if _norm(display) in seen_names:
            display = addr
        seen_names.add(_norm(display))
        team.members.append(models.TeamMember(email=addr, display_name=display))
    _audit(db, admin.email, "team.create", f"name={body.name!r}")
    db.commit()
    db.refresh(team)
    return team


def _active_members(db: Session, team_id: int) -> list[models.TeamMember]:
    return db.scalars(
        select(models.TeamMember)
        .where(models.TeamMember.team_id == team_id, models.TeamMember.deleted_at.is_(None))
        .order_by(models.TeamMember.id)
    ).all()


def _team_out(db: Session, t: models.Team) -> TeamOut:
    # Built explicitly so soft-deleted members are excluded from the response.
    return TeamOut(
        id=t.id,
        name=t.name,
        members=[
            MemberOut(id=m.id, email=m.email, display_name=m.display_name)
            for m in _active_members(db, t.id)
        ],
    )


@router.get("/teams", response_model=list[TeamOut])
def list_teams(db: Session = Depends(get_db)):
    teams = db.scalars(
        select(models.Team).where(models.Team.deleted_at.is_(None)).order_by(models.Team.id)
    ).all()
    return [_team_out(db, t) for t in teams]


def _get_team(db: Session, team_id: int) -> models.Team:
    team = db.scalar(
        select(models.Team).where(
            models.Team.id == team_id, models.Team.deleted_at.is_(None)
        )
    )
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return team


@router.get("/teams/{team_id}", response_model=TeamOut)
def get_team(team_id: int, db: Session = Depends(get_db)):
    return _team_out(db, _get_team(db, team_id))


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    """Soft-delete a team, its members, and any rounds that used it (rows kept)."""
    _get_team(db, team_id)
    now = models.utcnow()
    db.query(models.VotingRound).filter(models.VotingRound.team_id == team_id).update(
        {"deleted_at": now}, synchronize_session=False
    )
    _soft_delete_teams(db, [team_id], now)
    _audit(db, admin.email, "team.delete", f"team={team_id} (soft)")
    db.commit()


@router.post("/teams/{team_id}/members", response_model=MemberOut, status_code=201)
def add_member(
    team_id: int,
    body: MemberIn,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    team = _get_team(db, team_id)
    addr = str(body.email).lower()
    display = (body.display_name or "").strip()
    if not display:
        display = _directory_names(db, [addr]).get(addr) or addr.split("@")[0]
    # Names must be distinct among ACTIVE members of the team (so ballots are
    # unambiguous). A different active member already using this name → reject.
    name_clash = db.scalar(
        select(models.TeamMember.id).where(
            models.TeamMember.team_id == team_id,
            models.TeamMember.deleted_at.is_(None),
            models.TeamMember.email != addr,
            func.lower(func.trim(models.TeamMember.display_name)) == _norm(display),
        )
    )
    if name_clash:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Someone named “{display}” is already on this team — use a distinct name.",
        )
    # There may be an existing row for this (team, email) — the uq constraint keeps
    # one per pair. Reuse it: 409 if it's active, otherwise reactivate it.
    existing = db.scalar(
        select(models.TeamMember).where(
            models.TeamMember.team_id == team_id, models.TeamMember.email == addr
        )
    )
    if existing is not None:
        if existing.deleted_at is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Member already on team")
        existing.deleted_at = None            # reactivate a previously-removed member
        existing.display_name = display
        member = existing
    else:
        member = models.TeamMember(team_id=team.id, email=addr, display_name=display)
        db.add(member)
    _audit(db, admin.email, "member.add", f"team={team_id} email={addr}")
    db.commit()
    db.refresh(member)
    return member


@router.delete("/teams/{team_id}/members/{member_id}", status_code=204)
def remove_member(
    team_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    member = db.scalar(
        select(models.TeamMember).where(
            models.TeamMember.id == member_id,
            models.TeamMember.team_id == team_id,
            models.TeamMember.deleted_at.is_(None),
        )
    )
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    member.deleted_at = models.utcnow()  # soft delete — row retained
    _audit(db, admin.email, "member.remove", f"team={team_id} id={member_id} (soft)")
    db.commit()


# ---------------- voting rounds ----------------
@router.post("/teams/{team_id}/rounds", response_model=RoundOut, status_code=201)
def create_round(
    team_id: int,
    body: RoundIn,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    team = _get_team(db, team_id)
    if body.team_id != team_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Team id mismatch.")
    if not _active_members(db, team.id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Add at least one member to the team before opening a round."
        )

    start_at = _to_naive_utc(body.start_at)
    end_at = _to_naive_utc(body.end_at)
    if end_at <= start_at:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "The closing time must be after the opening time."
        )

    rnd = models.VotingRound(
        team_id=team.id,
        name=body.name,
        vote_token=_make_vote_token(db),
        start_at=start_at,
        end_at=end_at,
        status="open",
    )
    db.add(rnd)
    _audit(db, admin.email, "round.create", f"team={team_id} name={body.name!r}")
    db.commit()
    db.refresh(rnd)
    return rnd


@router.get("/teams/{team_id}/rounds", response_model=list[RoundOut])
def list_rounds(team_id: int, db: Session = Depends(get_db)):
    _get_team(db, team_id)
    return db.scalars(
        select(models.VotingRound)
        .where(
            models.VotingRound.team_id == team_id,
            models.VotingRound.deleted_at.is_(None),
        )
        .order_by(models.VotingRound.id.desc())
    ).all()


def _get_round(db: Session, round_id: int) -> models.VotingRound:
    rnd = db.scalar(
        select(models.VotingRound).where(
            models.VotingRound.id == round_id, models.VotingRound.deleted_at.is_(None)
        )
    )
    if rnd is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Round not found")
    return rnd


@router.post("/rounds/{round_id}/close")
def close_round_early(
    round_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    # Close + freeze the snapshot, but do NOT return the leaderboard here — the
    # ranking is only served via the results endpoint, which enforces the
    # anonymity floor. Returning it here would bypass that gate.
    rnd = _get_round(db, round_id)
    close_round(db, rnd, admin.email)
    return {
        "status": "closed",
        "votes": ballot_count(db, round_id),
        "results_visible": True,  # results are shown as soon as a round is closed
    }


@router.get("/rounds/{round_id}/participation", response_model=ParticipationOut)
def participation(round_id: int, db: Session = Depends(get_db)):
    """Aggregate counts + per-email voted flag. WHO voted, never WHAT they voted."""
    rnd = _get_round(db, round_id)
    members = _active_members(db, rnd.team_id)
    voted_emails = set(
        db.scalars(
            select(models.ParticipationLog.email).where(
                models.ParticipationLog.round_id == round_id
            )
        ).all()
    )
    rows = [
        ParticipationRow(email=m.email, voted=m.email in voted_emails) for m in members
    ]
    total = len(members)
    submitted = sum(1 for r in rows if r.voted)
    pending = total - submitted
    pct = round((submitted / total) * 100) if total else 0
    return ParticipationOut(
        round_id=round_id,
        total=total,
        submitted=submitted,
        pending=pending,
        completion_pct=pct,
        rows=rows,
    )


@router.get("/rounds/{round_id}/results", response_model=ResultOut)
def get_results(round_id: int, db: Session = Depends(get_db)):
    _get_round(db, round_id)
    snapshot = db.scalar(
        select(models.ResultSnapshot).where(models.ResultSnapshot.round_id == round_id)
    )
    if snapshot is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Results not available until the round is closed"
        )
    return ResultOut(
        round_id=round_id, computed_at=snapshot.computed_at, ranking=snapshot.ranked_output
    )
