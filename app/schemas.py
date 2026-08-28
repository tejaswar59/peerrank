"""Pydantic request/response models."""
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

# ---------------------------------------------------------------------------
# Hard caps on every free-text field a stranger can submit.
#
# SQLite does NOT enforce VARCHAR lengths, so these are the ONLY real guard:
# without them one pasted 100k-character string is accepted, stored, and then
# overflows every screen that renders it (the question is shown in a fixed-width
# card on the creator's live view and on both voter screens). Keep these in sync
# with frontend/src/lib/limits.ts, which stops it at the input instead.
# ---------------------------------------------------------------------------
MAX_QUESTION_LEN = 100
MAX_MEMBER_NAME_LEN = 32
MAX_MEMBERS = 100  # also caps how much work one anonymous request can create


# strip_whitespace so "  Ravi  " and "Ravi" can't both sit on one roster, and
# so a string of only spaces fails min_length instead of being stored blank.
MemberName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_MEMBER_NAME_LEN),
]


# ---------- create a poll ----------
class PollIn(BaseModel):
    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, min_length=1, max_length=MAX_QUESTION_LEN),
    ]
    # Names one per entry, in the order typed; display order on the roster.
    member_names: list[MemberName] = Field(min_length=1, max_length=MAX_MEMBERS)
    # Seconds. Exact bounds are enforced in the router against config, so the
    # error message can name the real limits.
    duration_seconds: int = Field(gt=0)


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
    duration_seconds: int
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
    """`ranking` is EMPTY when nobody voted — that is a valid, expected result,
    not an error. Render it as "no votes were cast"; never as a leaderboard.
    See the guard at the top of app/scoring.py for why an empty ranking must
    never be padded out into one."""

    poll_name: str
    computed_at: datetime
    ranking: list[ResultRow]
    # Turnout, so the creator can see what the ranking is actually based on.
    ballot_count: int
    total_members: int
