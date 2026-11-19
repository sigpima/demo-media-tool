from datetime import datetime

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from ..services import auth
from ..services.security import client_ip

router = APIRouter()

INVALID = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Invite link</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0e12;color:#e2e2e8;font:15px/1.5 system-ui,sans-serif">
<main style="max-width:26rem;padding:2rem;text-align:center"><h1 style="font-size:1.25rem;margin:0 0 .5rem">This invite link is not valid</h1>
<p style="color:#9ca3af;margin:0">It may have expired or been revoked. Please ask for a new one.</p></main>"""


@router.get("/invite/{token}", include_in_schema=False)
def accept_invite(token: str, request: Request):
    """Exchange an invite token for a session cookie, then go to the app."""
    settings, store = request.app.state.settings, request.app.state.invites
    invite = store.lookup(token)
    if invite is None:
        if not request.app.state.limiters["auth"].allow(client_ip(request, settings)):  # slow down token guessing
            return HTMLResponse(INVALID, status_code=429)
        return HTMLResponse(INVALID, status_code=404)
    remaining = int((invite.expires() - store.now()).total_seconds())
    response = RedirectResponse("/", status_code=303)
    response.set_cookie(auth.COOKIE, token, max_age=max(remaining, 1), httponly=True, secure=settings.cookie_secure, samesite="lax", path="/")
    return response
