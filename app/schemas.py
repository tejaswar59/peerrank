"""Pydantic request/response models."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- create a poll ----------
class MemberIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr


class PollIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # One entry per roster slot, in the order typed; display order on the roster.
    members: list[MemberIn] = Field(min_length=1)
    duration_minutes: int = Field(gt=0)


class DefaultRosterOut(BaseModel):
    """The standing team roster the create-poll form starts pre-ticked with.
    Reuses MemberIn so the shape is identical to what the form posts back."""

    members: list[MemberIn]


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email: str


class PollOut(BaseModel):
    """Returned ONLY from the create-poll call. `admin_token` is the
    creator's private secret — shown here once and never again by any other
    endpoint. Don't log this response or re-expose admin_token anywhere else."""

    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    vote_token: str
    admin_token: str
    status: str
    duration_minutes: int
    closes_at: datetime
    created_at: datetime
    created_by_email: str | None = None
    members: list[MemberOut]


# ---------- the voter flow (select name -> rank -> submit) ----------
class RosterMemberStatus(BaseModel):
    id: int
    display_name: str
    voted: bool


class PollStatusOut(BaseModel):
    """Public status for a poll's link — powers both the "select your name"
    screen and the creator's live count. Never reveals what anyone voted,
    only whether each name has gone."""

    name: str
    status: str  # "open" | "closed"
    closes_at: datetime
    seconds_remaining: int
    total_members: int
    voted_count: int
    my_member_id: int | None
    members: list[RosterMemberStatus]


class CandidateOut(BaseModel):
    id: int
    display_name: str


class BallotPageOut(BaseModel):
    """What a specific picked name sees once they're ready to rank —
    everyone else on the roster, self excluded."""

    poll_name: str
    member_id: int
    member_name: str
    status: str
    closes_at: datetime
    candidates: list[CandidateOut]  # roster minus yourself


class VoteIn(BaseModel):
    member_id: int
    ranked_member_ids: list[int] = Field(min_length=1)


# ---------- results ----------
class ResultRow(BaseModel):
    member_id: int
    display_name: str
    points: int
    rank: int


class ResultOut(BaseModel):
    poll_name: str
    computed_at: datetime
    vote_count: int = 0  # ballots cast; 0 means nobody voted (scores are tiebreak artifacts)
    ranking: list[ResultRow]


# ---------- admin transparency ----------
class RankedMemberOut(BaseModel):
    rank: int
    member_id: int
    name: str


class AdminVoteOut(BaseModel):
    voter_email: str
    display_name: str
    ranked_members: list[RankedMemberOut]


class DuplicateIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    members: list[MemberIn] = Field(min_length=1)
    duration_minutes: int = Field(gt=0)


# ---------- admin dashboard ----------
class PollSummaryOut(BaseModel):
    """One row on the admin dashboard's poll list."""

    id: int
    name: str
    status: str
    created_at: datetime
    closes_at: datetime
    duration_minutes: int
    created_by_email: str | None
    total_members: int
    voted_count: int
    has_results: bool


class MemberDetail(BaseModel):
    """Roster member as returned by the detail endpoint — email is a plain str
    here (not EmailStr) so legacy-placeholder emails don't fail validation."""
    name: str
    email: str


class PollDetailOut(BaseModel):
    """Just enough to pre-fill the duplicate-poll form: the roster."""

    id: int
    name: str
    status: str
    members: list[MemberDetail]
