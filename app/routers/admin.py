"""Admin API: projects, teams, members, voting rounds, participation, results.

Every endpoint here requires the admin role. Note there is deliberately NO
endpoint that returns an individual ballot — that data path does not exist.
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
    MemberIn,
    MemberOut,
    ParticipationOut,
    ParticipationRow,
    ProjectIn,
    ProjectOut,
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


# ---------------- projects ----------------
@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectIn, db: Session = Depends(get_db), admin: SessionUser = Depends(require_admin)
):
    name = body.name.strip()
    # No two ACTIVE projects may share a name (a soft-deleted name is free again).
    dup = db.scalar(
        select(models.Project.id).where(
            models.Project.deleted_at.is_(None),
            func.lower(func.trim(models.Project.name)) == _norm(name),
        )
    )
    if dup:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A project named “{name}” already exists."
        )
    project = models.Project(name=name)
    db.add(project)
    _audit(db, admin.email, "project.create", name)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.scalars(
        select(models.Project)
        .where(models.Project.deleted_at.is_(None))
        .order_by(models.Project.id)
    ).all()


def _get_project(db: Session, project_id: int) -> models.Project:
    project = db.scalar(
        select(models.Project).where(
            models.Project.id == project_id, models.Project.deleted_at.is_(None)
        )
    )
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get_project(db, project_id)


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


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    """Soft-delete a project and all its teams, members, and rounds. Rows are
    kept in the database (deleted_at is stamped) and hidden from the app —
    ballots/participation are never touched."""
    _get_project(db, project_id)
    now = models.utcnow()
    db.query(models.VotingRound).filter(models.VotingRound.project_id == project_id).update(
        {"deleted_at": now}, synchronize_session=False
    )
    team_ids = list(db.scalars(select(models.Team.id).where(models.Team.project_id == project_id)))
    _soft_delete_teams(db, team_ids, now)
    db.query(models.Project).filter(models.Project.id == project_id).update(
        {"deleted_at": now}, synchronize_session=False
    )
    _audit(db, admin.email, "project.delete", f"project={project_id} (soft)")
    db.commit()


# ---------------- teams / members ----------------
@router.post("/projects/{project_id}/teams", response_model=TeamOut, status_code=201)
def create_team(
    project_id: int,
    body: TeamIn,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    _get_project(db, project_id)
    name = body.name.strip()
    # No two ACTIVE teams in the same project may share a name.
    dup = db.scalar(
        select(models.Team.id).where(
            models.Team.project_id == project_id,
            models.Team.deleted_at.is_(None),
            func.lower(func.trim(models.Team.name)) == _norm(name),
        )
    )
    if dup:
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"A team named “{name}” already exists in this project."
        )
    team = models.Team(project_id=project_id, name=name)
    db.add(team)
    db.flush()  # assign team.id before adding members
    seen: set[str] = set()
    seen_names: set[str] = set()
    for email in body.emails:
        addr = str(email).lower()
        if addr in seen:
            continue  # de-dupe within the submitted list
        seen.add(addr)
        # Keep display names distinct on the ballot: if the local-part collides
        # (e.g. john@a.com & john@b.com), fall back to the full email.
        display = addr.split("@")[0]
        if _norm(display) in seen_names:
            display = addr
        seen_names.add(_norm(display))
        team.members.append(models.TeamMember(email=addr, display_name=display))
    _audit(db, admin.email, "team.create", f"project={project_id} name={body.name!r}")
    db.commit()
    db.refresh(team)
    return team


def _active_members(db: Session, team_id: int) -> list[models.TeamMember]:
    return db.scalars(
        select(models.TeamMember)
        .where(models.TeamMember.team_id == team_id, models.TeamMember.deleted_at.is_(None))
        .order_by(models.TeamMember.id)
    ).all()


@router.get("/projects/{project_id}/teams", response_model=list[TeamOut])
def list_teams(project_id: int, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    teams = db.scalars(
        select(models.Team)
        .where(models.Team.project_id == project_id, models.Team.deleted_at.is_(None))
        .order_by(models.Team.id)
    ).all()
    # Build explicitly so soft-deleted members are excluded from the response.
    return [
        TeamOut(
            id=t.id,
            name=t.name,
            members=[
                MemberOut(id=m.id, email=m.email, display_name=m.display_name)
                for m in _active_members(db, t.id)
            ],
        )
        for t in teams
    ]


def _get_team(db: Session, team_id: int) -> models.Team:
    team = db.scalar(
        select(models.Team).where(
            models.Team.id == team_id, models.Team.deleted_at.is_(None)
        )
    )
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return team


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
    display = (body.display_name or addr.split("@")[0]).strip()
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
@router.post("/projects/{project_id}/rounds", response_model=RoundOut, status_code=201)
def create_round(
    project_id: int,
    body: RoundIn,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    _get_project(db, project_id)
    team = _get_team(db, body.team_id)
    if team.project_id != project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That team doesn't belong to this project.")
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
        project_id=project_id,
        team_id=team.id,
        name=body.name,
        vote_token=_make_vote_token(db),
        start_at=start_at,
        end_at=end_at,
        status="open",
    )
    db.add(rnd)
    _audit(db, admin.email, "round.create", f"project={project_id} name={body.name!r}")
    db.commit()
    db.refresh(rnd)
    return rnd


@router.get("/projects/{project_id}/rounds", response_model=list[RoundOut])
def list_rounds(project_id: int, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    return db.scalars(
        select(models.VotingRound)
        .where(
            models.VotingRound.project_id == project_id,
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
