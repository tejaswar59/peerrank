"""Auto-close sweep: makes deadlines real even when nobody is on the site.

Runs on a short interval, finds open rounds past end_at, closes them and freezes
the leaderboard. Leaderboard computation is idempotent, so a double-run is safe.
"""
import asyncio
import logging

from sqlalchemy import func, select

from . import models
from .config import settings
from .database import SessionLocal
from .models import utcnow
from .results import compute_and_freeze

log = logging.getLogger("peerrank.sweep")


def run_sweep_once() -> int:
    """Close open rounds that are either past their deadline OR fully voted.
    Returns how many were closed. Leaderboard freeze is idempotent."""
    db = SessionLocal()
    closed = 0
    try:
        now = utcnow()
        open_rounds = db.scalars(
            select(models.VotingRound).where(
                models.VotingRound.status == "open",
                models.VotingRound.deleted_at.is_(None),
            )
        ).all()
        for rnd in open_rounds:
            expired = rnd.end_at <= now
            all_voted = False
            if not expired:
                roster_n = db.scalar(
                    select(func.count())
                    .select_from(models.TeamMember)
                    .where(
                        models.TeamMember.team_id == rnd.team_id,
                        models.TeamMember.deleted_at.is_(None),
                    )
                ) or 0
                voted_n = db.scalar(
                    select(func.count())
                    .select_from(models.ParticipationLog)
                    .where(models.ParticipationLog.round_id == rnd.id)
                ) or 0
                all_voted = roster_n > 0 and voted_n >= roster_n
            if not (expired or all_voted):
                continue
            rnd.status = "closed"
            compute_and_freeze(db, rnd.id)
            db.add(
                models.AuditLog(
                    actor_email="system",
                    action="round.autoclose",
                    detail=f"round={rnd.id} name={rnd.name!r} reason={'expired' if expired else 'all-voted'}",
                )
            )
            closed += 1
        if closed:
            db.commit()
        return closed
    except Exception:  # never let a bad sweep kill the loop
        db.rollback()
        log.exception("sweep failed")
        return 0
    finally:
        db.close()


async def sweep_loop(stop: asyncio.Event) -> None:
    """Background loop; awaited in the app lifespan. Sync DB work runs off-thread."""
    interval = settings.sweep_interval_seconds
    while not stop.is_set():
        closed = await asyncio.to_thread(run_sweep_once)
        if closed:
            log.info("auto-closed %d round(s)", closed)
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except asyncio.TimeoutError:
            pass  # normal: interval elapsed, run again
