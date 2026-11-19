"""Invite links: a revocable, expiring way to let someone try the app without a password.

Storage is two small JSON files on the data volume (no database):
  invites.json        written ONLY by the CLI (`python -m app.invites`); the server re-reads it when it changes,
                      so creating/revoking a link takes effect immediately without a restart.
  invite_usage.json   written ONLY by the server (images used per day, last use).
Only the SHA-256 of a token is stored, so a leaked data volume does not leak working links.
"""
import hashlib
import json
import os
import secrets
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from ..config import Settings

Clock = Callable[[], datetime]
_utcnow: Clock = lambda: datetime.now(timezone.utc)  # noqa: E731


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@dataclass(frozen=True)
class Invite:
    id: str
    label: str
    token_hash: str
    created_at: str
    expires_at: str
    revoked: bool = False

    def expires(self) -> datetime:
        return datetime.fromisoformat(self.expires_at)

    def status(self, now: datetime) -> str:
        return "revoked" if self.revoked else "expired" if now >= self.expires() else "active"


def _atomic_write(path: Path, data: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    os.replace(tmp, path)


class InviteStore:
    def __init__(self, settings: Settings, clock: Clock = _utcnow):
        self.s, self.now = settings, clock
        self.path = settings.storage_dir / "invites.json"
        self.usage_path = settings.storage_dir / "invite_usage.json"
        self._lock = threading.RLock()
        self._mtime: float | None = None
        self._by_hash: dict[str, Invite] = {}
        self._usage: dict[str, dict] = {}
        self._dirty, self._last_flush = False, 0.0
        self._load_usage()

    # ------------------------------------------------------------------ reading (server + CLI)
    def invites(self) -> list[Invite]:
        self._reload_if_changed()
        return list(self._by_hash.values())

    def _reload_if_changed(self) -> None:
        with self._lock:
            try:
                mtime = self.path.stat().st_mtime_ns
            except FileNotFoundError:
                self._by_hash, self._mtime = {}, None
                return
            if mtime == self._mtime:
                return
            try:
                rows = json.loads(self.path.read_text())
                self._by_hash = {r["token_hash"]: Invite(**r) for r in rows}
                self._mtime = mtime
            except (ValueError, TypeError, KeyError):
                pass  # half-written/corrupt file: keep serving the last good copy

    def lookup(self, token: str) -> Invite | None:
        """The invite for this token if it is currently valid, else None."""
        if not token or len(token) > 200:
            return None
        self._reload_if_changed()
        inv = self._by_hash.get(hash_token(token))
        return inv if inv and inv.status(self.now()) == "active" else None

    # ------------------------------------------------------------------ writing (CLI)
    def create(self, label: str, days: int) -> tuple[Invite, str]:
        token = secrets.token_urlsafe(24)  # 192 bits
        now = self.now()
        inv = Invite(secrets.token_hex(4), label.strip()[:80] or "guest", hash_token(token),
                     now.isoformat(timespec="seconds"), (now + timedelta(days=days)).isoformat(timespec="seconds"))
        _atomic_write(self.path, [asdict(i) for i in self.invites()] + [asdict(inv)])
        return inv, token

    def revoke(self, id_prefix: str) -> Invite | None:
        rows, hit = [], None
        for i in self.invites():
            if i.id.startswith(id_prefix) and not i.revoked and hit is None:
                i = Invite(**{**asdict(i), "revoked": True})
                hit = i
            rows.append(asdict(i))
        if hit:
            _atomic_write(self.path, rows)
        return hit

    # ------------------------------------------------------------------ usage (server)
    def _day(self) -> str:
        return self.now().strftime("%Y-%m-%d")

    def _load_usage(self) -> None:
        try:
            self._usage = json.loads(self.usage_path.read_text())
        except (FileNotFoundError, ValueError):
            self._usage = {}

    def images_today(self, invite_id: str) -> int:
        with self._lock:
            return self._usage.get(invite_id, {}).get("days", {}).get(self._day(), 0)

    def images_left_today(self, invite_id: str) -> int:
        return max(0, self.s.invite_images_per_day - self.images_today(invite_id))

    def total_images(self, invite_id: str) -> int:
        return self._usage.get(invite_id, {}).get("total", 0)

    def last_used(self, invite_id: str) -> str | None:
        return self._usage.get(invite_id, {}).get("last_used")

    def record_images(self, invite_id: str, n: int = 1) -> None:
        with self._lock:
            u = self._usage.setdefault(invite_id, {"total": 0, "days": {}, "first_used": self.now().isoformat(timespec="seconds")})
            day = self._day()
            u["days"][day] = u["days"].get(day, 0) + n
            u["total"] += n
            u["last_used"] = self.now().isoformat(timespec="seconds")
            u["days"] = dict(sorted(u["days"].items())[-3:])  # only the last few days matter
            self._dirty = True
            if time.monotonic() - self._last_flush > 5:
                self.flush()

    def flush(self) -> None:
        with self._lock:
            if self._dirty:
                _atomic_write(self.usage_path, self._usage)
                self._dirty, self._last_flush = False, time.monotonic()
