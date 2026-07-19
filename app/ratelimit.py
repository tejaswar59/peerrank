"""Tiny in-process fixed-window rate limiter. Good enough for a single-node dev
backend; swap for Redis-backed limiting when you run more than one process."""
import time
from collections import defaultdict

from fastapi import HTTPException, Request, status

# key -> list of request timestamps within the current window
_hits: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_calls: int, window_seconds: int, bucket: str):
    """Returns a FastAPI dependency limiting calls per client IP for this bucket."""

    def dependency(request: Request) -> None:
        client = request.client.host if request.client else "unknown"
        key = f"{bucket}:{client}"
        now = time.monotonic()
        recent = [t for t in _hits[key] if now - t < window_seconds]
        if len(recent) >= max_calls:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests, slow down.",
            )
        recent.append(now)
        _hits[key] = recent

    return dependency
