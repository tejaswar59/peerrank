"""FastAPI entrypoint. Creates tables on startup, runs the auto-close sweep,
and mounts the single polls router. No accounts, no auth middleware at all."""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, describe_db_target, engine
from .routers import polls
from .scheduler import sweep_loop

log = logging.getLogger("peerrank.startup")


def _setup_logging() -> None:
    """Give the app's own loggers a handler.

    uvicorn configures only its own loggers, so anything logged under
    "peerrank.*" falls back to logging.lastResort, which drops INFO entirely and
    prints WARNING+ unformatted. That is how a deploy ends up showing a
    connection traceback with no indication of which database it was even
    talking to.
    """
    app_log = logging.getLogger("peerrank")
    if app_log.handlers:
        return
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(levelname)s:     %(message)s"))
    app_log.addHandler(handler)
    app_log.setLevel(logging.INFO)
    app_log.propagate = False


_setup_logging()

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


def _diagnose_db_failure(exc: Exception) -> str:
    """Turn a connection failure into one line someone can act on.

    The default SQLAlchemy traceback is ~60 frames of pool internals with the
    actual cause buried at the bottom, which makes a deploy failure far harder
    to read than it needs to be.
    """
    text = str(exc)

    if "Cannot assign requested address" in text:
        return (
            "The database host resolved to an IPv6 address but this container has "
            "no IPv6 route. The hostname is usually fine — it just publishes both "
            "A and AAAA records, and the resolver returned IPv6 first. The image "
            "sets IPv4 precedence in /etc/gai.conf to avoid this; if you see this "
            "on a rebuilt image, confirm that line survived, or check whether the "
            "host now publishes ONLY AAAA records."
        )
    if "could not translate host name" in text or "Name or service not known" in text:
        return "The database hostname in DATABASE_URL could not be resolved. Check it for typos."
    if "password authentication failed" in text:
        return "The database rejected the credentials in DATABASE_URL."
    if "Connection refused" in text:
        return "Nothing is listening on that database host/port. Check the port and that the database is running."
    if "timeout expired" in text or "timed out" in text:
        return (
            "The database did not answer in time — usually a firewall or "
            "IP-allowlist blocking this container, or the database is asleep."
        )
    if "does not exist" in text and "database" in text:
        return "That database name does not exist on the server."
    return "Could not connect to the database. The provider's error is above."


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create tables if missing. (Use Alembic for real migrations.)
    # Retried because a managed database is frequently still accepting its first
    # connections when the app container starts.
    # Say WHICH database, up front. Without this the only clue in a failure is a
    # raw IP buried in a traceback, and it is very easy to spend a long time
    # debugging a connection string that the container is not actually using
    # (an env var edited but not redeployed, or overridden at another scope).
    log.info("connecting to %s", describe_db_target())

    attempts = max(1, settings.db_startup_retries)
    for attempt in range(1, attempts + 1):
        try:
            await asyncio.to_thread(Base.metadata.create_all, engine)
            break
        except Exception as exc:  # noqa: BLE001 — we re-raise after reporting
            if attempt < attempts:
                log.warning(
                    "database not ready (attempt %d/%d) — retrying in %.0fs",
                    attempt,
                    attempts,
                    settings.db_startup_retry_delay,
                )
                await asyncio.sleep(settings.db_startup_retry_delay)
                continue
            log.error("=" * 72)
            log.error("STARTUP FAILED — could not reach %s", describe_db_target())
            log.error("%s", _diagnose_db_failure(exc))
            log.error("=" * 72)
            raise

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
