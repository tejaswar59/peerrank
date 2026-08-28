"""Auto-close sweep: makes the countdown real even when nobody has the page open.

Runs on a short interval, finds open polls past closes_at, closes them and
freezes the leaderboard. Leaderboard computation is idempotent, so a double-run
is safe.
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


def run_sweep_once() -> tuple[int, float | None]:
    """Close open polls that are either past their timer OR fully voted.

    Returns (how many were closed, seconds until the earliest remaining poll is
    due to close). The second value is None when nothing is open, which lets the
    loop stop querying on a fixed heartbeat — see sweep_loop. Leaderboard freeze
    is idempotent.
    """
    db = SessionLocal()
    closed = 0
    next_due: float | None = None
    try:
        now = utcnow()
        open_polls = db.scalars(
            select(models.Poll).where(models.Poll.status == "open")
        ).all()
        for poll in open_polls:
            expired = poll.closes_at <= now
            all_voted = False
            if not expired:
                roster_n = db.scalar(
                    select(func.count())
                    .select_from(models.Candidate)
                    .where(models.Candidate.poll_id == poll.id)
                ) or 0
                voted_n = db.scalar(
                    select(func.count())
                    .select_from(models.ParticipationLog)
                    .where(models.ParticipationLog.poll_id == poll.id)
                ) or 0
                all_voted = roster_n > 0 and voted_n >= roster_n
            if not (expired or all_voted):
                # Still running — remember when it wants attention next.
                due_in = (poll.closes_at - now).total_seconds()
                next_due = due_in if next_due is None else min(next_due, due_in)
                continue
            poll.status = "closed"
            compute_and_freeze(db, poll.id)
            closed += 1
        if closed:
            db.commit()
        return closed, next_due
    except Exception:  # never let a bad sweep kill the loop
        db.rollback()
        log.exception("sweep failed")
        return 0, None
    finally:
        db.close()


async def sweep_loop(stop: asyncio.Event) -> None:
    """Background loop; awaited in the app lifespan. Sync DB work runs off-thread.

    The wait between sweeps is adaptive, and that matters for cost: a fixed
    5-second heartbeat is ~17,000 queries a day even with no poll in existence,
    which on a serverless Postgres (Neon, Supabase) keeps the compute awake
    around the clock and burns a free-tier allowance for nothing.

    So: sleep only as long as the work actually requires —
      * a poll closing soon  -> wake just before it is due,
      * nothing open at all  -> fall back to the idle interval.

    Sleeping through a newly created poll's deadline is safe. Every visitor
    request already calls _maybe_close_if_expired (see routers/polls.py) and a
    final vote closes the poll inline, so the sweep is only the backstop for a
    poll whose timer runs out with nobody watching — and votes can never slip in
    past closes_at, because that is re-checked on write.
    """
    # Never sleep less than this, so a poll whose deadline has just passed can't
    # spin the loop. It is a floor, NOT a heartbeat — the loop does not wake on
    # a fixed interval any more.
    floor = 1.0
    idle = float(max(floor, settings.sweep_idle_interval_seconds))
    while not stop.is_set():
        closed, next_due = await asyncio.to_thread(run_sweep_once)
        if closed:
            log.info("auto-closed %d poll(s)", closed)

        if next_due is None:
            delay: float = idle
        else:
            # Wake exactly when the next poll is due — clamped below so we don't
            # spin, and above so a long-running poll still lets us notice newer,
            # shorter ones.
            delay = min(max(next_due, floor), idle)

        try:
            await asyncio.wait_for(stop.wait(), timeout=delay)
        except asyncio.TimeoutError:
            pass  # normal: interval elapsed, run again
