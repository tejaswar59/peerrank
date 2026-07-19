"""Auth: self-service sign-up with email-OTP verification + password login.

Sign-up flow:
  1. POST /signup  {email, password, display_name?}  -> creates an *unverified*
     user, emails a one-time code.
  2. POST /verify  {email, code}                      -> marks verified, logs in.
  3. POST /resend  {email}                             -> re-sends a fresh code.

Login (POST /login) checks the users table first (registered emails must use
their real password); the temporary dev shim (admin/123, user/123) remains for
unregistered usernames until real admin accounts exist.
"""
import json
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import SessionUser, authenticate, current_user, issue_token
from ..config import settings
from ..database import get_db
from ..mailer import send_otp_email
from ..models import OtpCode, User, utcnow
from ..ratelimit import rate_limit
from ..security import generate_otp, hash_otp, hash_password, otp_matches, verify_password
from ..schemas import (
    ForgotIn,
    GoogleIn,
    LoginIn,
    LoginOut,
    MeOut,
    MessageOut,
    ResendIn,
    ResetIn,
    SignupIn,
    VerifyIn,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_otp_limit = rate_limit(settings.otp_rate_max, settings.otp_rate_window, bucket="otp")
_login_limit = rate_limit(settings.login_rate_max, settings.login_rate_window, bucket="login")


def _issue_and_send_otp(db: Session, email: str, purpose: str = "signup") -> None:
    """Invalidate any prior codes for this (email, purpose), mint a new one, email it."""
    db.query(OtpCode).filter(
        OtpCode.email == email,
        OtpCode.purpose == purpose,
        OtpCode.consumed == False,  # noqa: E712
    ).update({"consumed": True})
    code = generate_otp(settings.otp_length)
    db.add(
        OtpCode(
            email=email,
            code_hash=hash_otp(code, settings.secret_key),
            purpose=purpose,
            expires_at=utcnow() + timedelta(seconds=settings.otp_ttl_seconds),
        )
    )
    db.commit()
    try:
        send_otp_email(email, code)  # emails, or logs the code in dev
    except Exception:
        # The user + code are saved; surface a clear error instead of a 500.
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "Couldn't send the verification email — check the SMTP settings.",
        )


@router.post("/signup", response_model=MessageOut, dependencies=[Depends(_otp_limit)])
def signup(body: SignupIn, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    role = body.role if body.role in ("admin", "member") else "member"
    if len(body.password) < settings.password_min_length:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Password must be at least {settings.password_min_length} characters.",
        )
    existing = db.scalar(select(User).where(User.email == email))
    if existing and existing.is_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email already has an account — please sign in.")

    if existing:  # unverified: update password/name/role and re-verify
        existing.password_hash = hash_password(body.password)
        existing.display_name = body.display_name or existing.display_name
        existing.role = role
    else:
        db.add(
            User(
                email=email,
                password_hash=hash_password(body.password),
                display_name=body.display_name or email.split("@")[0],
                role=role,
                is_verified=False,
            )
        )
    db.commit()
    _issue_and_send_otp(db, email)
    return MessageOut(message=f"We sent a {settings.otp_length}-digit code to {email}.")


@router.post("/verify", response_model=LoginOut, dependencies=[Depends(_login_limit)])
def verify(body: VerifyIn, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No sign-up found for this email.")
    if user.is_verified:
        # Already verified — nothing to do; let them sign in.
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already verified — please sign in.")

    # DEV bypass: the configured master OTP verifies without the emailed code.
    if settings.master_otp and body.code.strip() == settings.master_otp:
        user.is_verified = True
        db.query(OtpCode).filter(
            OtpCode.email == email,
            OtpCode.purpose == "signup",
            OtpCode.consumed == False,  # noqa: E712
        ).update({"consumed": True})
        db.commit()
        s = SessionUser(email=email, role=user.role)
        return LoginOut(token=issue_token(s), email=email, role=user.role)

    otp = db.scalar(
        select(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.purpose == "signup",
            OtpCode.consumed == False,  # noqa: E712
        )
        .order_by(OtpCode.id.desc())
    )
    if otp is None or otp.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code expired — request a new one.")
    if otp.attempts >= settings.otp_max_attempts:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts — request a new code.")

    otp.attempts += 1
    if not otp_matches(body.code.strip(), otp.code_hash, settings.secret_key):
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Please try again.")

    otp.consumed = True
    user.is_verified = True
    db.commit()
    user_session = SessionUser(email=email, role=user.role)
    return LoginOut(token=issue_token(user_session), email=email, role=user.role)


@router.post("/resend", response_model=MessageOut, dependencies=[Depends(_otp_limit)])
def resend(body: ResendIn, db: Session = Depends(get_db)):
    email = str(body.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No sign-up found for this email.")
    if user.is_verified:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already verified — please sign in.")
    _issue_and_send_otp(db, email)
    return MessageOut(message=f"A new code is on its way to {email}.")


@router.post("/login", response_model=LoginOut, dependencies=[Depends(_login_limit)])
def login(body: LoginIn, db: Session = Depends(get_db)):
    username = body.username.strip()

    # Registered accounts take precedence — their real password is required.
    if "@" in username:
        user = db.scalar(select(User).where(User.email == username.lower()))
        if user is not None:
            if not user.is_verified:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, "Please verify your email before signing in."
                )
            if not verify_password(body.password, user.password_hash):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
            s = SessionUser(email=user.email, role=user.role)
            return LoginOut(token=issue_token(s), email=user.email, role=user.role)

    # Fallback: temporary dev shim (admin/123, user/123, unregistered email/123).
    dev = authenticate(username, body.password)
    if dev is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return LoginOut(token=issue_token(dev), email=dev.email, role=dev.role)


@router.post("/forgot", response_model=MessageOut, dependencies=[Depends(_otp_limit)])
def forgot_password(body: ForgotIn, db: Session = Depends(get_db)):
    """Request a password-reset code. Tells the user if the email isn't registered
    (friendlier UX; note this does reveal which emails have accounts)."""
    email = str(body.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "This email isn't linked to any account — please sign up first.",
        )
    if not user.is_verified:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "This email hasn't been verified yet — please finish signing up.",
        )
    _issue_and_send_otp(db, email, purpose="reset")
    return MessageOut(message=f"We sent a reset code to {email}.")


