"""Google OAuth 2.0 login/callback/me/logout routes."""
import logging

from authlib.integrations.starlette_client import OAuthError
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from ..auth import is_allowed_email, is_admin_email, oauth
from ..config import settings

log = logging.getLogger("peerrank.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/google")
async def google_login(request: Request):
    if not settings.google_client_secret:
        return RedirectResponse(url="/app/#/login?error=oauth_not_configured", status_code=302)
    redirect_uri = settings.app_base_url.rstrip("/") + "/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri, prompt="select_account")


@router.get("/google/callback")
async def google_callback(request: Request):
    redirect_uri = settings.app_base_url.rstrip("/") + "/auth/google/callback"
    # Log only the parameter NAMES - the callback query carries the OAuth
    # authorization code, which must never reach a log stream.
    log.info("OAuth callback hit, redirect_uri=%s, params=%s",
             redirect_uri, sorted(request.query_params))
    try:
        token = await oauth.google.authorize_access_token(request)
    except OAuthError as exc:
        log.error("OAuthError: %s", exc)
        return RedirectResponse(url="/app/#/login?error=oauth_denied", status_code=302)

    user_info = token.get("userinfo") or {}
    email = (user_info.get("email") or "").lower().strip()
    name = user_info.get("name") or email.split("@")[0]
    email_verified = user_info.get("email_verified", False)

    if not email or not email_verified:
        return RedirectResponse(url="/app/#/login?error=unverified_email", status_code=302)

    if not is_allowed_email(email):
        return RedirectResponse(url="/app/#/login?error=domain_not_allowed", status_code=302)

    request.session["user"] = {
        "email": email,
        "name": name,
        "is_admin": is_admin_email(email),
    }
    return RedirectResponse(url="/app/", status_code=302)


@router.get("/me")
def auth_me(request: Request):
    user = request.session.get("user")
    if not user:
        return JSONResponse({"authenticated": False}, status_code=401)
    return {"authenticated": True, **user}


@router.post("/logout")
def logout(request: Request):
    request.session.clear()
    return {"ok": True}
