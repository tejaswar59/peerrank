"""
SQLAlchemy models for Peer Rank.

An admin creates a Poll (a name + a fixed roster + a countdown) and shares its
link. Voters sign in with Google, pick their own name from the roster, and rank
their peers.

READ THIS FIRST: VOTING IS NOT ANONYMOUS END-TO-END
---------------------------------------------------
`AdminVoteRecord` (below) deliberately stores voter_email alongside that
person's exact ranking, and an admin endpoint exposes it. The `Ballot` rules
described next are still true and still enforced, but they no longer add up to
a privacy promise you can make to voters. Do not tell voters their individual
rankings are unseeable - they are visible to admins by design.

THE ANONYMITY WALL (load-bearing invariant)
--------------------------------------------
"Did they vote" and "what did they vote" live in two tables that share NO link:

  * ParticipationLog  -> knows a candidate (by id) voted.  unique(poll_id, member_id)
  * Ballot            -> knows a ranking happened.  NO member_id / voter column, EVER.

Nothing in the schema can join one to the other. This is a structural fact, not
an access rule a bug could bypass: the linking information is never stored in
`ballots` at all. (Identity still reaches admins through the separate
`AdminVoteRecord` table - see the warning at the top of this module.)

`Ballot` is hardened against the two ways stored data could still leak the link:
  * NO sequential id and NO rowid (random UUID PK + WITHOUT ROWID) — so the
    physical/insertion order of ballots cannot be lined up against the order of
    participation rows.
  * NO timestamp — so a ballot cannot be matched to a `voted_at` by time.
Result: `ballots` is an unordered, untimed bag of rankings with no thread back to
any person. The tally reads only `ranked_member_ids`, so results stay exact.

DO NOT add a voter/member_id/user_id column or FK to `Ballot`, and DO NOT add a
timestamp or a sequential/rowid key. Any of those re-opens de-anonymization.
"""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    # Naive UTC. SQLite stores naive datetimes; keeping everything naive UTC
    # avoids aware-vs-naive comparison errors during window checks.
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Poll(Base):
    """One question + a fixed roster + a countdown. Created once; the roster
    can't change afterward. Closes automatically when the timer runs out OR
    everyone on the roster has voted, whichever comes first.

    Two separate secrets guard two separate audiences:
      * vote_token  — the shareable link. Lets anyone select a name, rank,
        and vote. Never grants access to results.
      * admin_token — shown to the creator once, at creation, and never
        again. The ONLY thing that can fetch results. A voter who only has
        vote_token structurally cannot reach the leaderboard, ever — this
        isn't a UI choice, there's no endpoint that accepts vote_token for
        results."""

    __tablename__ = "polls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Shareable voting-link slug, e.g. "x7f2k9".
    vote_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    # Private — the creator's own secret. Never returned by any endpoint
    # other than the create response.
    admin_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    closes_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # "open" | "closed"
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # Email of the admin who created this poll. Nullable: polls created before
    # this column existed have no creator on record.
    created_by_email: Mapped[str | None] = mapped_column(String(254), nullable=True)

    members: Mapped[list["Candidate"]] = relationship(
        back_populates="poll", cascade="all, delete-orphan", order_by="Candidate.id"
    )

    @staticmethod
    def compute_closes_at(duration_minutes: int, now: datetime | None = None) -> datetime:
        return (now or utcnow()) + timedelta(minutes=duration_minutes)


class Candidate(Base):
    """A person on the roster — identified by name only, nothing else. `id` is
    what ballots reference and is also how a voter picks "who am I" on the
    select-your-name screen."""

    __tablename__ = "candidates"
    __table_args__ = (
        UniqueConstraint("poll_id", "email", name="uq_poll_email"),
        UniqueConstraint("poll_id", "display_name", name="uq_poll_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", ondelete="CASCADE"), index=True
    )
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Identity-binding: the only email allowed to vote as this roster slot.
    # One email per poll (unique constraint below) — checked against the
    # signed-in user's email at both the ranking-form and submit steps.
    email: Mapped[str] = mapped_column(String(254), nullable=False)

    poll: Mapped["Poll"] = relationship(back_populates="members")


class ParticipationLog(Base):
    """WHO voted. One side of the anonymity wall. Never linked to Ballot."""

    __tablename__ = "participation_log"
    __table_args__ = (
        # The real duplicate-vote guard: two concurrent submits for the same
        # picked name can't both insert.
        UniqueConstraint("poll_id", "member_id", name="uq_poll_member"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[int] = mapped_column(Integer, nullable=False)


class Ballot(Base):
    """
    WHAT was voted. The other side of the anonymity wall.

    ---- DO NOT ADD ANY VOTER / MEMBER_ID / USER IDENTITY COLUMN OR FK HERE. ----
    ---- DO NOT ADD A TIMESTAMP OR A SEQUENTIAL / ROWID KEY. ----
    ranked_member_ids is an ordered list (best performer first) of Candidate ids.

    The PK is a random UUID and the table is WITHOUT ROWID, so ballots have no
    insertion order to correlate against ParticipationLog, and no timestamp to
    correlate against anything. The tally only reads ranked_member_ids.
    """

    __tablename__ = "ballots"
    # WITHOUT ROWID (SQLite): rows are keyed only by the random UUID, so the
    # physical order carries no information about who voted when.
    __table_args__ = {"sqlite_with_rowid": False}

    id: Mapped[str] = mapped_column(
        String(32), primary_key=True, default=lambda: uuid.uuid4().hex
    )
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", ondelete="CASCADE"), index=True
    )
    ranked_member_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)


class AdminVoteRecord(Base):
    """
    Admin-only transparency layer. Records WHO voted and WHAT THEY VOTED,
    explicitly for admin review.

    This is intentionally NOT the Ballot table. The Ballot table remains
    anonymous (no voter identity, no timestamp, no rowid). This table is the
    separate, non-anonymous companion, written atomically alongside Ballot
    in the same DB transaction.

    There is NO FK from AdminVoteRecord to Ballot — the two tables share only
    poll_id and ranked_member_ids content, not any row-level link. This is
    deliberate: even with full DB access, you cannot trivially correlate a
    specific AdminVoteRecord row to a specific Ballot row.

    DO NOT add a ballot_id FK here — that would re-open de-anonymization.
    """
    __tablename__ = "admin_vote_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", ondelete="CASCADE"), index=True
    )
    voter_email: Mapped[str] = mapped_column(String(254), nullable=False, index=True)
    voter_display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    # Same ordering as Ballot.ranked_member_ids: Candidate.id list, best first.
    ranked_member_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    voted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ResultSnapshot(Base):
    """Frozen leaderboard computed once at close. Never a live query over ballots."""

    __tablename__ = "result_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    poll_id: Mapped[int] = mapped_column(
        ForeignKey("polls.id", ondelete="CASCADE"), unique=True, index=True
    )
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # Ordered list of {member_id, display_name, points, rank}.
    ranked_output: Mapped[list[dict]] = mapped_column(JSON, nullable=False)
