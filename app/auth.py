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
import secrets
from dataclasses import dataclass

from fastapi import Depends, Header, HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import ActiveSession, utcnow

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


def issue_token(user: SessionUser, session_id: str | None = None) -> str:
    payload = {"email": user.email, "role": user.role}
    if session_id:
        payload["sid"] = session_id
    return _serializer.dumps(payload)


def _decode_token(token: str) -> tuple[SessionUser, str | None]:
    try:
        data = _serializer.loads(token, max_age=settings.token_ttl_seconds)
    except SignatureExpired:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    except BadSignature:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid session token")
    return SessionUser(email=data["email"], role=data["role"]), data.get("sid")


def current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> SessionUser:
    """Dependency: requires a valid `Authorization: Bearer <token>` header.

    Single-device enforcement: if this token carries a session id (only
    registered-account logins embed one — see start_or_replace_session), and
    an ActiveSession row exists for the email with a DIFFERENT session id,
    this token was superseded by a login elsewhere and is rejected. A token
    with no embedded sid (dev-shim logins) or an email with no active-session
    row at all (nothing to conflict with) is never affected by this check."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user, sid = _decode_token(token)
    if sid:
        row = db.get(ActiveSession, user.email)
        if row is not None and row.session_id != sid:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "You were signed out because this account signed in on another device.",
            )
    return user


def start_or_replace_session(
    db: Session, email: str, force: bool, device_label: str = ""
) -> str:
    """Enforces single-active-session-per-email for registered accounts.
    Returns a new session_id to embed in the token about to be issued.

    Raises HTTPException(409) if another session is already active and the
    caller didn't pass force=True — the frontend surfaces this as "Already
    signed in on another device — sign in here instead?" and, on confirm,
    resubmits the same request with force=True, which overwrites the row
    (invalidating whatever token was issued for the previous session)."""
    existing = db.get(ActiveSession, email)
    if existing is not None and not force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This account is already signed in on another device.",
        )
    new_sid = secrets.token_urlsafe(32)
    if existing is not None:
        existing.session_id = new_sid
        existing.device_label = device_label
        existing.created_at = utcnow()
    else:
        db.add(ActiveSession(email=email, session_id=new_sid, device_label=device_label))
    db.commit()
    return new_sid


def end_session(db: Session, email: str) -> None:
    """Releases the single-session lock on explicit sign-out, so the next
    login for this email doesn't spuriously see a conflict."""
    db.query(ActiveSession).filter(ActiveSession.email == email).delete()
    db.commit()


def require_admin(user: SessionUser = Depends(current_user)) -> SessionUser:
    """Authorization gate: admin-only endpoints. Role comes from the signed token,
    never from anything the client can pass in freely."""
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
