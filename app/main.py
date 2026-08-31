"""FastAPI entrypoint. Creates tables on startup, runs the auto-close sweep,
mounts the auth/admin/polls routers, and serves the SPA.

Auth IS present: Google OAuth plus a signed session cookie via Starlette's
SessionMiddleware. Voting requires a signed-in user; creating a poll requires
an address listed in ADMIN_EMAILS. See app/auth.py."""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from .auth import oauth  # noqa: F401 — triggers oauth.register() at import time
from .config import settings
from .database import Base, engine
from .routers import polls
from .routers import auth_routes
from .routers import admin as admin_router
from .scheduler import sweep_loop

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create tables if missing. (Use Alembic for real migrations.)
    Base.metadata.create_all(bind=engine)

    stop = asyncio.Event()
    task = asyncio.create_task(sweep_loop(stop))
    try:
        yield
    finally:
        stop.set()
        await task


app = FastAPI(title="Peer Rank API", version="0.2.0", lifespan=lifespan)

# CORS origins come from config (default "*" for dev). Set CORS_ORIGINS in
# production. The SPA is same-origin with the API, so this only matters if you
# serve the frontend from a different host.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)
# SessionMiddleware added after CORS so it runs outermost (Starlette middleware
# stack is LIFO — last added = outermost = runs first on the way in).
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie="peerrank_session",
    max_age=604800,
    same_site="lax",
    https_only=settings.https_only,
)

app.include_router(auth_routes.router)
app.include_router(admin_router.router)
app.include_router(polls.router)


@app.get("/", include_in_schema=False)
def root():
    # Send visitors straight to the single-page frontend.
    return RedirectResponse(url="/app/")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # Browsers request this root-level path automatically regardless of the
    # page's own <link rel="icon">. The real icon is served by the SPA's
    # StaticFiles mount below (/app/favicon.svg); redirect here so that
    # default probe doesn't 404 in the logs on every page load.
    return RedirectResponse(url="/app/favicon.svg")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


# Serve the SPA last so it never shadows the /api routes. html=True makes
# StaticFiles return index.html for the mount root (hash-routed client).
app.mount("/app", StaticFiles(directory=WEB_DIR, html=True), name="web")
