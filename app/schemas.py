"""Pydantic request/response models."""
from datetime import datetime
from typing import Annotated

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, BeforeValidator, ConfigDict, EmailStr, Field


def _validate_roster_email(v: str) -> str:
    """Format-checked email for admin-entered rosters (team members). Unlike
    `EmailStr`, this allows RFC 2606 reserved/special-use domains (.test,
    .example, .invalid, .localhost) — those are exactly what internal demo/
    seed/QA fixtures legitimately use, and a real admin roster has no
    deliverability requirement the way a self-signup account does. Still
    rejects genuinely malformed input (no "@", no domain, stray spaces, …).
    `check_deliverability=False` skips live DNS/MX lookups, which would be
    wrong here anyway — an admin roster entry shouldn't fail because of a
    transient DNS hiccup or a corporate mail server that blocks lookups."""
    try:
        info = validate_email(v, check_deliverability=False, test_environment=True)
    except EmailNotValidError as e:
        raise ValueError(str(e)) from e
    return info.normalized


RosterEmail = Annotated[str, BeforeValidator(_validate_roster_email)]


# ---------- auth ----------
class LoginIn(BaseModel):
    username: str
    password: str
    # Single-device login: True re-submits after the user confirms "sign in
    # here and sign out there", overwriting whatever session was active.
    force: bool = False


class LoginOut(BaseModel):
    token: str
    email: str
    role: str


class MeOut(BaseModel):
    email: str
    role: str


# ---------- sign-up + OTP ----------
class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)  # exact length checked server-side vs config
    display_name: str | None = Field(default=None, max_length=200)
    role: str = Field(default="member")  # "admin" | "member" (validated in the route)


class VerifyIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=1, max_length=12)
    force: bool = False  # see LoginIn.force


class ResendIn(BaseModel):
    email: EmailStr


class GoogleIn(BaseModel):
    credential: str  # the Google ID token (JWT) from the Sign-in button
    role: str | None = None  # "admin"/"member" picked on the signup toggle; new users only
    force: bool = False  # see LoginIn.force


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=1, max_length=12)
    new_password: str = Field(min_length=1)  # length checked server-side vs config
    force: bool = False  # see LoginIn.force


class MessageOut(BaseModel):
    message: str


# ---------- teams / members ----------
class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Emails one per entry; display name defaults to the local-part if omitted.
    emails: list[RosterEmail] = Field(min_length=1)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    display_name: str


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    members: list[MemberOut]


class MemberIn(BaseModel):
    email: RosterEmail
    display_name: str | None = None


class DirectoryUserOut(BaseModel):
    """A registered, non-admin account — powers the "pick a teammate by name"
    autocomplete when building a team roster."""

    model_config = ConfigDict(from_attributes=True)
    email: str
    display_name: str


# ---------- rounds ----------
class RoundIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    team_id: int
    start_at: datetime
    end_at: datetime


class RoundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    team_id: int
    name: str
    vote_token: str
    start_at: datetime
    end_at: datetime
    status: str


# ---------- participation (aggregate + per-email voted flag; never ballot content) ----------
class ParticipationRow(BaseModel):
    email: str
    voted: bool


class ParticipationOut(BaseModel):
    round_id: int
    total: int
    submitted: int
    pending: int
    completion_pct: int
    rows: list[ParticipationRow]


# ---------- voting ----------
class CandidateOut(BaseModel):
    id: int
    display_name: str
    email: str


class VotePageOut(BaseModel):
    round_id: int
    round_name: str
    team_name: str
    signed_in_as: str
    end_at: datetime
    status: str
    already_voted: bool
    candidates: list[CandidateOut]  # roster minus yourself


class BallotIn(BaseModel):
    ranked_member_ids: list[int] = Field(min_length=1)


# ---------- results ----------
class ResultRow(BaseModel):
    member_id: int
    display_name: str
    points: int
    rank: int


class ResultOut(BaseModel):
    round_id: int
    computed_at: datetime
    ranking: list[ResultRow]
