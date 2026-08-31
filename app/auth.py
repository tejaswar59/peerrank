"""OAuth 2.0 client, domain/admin checks, and FastAPI session dependencies."""
from authlib.integrations.starlette_client import OAuth
from fastapi import Depends, HTTPException, Request, status

from .config import settings

oauth = OAuth()
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_id=settings.google_client_id,
    client_secret=settings.google_client_secret,
    client_kwargs={
        "scope": "openid email profile",
        "token_endpoint_auth_method": "client_secret_post",
    },
)


def is_allowed_email(email: str) -> bool:
    email = email.lower().strip()
    if email in settings.allowed_email_exceptions_set:
        return True
    return email.endswith(f"@{settings.allowed_email_domain}")


def is_admin_email(email: str) -> bool:
    return email.lower().strip() in settings.admin_emails_set


def get_current_user(request: Request) -> dict:
    user = request.session.get("user")
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED,
                            "Not authenticated. Sign in at /auth/google")
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if not user.get("is_admin"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user
