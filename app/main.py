"""FastAPI entrypoint. Creates tables on startup, runs the auto-close sweep,
and mounts the single polls router. No accounts, no auth middleware at all."""
import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, engine
from .routers import polls
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
