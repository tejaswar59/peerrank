"""Tiny in-process fixed-window rate limiter. Good enough for a single-node dev
backend; swap for Redis-backed limiting when you run more than one process."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

from .config import settings

# key -> list of request timestamps within the current window
_hits: dict[str, list[float]] = defaultdict(list)

# How many idle keys to tolerate before sweeping. Without this the dict grows
# with every distinct client IP ever seen and is never reclaimed — behind a
# proxy with real client IPs (which --proxy-headers gives us) that is an
# unbounded structure.
_MAX_KEYS = 10_000


def _prune(now: float) -> None:
    """Drop keys whose newest entry is older than the longest window we use."""
    horizon = max(
        settings.submit_rate_window,
        settings.create_rate_window,
        settings.lookup_miss_window,
    )
    for key in [k for k, v in _hits.items() if not v or now - v[-1] > horizon]:
        _hits.pop(key, None)


def _client(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _record(key: str, max_calls: int, window_seconds: int) -> bool:
    """Record a hit. Returns False when the caller is over the limit."""
    now = time.monotonic()
    if len(_hits) > _MAX_KEYS:
        _prune(now)
    recent = [t for t in _hits[key] if now - t < window_seconds]
    if len(recent) >= max_calls:
        _hits[key] = recent
        return False
    recent.append(now)
    _hits[key] = recent
    return True


def rate_limit(max_calls: int, window_seconds: int, bucket: str):
    """Returns a FastAPI dependency limiting calls per client IP for this bucket."""

    def dependency(request: Request) -> None:
        if not _record(f"{bucket}:{_client(request)}", max_calls, window_seconds):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, slow down.",
            )

    return dependency


_TOO_MANY_MISSES = HTTPException(
    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
    detail="Too many invalid links tried. Wait a moment and try again.",
)


def enforce_lookup_budget(request: Request) -> None:
    """Refuse a token lookup outright once this client has missed too often.

    Called BEFORE the database lookup, and this ordering is the whole point.
    Throttling only the miss path would still answer 429 for a wrong token and
    200 for a right one — so an attacker could keep firing at full speed and
    simply watch for the status code to change. That limits misses without
    limiting *guessing*, which is the thing worth stopping.

    Checking first means a client that is over budget learns nothing at all:
    every lookup, valid or not, is a 429.
    """
    now = time.monotonic()
    key = f"miss:{_client(request)}"
    recent = [t for t in _hits.get(key, []) if now - t < settings.lookup_miss_window]
    _hits[key] = recent
    if len(recent) >= settings.lookup_miss_max:
        raise _TOO_MANY_MISSES


def note_lookup_miss(request: Request) -> None:
    """Record a failed token lookup.

    Only misses are counted, which is what keeps ordinary use unaffected: a
    whole team votes from one office NAT and the page polls /status every few
    seconds, and every one of those requests HITS. A blanket per-IP limit on
    /status would break that team. Guessing produces nothing but misses.
    """
    ok = _record(
        f"miss:{_client(request)}",
        settings.lookup_miss_max,
        settings.lookup_miss_window,
    )
    if not ok:
        raise _TOO_MANY_MISSES
