"""Pydantic request/response models."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


# ---------- create a poll ----------
class PollIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Names one per entry, in the order typed; display order on the roster.
    member_names: list[str] = Field(min_length=1)
    duration_minutes: int = Field(gt=0)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str


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
    ranking: list[ResultRow]
