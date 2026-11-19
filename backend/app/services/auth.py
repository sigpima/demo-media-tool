"""Who is making the request, and what are they allowed to do."""
import base64
import logging
from dataclasses import dataclass
from hmac import compare_digest
from typing import Literal

from fastapi import Request

from ..config import Settings
from .invites import Invite

COOKIE = "cbt_invite"


@dataclass(frozen=True)
class Principal:
    kind: Literal["admin", "guest"]
    key: str  # owner of batches: "admin" or the invite id
    max_file_bytes: int
    max_files_per_batch: int
    invite: Invite | None = None


def admin(settings: Settings) -> Principal:
    return Principal("admin", "admin", settings.max_file_bytes, settings.max_files_per_batch)


def guest(settings: Settings, invite: Invite) -> Principal:
    return Principal("guest", invite.id, min(settings.invite_max_file_mb, settings.max_file_mb) * 1024 * 1024,
                     min(settings.invite_max_files_per_batch, settings.max_files_per_batch), invite)


def basic_credentials_ok(request: Request, settings: Settings) -> bool | None:
    """None = no Basic header sent; True/False = sent and correct/incorrect."""
    header = request.headers.get("authorization", "")
    if header[:6].lower() != "basic ":
        return None
    try:
        user, _, password = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except Exception:  # noqa: BLE001
        return False
    # `&` (not `and`) so both comparisons always run: no timing difference between wrong user and wrong password.
    return bool(compare_digest(user.encode(), settings.basic_auth_user.encode()) & compare_digest(password.encode(), settings.basic_auth_password.encode()))


def same_origin_ok(request: Request) -> bool:
    """CSRF guard for state-changing requests. Browsers attach Basic-auth/cookies to cross-site requests, so check where it came from.
    Non-browser clients (curl, scripts) send neither header and are allowed — they are not subject to CSRF."""
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return True
    site = request.headers.get("sec-fetch-site")
    if site is not None:
        return site in ("same-origin", "none")
    origin = request.headers.get("origin")
    if origin is not None:
        return origin.split("://", 1)[-1] == request.headers.get("host", "")
    return True


class MaskInviteTokens(logging.Filter):
    """Keep invite tokens out of the access log:  GET /invite/<token>  ->  GET /invite/***"""

    def filter(self, record: logging.LogRecord) -> bool:
        args = record.args
        if isinstance(args, tuple) and len(args) >= 3 and isinstance(args[2], str) and args[2].startswith("/invite/"):
            record.args = (*args[:2], "/invite/***", *args[3:])
        return True