@router.post("/reset/check", response_model=MessageOut, dependencies=[Depends(_login_limit)])
def reset_check(body: VerifyIn, db: Session = Depends(get_db)):
    """Validate a reset code WITHOUT consuming it — lets the UI confirm the code
    before asking for the new password. The final /reset re-validates + consumes."""
    email = str(body.email).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset code.")
    if settings.master_otp and body.code.strip() == settings.master_otp:
        return MessageOut(message="ok")
    otp = db.scalar(
        select(OtpCode)
        .where(
            OtpCode.email == email,
            OtpCode.purpose == "reset",
            OtpCode.consumed == False,  # noqa: E712
        )
        .order_by(OtpCode.id.desc())
    )
    if otp is None or otp.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset code expired — request a new one.")
    if not otp_matches(body.code.strip(), otp.code_hash, settings.secret_key):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Please try again.")
    return MessageOut(message="ok")


@router.post("/reset", response_model=LoginOut, dependencies=[Depends(_login_limit)])
def reset_password(body: ResetIn, db: Session = Depends(get_db)):
    """Verify the reset code and set a new password, then sign the user in."""
    email = str(body.email).lower()
    if len(body.new_password) < settings.password_min_length:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Password must be at least {settings.password_min_length} characters.",
        )
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_verified:
        # Generic message — don't reveal whether the email exists.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset code.")

    is_master = bool(settings.master_otp) and body.code.strip() == settings.master_otp
    if not is_master:
        otp = db.scalar(
            select(OtpCode)
            .where(
                OtpCode.email == email,
                OtpCode.purpose == "reset",
                OtpCode.consumed == False,  # noqa: E712
            )
            .order_by(OtpCode.id.desc())
        )
        if otp is None or otp.expires_at < utcnow():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Reset code expired — request a new one.")
        if otp.attempts >= settings.otp_max_attempts:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts — request a new code.")
        otp.attempts += 1
        if not otp_matches(body.code.strip(), otp.code_hash, settings.secret_key):
            db.commit()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Please try again.")
        otp.consumed = True

    user.password_hash = hash_password(body.new_password)
    # Invalidate any other outstanding reset codes for this email.
    db.query(OtpCode).filter(
        OtpCode.email == email,
        OtpCode.purpose == "reset",
        OtpCode.consumed == False,  # noqa: E712
    ).update({"consumed": True})
    db.commit()
    s = SessionUser(email=email, role=user.role)
    return LoginOut(token=issue_token(s), email=email, role=user.role)


@router.get("/config")
def auth_config():
    """Public front-end config — currently just whether Google sign-in is on."""
    return {"google_client_id": settings.google_client_id}


def _verify_google_credential(credential: str) -> dict | None:
    """Verify a Google ID token via Google's tokeninfo endpoint (HTTPS, works on
    Render). Returns the claims if valid and issued for OUR client id, else None."""
    url = "https://oauth2.googleapis.com/tokeninfo?id_token=" + urllib.parse.quote(credential)
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read().decode())
    except Exception:
        return None
    if data.get("aud") != settings.google_client_id:
        return None  # token was minted for a different app — reject
    if str(data.get("email_verified")).lower() != "true" or not data.get("email"):
        return None
    return data


@router.post("/google", response_model=LoginOut, dependencies=[Depends(_login_limit)])
def google_login(body: GoogleIn, db: Session = Depends(get_db)):
    if not settings.google_client_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google sign-in is not configured.")
    info = _verify_google_credential(body.credential)
    if info is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google sign-in failed — please try again.")

    email = info["email"].lower()
    name = info.get("name") or email.split("@")[0]
    # Role comes from the signup toggle (Admin / Team member). Only honoured when
    # CREATING the account; an existing account keeps whatever role it already has.
    role = body.role if body.role in ("admin", "member") else "member"
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        # New Google user — create a verified account (random unusable password;
        # they can set one later via "forgot password" if they want).
        user = User(
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(24)),
            display_name=name,
            role=role,
            is_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    elif not user.is_verified:
        user.is_verified = True  # Google proved they own the inbox
        db.commit()
    s = SessionUser(email=user.email, role=user.role)
    return LoginOut(token=issue_token(s), email=user.email, role=user.role)


@router.get("/me", response_model=MeOut)
def me(user: SessionUser = Depends(current_user)):
    return MeOut(email=user.email, role=user.role)
