"""Expiry of finished polls.

A closed poll's leaderboard is readable for `settings.results_retention_seconds`
after it was computed. Then the poll is DELETED — roster, participation log,
ballots and snapshot together — and its links stop resolving.

This is deliberate deletion, not a hidden flag: keeping the rows around and
merely refusing to serve them would leave the data sitting in the database
forever, which is exactly what "results disappear" is supposed to prevent. Once
this has run there is nothing to un-delete.

Everything is keyed off ResultSnapshot.computed_at (when the leaderboard was
frozen), NOT closes_at — a manual close ends a poll before closes_at, so
closes_at can still be in the future for an already-finished poll and would
hand out extra retention. closes_at is only the fallback for the impossible
case of a closed poll with no snapshot.
"""
import logging
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import models
from .config import settings
from .database import SessionLocal
from .models import utcnow

log = logging.getLogger("peerrank.retention")


def retention_enabled() -> bool:
    return settings.results_retention_seconds > 0


def expires_at(computed_at):
    """When a leaderboard frozen at `computed_at` stops being readable.

    None when retention is disabled, which the API renders as a null field
    meaning "this never expires".
    """
    if not retention_enabled():
        return None
    return computed_at + timedelta(seconds=settings.results_retention_seconds)


def purge_poll(db: Session, poll_id: int) -> None:
    """Delete one poll and every row that belongs to it.

    Children are deleted explicitly rather than relying on ON DELETE CASCADE:
    SQLite enforces foreign keys only when PRAGMA foreign_keys is ON, so leaning
    on the cascade would silently orphan ballots on SQLite while working fine on
    Postgres — the worst kind of difference between dev and production, because
    the leftovers would be the vote data itself.
    """
    for table in (
        models.Ballot,
        models.ParticipationLog,
        models.ResultSnapshot,
        models.Candidate,
    ):
        db.execute(delete(table).where(table.poll_id == poll_id))
    db.execute(delete(models.Poll).where(models.Poll.id == poll_id))


def run_purge_once() -> tuple[int, float | None]:
    """Delete every closed poll past its retention window.

    Returns (how many were purged, seconds until the next one is due to expire).
    The second value lets the sweep loop sleep exactly that long instead of
    waking on a fixed heartbeat; it is None when nothing is pending.
    """
    if not retention_enabled():
        return 0, None

    db = SessionLocal()
    purged = 0
    next_due: float | None = None
    try:
        now = utcnow()
        rows = db.execute(
            select(
                models.Poll.id,
                models.Poll.closes_at,
                models.ResultSnapshot.computed_at,
            )
            .join(
                models.ResultSnapshot,
                models.ResultSnapshot.poll_id == models.Poll.id,
                isouter=True,
            )
            .where(models.Poll.status == "closed")
        ).all()

        for poll_id, closes_at, computed_at in rows:
            deadline = expires_at(computed_at or closes_at)
            if deadline is None:
                continue
            if deadline <= now:
                purge_poll(db, poll_id)
                purged += 1
            else:
                due_in = (deadline - now).total_seconds()
                next_due = due_in if next_due is None else min(next_due, due_in)

        if purged:
            db.commit()
            # Count only. The poll's name and tokens are deliberately absent —
            # logging them would outlive the data they identify.
            log.info("purged %d expired poll(s)", purged)
        return purged, next_due
    except Exception:  # a bad purge must never kill the sweep loop
        db.rollback()
        log.exception("purge failed")
        return 0, None
    finally:
        db.close()
