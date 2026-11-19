import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles

from .config import Settings
from .routes import batches
from .routes import invites as invite_routes
from .services import auth
from .services.batch_service import ApiError, BatchService
from .services.invites import InviteStore
from .services.security import RateLimiter, client_ip

log = logging.getLogger("cbt")

CSP = (
    "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; "
    "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
)

PAGE = """<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Creative Batch Toolkit</title>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0e12;color:#e2e2e8;font:15px/1.5 system-ui,sans-serif">
<main style="max-width:26rem;padding:2rem;text-align:center"><h1 style="font-size:1.25rem;margin:0 0 .5rem">{title}</h1>
<p style="color:#9ca3af;margin:0 0 1.25rem">{body}</p><a href="/login" style="color:#818cf8">Sign in with a password</a></main>"""


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()
    if settings.require_auth and not (settings.auth_enabled and len(settings.basic_auth_password) >= 12):
        raise RuntimeError("CBT_REQUIRE_AUTH is on: set CBT_BASIC_AUTH_USER and a CBT_BASIC_AUTH_PASSWORD of at least 12 characters.")
    logging.getLogger("uvicorn.access").addFilter(auth.MaskInviteTokens())
    service = BatchService(settings)
    invites = InviteStore(settings)
    limiters = {
        "batches": RateLimiter(settings.rate_batches_per_hour, 3600),
        "uploads": RateLimiter(settings.rate_uploads_per_min, 60),
        "process": RateLimiter(settings.rate_process_per_min, 60),
        "export": RateLimiter(settings.rate_export_per_min, 60),
        "auth": RateLimiter(settings.rate_auth_failures_per_min, 60),
    }

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        service.startup()
        if not settings.auth_enabled:
            log.warning("CBT_BASIC_AUTH_USER/PASSWORD not set: the app is OPEN to everyone. Do not expose it publicly like this.")

        async def janitor():
            while True:
                await asyncio.sleep(settings.cleanup_interval_s)
                removed = await asyncio.to_thread(service.purge_expired)
                await asyncio.to_thread(invites.flush)
                for limiter in limiters.values():
                    limiter.purge()
                if removed:
                    log.info("expired %d batch(es)", removed)

        task = asyncio.create_task(janitor())
        yield
        task.cancel()
        invites.flush()
        service.shutdown()

    app = FastAPI(title="Creative Batch Toolkit", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.settings, app.state.service, app.state.limiters, app.state.invites = settings, service, limiters, invites

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)

    @app.get("/login", include_in_schema=False)
    def login():  # only reached once the middleware has accepted the Basic credentials
        return RedirectResponse("/", status_code=303)

    @app.middleware("http")
    async def access_control_and_headers(request: Request, call_next):
        response = _authenticate(request, settings, invites, limiters["auth"])
        if response is None:
            response = await call_next(request)
        response.headers["Content-Security-Policy"] = CSP
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        if request.url.path.startswith(("/api/", "/invite/", "/login")):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(invite_routes.router)
    app.include_router(batches.router)

    static = settings.static_dir
    if static and static.exists():
        app.mount("/", StaticFiles(directory=static, html=True), name="web")
    return app


def _challenge() -> Response:
    return Response("Authentication required", status_code=401, headers={"WWW-Authenticate": 'Basic realm="Creative Batch Toolkit", charset="UTF-8"'})


def _authenticate(request: Request, settings: Settings, invites: InviteStore, failures: RateLimiter) -> Response | None:
    """Sets request.state.principal, or returns the response to short-circuit with."""
    path = request.url.path
    if path == "/api/health" or path.startswith("/invite/"):  # health: Docker healthcheck; invite: the way in for guests
        request.state.principal = None
        return None
    if not auth.same_origin_ok(request):
        return JSONResponse({"detail": "Cross-site request blocked."}, status_code=403)
    if not settings.auth_enabled:
        request.state.principal = auth.admin(settings)
        return None

    basic = auth.basic_credentials_ok(request, settings)
    if basic:
        request.state.principal = auth.admin(settings)
        return None
    token = request.cookies.get(auth.COOKIE)
    invite = invites.lookup(token) if token else None
    if invite:
        request.state.principal = auth.guest(settings, invite)
        return None

    if basic is False and not failures.allow(client_ip(request, settings)):
        return JSONResponse({"detail": "Too many failed attempts. Try again in a minute."}, status_code=429)
    if token and basic is None and path != "/login":  # had a link once, it no longer works: explain instead of asking for a password
        msg = "Your invite link has expired or was revoked. Ask for a new one."
        if path.startswith("/api/"):
            return JSONResponse({"detail": msg}, status_code=401)
        return HTMLResponse(PAGE.format(title="This invite is no longer valid", body=msg), status_code=401)
    return _challenge()


app = create_app()  # `uvicorn app.main:app` — configuration comes from CBT_* env vars
