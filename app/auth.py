"""
Authentication + authorization.

Auth answers "who is this"; authz answers "what can they do" — kept textually
separate below on purpose.

The login here is a TEMPORARY dev shim:
  admin / 123        -> role "admin", signed in as ADMIN_EMAIL
  user  / 123        -> role "member", signed in as DEV_VOTER_EMAIL
  <any-email> / 123  -> role "member", signed in as that email (test any voter)

Google OAuth replaces `authenticate()` later. Everything downstream depends only
on the `SessionUser` (email + role) and the signed token, so wiring OAuth in will
not require changing the routers or the eligibility gates.
"""
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .config import settings

_serializer = URLSafeTimedSerializer(settings.secret_key, salt="peerrank-session")


@dataclass
class SessionUser:
    email: str
    role: str  # "admin" | "member"


def authenticate(username: str, password: str) -> SessionUser | None:
    """Dev credential check. Returns a SessionUser or None. Replaced by OAuth.

    Accepts the admin/voter by their short username OR their email, so the
    email-based login form works for the built-in dev accounts too."""
    if password != settings.dev_password:
        return None
    u = username.strip().lower()
    if u in (settings.admin_username, settings.admin_email.lower()):
        return SessionUser(email=settings.admin_email, role="admin")
    if u in (settings.voter_username, settings.dev_voter_email.lower()):
        return SessionUser(email=settings.dev_voter_email, role="member")
    if "@" in u:
        return SessionUser(email=u, role="member")
    return None


def issue_token(user: SessionUser) -> str:
    return _serializer.dumps({"email": user.email, "role": user.role})


def _decode_token(token: str) -> SessionUser:
    try:
        data = _serializer.loads(token, max_age=settings.token_ttl_seconds)
    except SignatureExpired:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    except BadSignature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session token")
    return SessionUser(email=data["email"], role=data["role"])


def current_user(authorization: str | None = Header(default=None)) -> SessionUser:
    """Dependency: requires a valid `Authorization: Bearer <token>` header."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    return _decode_token(token)


def require_admin(user: SessionUser = Depends(current_user)) -> SessionUser:
    """Authorization gate: admin-only endpoints. Role comes from the signed token,
    never from anything the client can pass in freely."""
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
