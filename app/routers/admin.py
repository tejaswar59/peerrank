"""Admin API: projects, teams, members, voting rounds, participation, results.

Every endpoint here requires the admin role. Note there is deliberately NO
endpoint that returns an individual ballot — that data path does not exist.
"""
import secrets
import string
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import models
from ..auth import SessionUser, require_admin
from ..config import settings
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

_ALPHABET = string.ascii_lowercase + string.digits


def _make_vote_token(db: Session) -> str:
    """Short, URL-friendly slug (e.g. 'x7f2k9'), unique across rounds."""
    for _ in range(10):
        token = "".join(secrets.choice(_ALPHABET) for _ in range(6))
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


# ---------------- projects ----------------
@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(
    body: ProjectIn, db: Session = Depends(get_db), admin: SessionUser = Depends(require_admin)
):
    project = models.Project(name=body.name)
    db.add(project)
    _audit(db, admin.email, "project.create", body.name)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects", response_model=list[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.scalars(select(models.Project).order_by(models.Project.id)).all()


def _get_project(db: Session, project_id: int) -> models.Project:
    project = db.get(models.Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return _get_project(db, project_id)


def _purge_rounds(db: Session, round_ids: list[int]) -> None:
    """Hard-delete a set of rounds and everything hanging off them."""
    if not round_ids:
        return
    for model in (models.Ballot, models.ParticipationLog, models.ResultSnapshot):
        db.query(model).filter(model.round_id.in_(round_ids)).delete(synchronize_session=False)
    db.query(models.VotingRound).filter(models.VotingRound.id.in_(round_ids)).delete(
        synchronize_session=False
    )


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    """Permanently delete a project and all its teams, rounds, and results."""
    _get_project(db, project_id)
    round_ids = list(
        db.scalars(select(models.VotingRound.id).where(models.VotingRound.project_id == project_id))
    )
    _purge_rounds(db, round_ids)
    team_ids = list(
        db.scalars(select(models.Team.id).where(models.Team.project_id == project_id))
    )
    if team_ids:
        db.query(models.TeamMember).filter(models.TeamMember.team_id.in_(team_ids)).delete(
            synchronize_session=False
        )
    db.query(models.Team).filter(models.Team.project_id == project_id).delete(
        synchronize_session=False
    )
    db.query(models.Project).filter(models.Project.id == project_id).delete(
        synchronize_session=False
    )
    _audit(db, admin.email, "project.delete", f"project={project_id}")
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
    team = models.Team(project_id=project_id, name=body.name)
    db.add(team)
    db.flush()  # assign team.id before adding members
    seen: set[str] = set()
    for email in body.emails:
        addr = str(email).lower()
        if addr in seen:
            continue  # de-dupe within the submitted list
        seen.add(addr)
        team.members.append(
            models.TeamMember(email=addr, display_name=addr.split("@")[0])
        )
    _audit(db, admin.email, "team.create", f"project={project_id} name={body.name!r}")
    db.commit()
    db.refresh(team)
    return team


@router.get("/projects/{project_id}/teams", response_model=list[TeamOut])
def list_teams(project_id: int, db: Session = Depends(get_db)):
    _get_project(db, project_id)
    return db.scalars(
        select(models.Team).where(models.Team.project_id == project_id).order_by(models.Team.id)
    ).all()


def _get_team(db: Session, team_id: int) -> models.Team:
    team = db.get(models.Team, team_id)
    if team is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Team not found")
    return team


@router.delete("/teams/{team_id}", status_code=204)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    admin: SessionUser = Depends(require_admin),
):
    """Permanently delete a team, its members, and any rounds that used it."""
    _get_team(db, team_id)
    round_ids = list(
        db.scalars(select(models.VotingRound.id).where(models.VotingRound.team_id == team_id))
    )
    _purge_rounds(db, round_ids)
    db.query(models.TeamMember).filter(models.TeamMember.team_id == team_id).delete(
        synchronize_session=False
    )
    db.query(models.Team).filter(models.Team.id == team_id).delete(synchronize_session=False)
    _audit(db, admin.email, "team.delete", f"team={team_id}")
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
    exists = db.scalar(
        select(models.TeamMember.id).where(
            models.TeamMember.team_id == team_id, models.TeamMember.email == addr
        )
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Member already on team")
    member = models.TeamMember(
        team_id=team.id, email=addr, display_name=body.display_name or addr.split("@")[0]
    )
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
    member = db.get(models.TeamMember, member_id)
    if member is None or member.team_id != team_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")
    db.delete(member)
    _audit(db, admin.email, "member.remove", f"team={team_id} id={member_id}")
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
    if not team.members:
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
        .where(models.VotingRound.project_id == project_id)
        .order_by(models.VotingRound.id.desc())
    ).all()


def _get_round(db: Session, round_id: int) -> models.VotingRound:
    rnd = db.get(models.VotingRound, round_id)
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
    votes = ballot_count(db, round_id)
    return {
        "status": "closed",
        "votes": votes,
        "results_visible": votes >= settings.min_result_voters,
    }


@router.get("/rounds/{round_id}/participation", response_model=ParticipationOut)
def participation(round_id: int, db: Session = Depends(get_db)):
    """Aggregate counts + per-email voted flag. WHO voted, never WHAT they voted."""
    rnd = _get_round(db, round_id)
    members = db.scalars(
        select(models.TeamMember)
        .where(models.TeamMember.team_id == rnd.team_id)
        .order_by(models.TeamMember.id)
    ).all()
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
    # Anonymity floor: don't reveal a leaderboard that could expose an individual.
    votes = ballot_count(db, round_id)
    if votes < settings.min_result_voters:
        so_far = f"{votes} {'person has' if votes == 1 else 'people have'} voted so far."
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Results stay hidden until at least {settings.min_result_voters} "
            f"teammates vote — protects who ranked whom. {so_far}",
        )
    return ResultOut(
        round_id=round_id, computed_at=snapshot.computed_at, ranking=snapshot.ranked_output
    )
