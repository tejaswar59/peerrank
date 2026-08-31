"""Tiny in-process fixed-window rate limiter. Good enough for a single-node dev
backend; swap for Redis-backed limiting when you run more than one process."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

# key -> list of request timestamps within the current window
_hits: dict[str, list[float]] = defaultdict(list)


def _consume(key: str, max_calls: int, window_seconds: int) -> None:
    """Record one hit against `key`, raising 429 if the window is already full."""
    now = time.monotonic()
    recent = [t for t in _hits[key] if now - t < window_seconds]
    if len(recent) >= max_calls:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests, slow down.",
        )
    recent.append(now)
    _hits[key] = recent
    # Drop fully-expired buckets so _hits can't grow without bound.
    if len(_hits) > 2048:
        for k in [k for k, v in _hits.items() if not v or now - v[-1] > window_seconds]:
            del _hits[k]


def rate_limit(max_calls: int, window_seconds: int, bucket: str):
    """Returns a FastAPI dependency limiting calls per client IP for this bucket.

    Only correct for routes reachable without a session. Behind a reverse proxy
    that uvicorn does not trust (see FORWARDED_ALLOW_IPS), every request reports
    the proxy's IP and this collapses to one shared bucket - so for signed-in
    routes prefer rate_limit_by_user, which keys on a real identity.
    """

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        _consume(f"{bucket}:{client}", max_calls, window_seconds)

    return dependency


def rate_limit_by_user(max_calls: int, window_seconds: int, bucket: str):
    """Per-signed-in-user limiter for routes that already require a session.

    Unauthenticated callers are deliberately NOT counted: this runs as a
    route-level dependency, so it resolves before the endpoint's own
    get_current_user, and counting anonymous hits would let anyone exhaust a
    shared bucket and lock real voters out. Those requests still get their 401
    from the endpoint - they just cannot consume anyone else's budget.
    """

    def dependency(request: Request) -> None:
        user = request.session.get("user") or {}
        email = (user.get("email") or "").lower().strip()
        if not email:
            return
        _consume(f"{bucket}:{email}", max_calls, window_seconds)

    return dependency
