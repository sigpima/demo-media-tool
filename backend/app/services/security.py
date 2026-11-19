"""Rate limiting and client identification."""
import threading
import time
from collections import deque

from fastapi import Request

from ..config import Settings


class RateLimiter:
    """Sliding-window limiter, in memory. Fine because the app runs a single process (see README)."""

    def __init__(self, limit: int, window_s: float):
        self.limit, self.window = limit, window_s
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def purge(self) -> None:
        now = time.monotonic()
        with self._lock:
            for key in [k for k, q in self._hits.items() if not q or now - q[-1] > self.window]:
                del self._hits[key]


def client_ip(request: Request, settings: Settings) -> str:
    """With trust_proxy, use what nginx saw (it overwrites X-Real-IP, so clients cannot forge it)."""
    if settings.trust_proxy:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()  # rightmost = added by our own proxy
    return request.client.host if request.client else "unknown"
