"""FastAPI entrypoint. Creates tables on startup, runs the auto-close sweep,
and mounts the auth / admin / voting routers."""
import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, engine
from .routers import admin, auth_routes, voting
from .scheduler import sweep_loop

WEB_DIR = Path(__file__).resolve().parent.parent / "web"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Dev convenience: create tables if missing. (Use Alembic for real migrations.)
    Base.metadata.create_all(bind=engine)

    if settings.master_otp:
        logging.getLogger("peerrank").warning(
            "MASTER_OTP is set — any email can be verified with it. "
            "Clear MASTER_OTP before production."
        )

    stop = asyncio.Event()
    task = asyncio.create_task(sweep_loop(stop))
    try:
        yield
    finally:
        stop.set()
        await task


app = FastAPI(title="Peer Rank API", version="0.1.0", lifespan=lifespan)

# CORS origins come from config (default "*" for dev). Set CORS_ORIGINS in
# production. The SPA is same-origin with the API, so this only matters if you
# serve the frontend from a different host.
from .config import settings  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(admin.router)
app.include_router(voting.router)


@app.get("/", include_in_schema=False)
def root():
    # Send visitors straight to the single-page frontend.
    return RedirectResponse(url="/app/")


@app.get("/api/health", tags=["meta"])
def health():
    return {"status": "ok"}


# Serve the SPA last so it never shadows the /api routes. html=True makes
# StaticFiles return index.html for the mount root (hash-routed client).
app.mount("/app", StaticFiles(directory=WEB_DIR, html=True), name="web")
