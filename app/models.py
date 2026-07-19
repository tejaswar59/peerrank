"""
SQLAlchemy models for Peer Rank.

THE ANONYMITY WALL (load-bearing invariant)
--------------------------------------------
"Did they vote" and "what did they vote" live in two tables that share NO link:

  * ParticipationLog  -> knows an email voted in a round.  unique(round_id, email)
  * Ballot            -> knows a ranking happened.  NO email / voter column, EVER.

Nothing in the schema can join one to the other. This is a structural fact, not
an access rule a bug could bypass: even a compromised admin cannot de-anonymize
a vote because the linking information was never stored anywhere.

`Ballot` is hardened against the two ways stored data could still leak the link:
  * NO sequential id and NO rowid (random UUID PK + WITHOUT ROWID) — so the
    physical/insertion order of ballots cannot be lined up against the order of
    participation rows.
  * NO timestamp — so a ballot cannot be matched to a `voted_at` by time.
Result: `ballots` is an unordered, untimed bag of rankings with no thread back to
any person. The tally reads only `ranked_member_ids`, so results stay exact.

DO NOT add a voter/email/user_id column or FK to `Ballot`, and DO NOT add a
timestamp or a sequential/rowid key. Any of those re-opens de-anonymization.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    # Naive UTC. SQLite stores naive datetimes; keeping everything naive UTC
    # avoids aware-vs-naive comparison errors during window checks.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Project(Base):
    """Top-level container the admin creates. Holds teams and voting rounds."""

    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    teams: Mapped[list["Team"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    rounds: Mapped[list["VotingRound"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Team(Base):
    """A reusable roster. One team can back many voting rounds over time."""

    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="teams")
    members: Mapped[list["TeamMember"]] = relationship(
        back_populates="team", cascade="all, delete-orphan"
    )


class TeamMember(Base):
    """A person eligible to be ranked / to vote. `id` is the stable join order."""

    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "email", name="uq_team_email"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    team_id: Mapped[int] = mapped_column(
        ForeignKey("teams.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    team: Mapped["Team"] = relationship(back_populates="members")


class VotingRound(Base):
    """One voting window over a team. (The 'VotingProject' in the ERD.)"""

    __tablename__ = "voting_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True
    )
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Shareable voting-link slug, e.g. "x7f2k9".
    vote_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # "open" | "closed"
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    project: Mapped["Project"] = relationship(back_populates="rounds")
    team: Mapped["Team"] = relationship()


class ParticipationLog(Base):
    """WHO voted. One side of the anonymity wall. Never linked to Ballot."""

    __tablename__ = "participation_log"
    __table_args__ = (
        # The real duplicate-vote guard: two concurrent submits can't both insert.
        UniqueConstraint("round_id", "email", name="uq_round_email"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(
        ForeignKey("voting_rounds.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    voted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Ballot(Base):
    """
    WHAT was voted. The other side of the anonymity wall.

    ---- DO NOT ADD ANY VOTER / EMAIL / USER IDENTITY COLUMN OR FK HERE. ----
    ---- DO NOT ADD A TIMESTAMP OR A SEQUENTIAL / ROWID KEY. ----
    ranked_member_ids is an ordered list (best performer first) of TeamMember ids.

    The PK is a random UUID and the table is WITHOUT ROWID, so ballots have no
    insertion order to correlate against ParticipationLog, and no timestamp to
    correlate against `voted_at`. The tally only reads ranked_member_ids.
    """

    __tablename__ = "ballots"
    # WITHOUT ROWID (SQLite): rows are keyed only by the random UUID, so the
    # physical order carries no information about who voted when.
    __table_args__ = {"sqlite_with_rowid": False}

    id: Mapped[str] = mapped_column(
        String(32), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    round_id: Mapped[int] = mapped_column(
        ForeignKey("voting_rounds.id", ondelete="CASCADE"), index=True
    )
    ranked_member_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)


class ResultSnapshot(Base):
    """Frozen leaderboard computed once at close. Never a live query over ballots."""

    __tablename__ = "result_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(
        ForeignKey("voting_rounds.id", ondelete="CASCADE"), unique=True, index=True
    )
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # Ordered list of {member_id, display_name, points, rank}.
    ranked_output: Mapped[list[dict]] = mapped_column(JSON, nullable=False)


class AuditLog(Base):
    """Admin actions only. Never logs ballot contents (that would breach the wall)."""

    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class User(Base):
    """A self-registered account (email + password, verified via email OTP).
    Distinct from TeamMember, which is an admin-managed voting eligibility list."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), default="")
    role: Mapped[str] = mapped_column(String(16), default="member")  # "admin" | "member"
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class OtpCode(Base):
    """A one-time email verification code. Stored hashed; short-lived; rate-capped."""

    __tablename__ = "otp_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    purpose: Mapped[str] = mapped_column(String(32), default="signup")
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
