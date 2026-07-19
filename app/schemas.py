"""Pydantic request/response models."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- auth ----------
class LoginIn(BaseModel):
    username: str
    password: str


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


class ResendIn(BaseModel):
    email: EmailStr


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=1, max_length=12)
    new_password: str = Field(min_length=1)  # length checked server-side vs config


class MessageOut(BaseModel):
    message: str


# ---------- projects ----------
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: datetime


# ---------- teams / members ----------
class TeamIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # Emails one per entry; display name defaults to the local-part if omitted.
    emails: list[EmailStr] = Field(min_length=1)


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
    email: EmailStr
    display_name: str | None = None


# ---------- rounds ----------
class RoundIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    team_id: int
    start_at: datetime
    end_at: datetime


class RoundOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
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
