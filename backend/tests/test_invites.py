import json
import logging
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import invites as cli
from app.config import Settings
from app.main import create_app
from app.services.auth import MaskInviteTokens
from app.services.invites import InviteStore
from .conftest import jpeg

ADMIN = ("admin", "a-long-enough-pw")


def make(tmp_path, **kw):
    settings = Settings(storage_dir=tmp_path, basic_auth_user=ADMIN[0], basic_auth_password=ADMIN[1], cookie_secure=False, **kw)
    return settings, TestClient(create_app(settings))


def new_invite(settings, label="ACME HR", days=7):
    """Created through a *separate* store, exactly like the CLI does while the server keeps running."""
    return InviteStore(settings).create(label, days)


def accept(c, token):
    return c.get(f"/invite/{token}", follow_redirects=False)


def up(c, batch, *names, data=None):
    files = [("files", (n, data or jpeg(), "image/jpeg")) for n in names]
    return c.post(f"/api/batches/{batch}/assets", files=files)


# ------------------------------------------------------------------------------------ the link itself
def test_only_a_hash_of_the_token_is_stored(tmp_path):
    settings, _ = make(tmp_path)
    inv, token = new_invite(settings)
    raw = (tmp_path / "invites.json").read_text()
    assert token not in raw and inv.token_hash in raw and "ACME HR" in raw


def test_valid_link_sets_a_locked_down_session_cookie_and_redirects(tmp_path):
    settings = Settings(storage_dir=tmp_path, basic_auth_user="admin", basic_auth_password=ADMIN[1])  # default: cookie_secure=True
    inv, token = new_invite(settings)
    with TestClient(create_app(settings)) as c:
        r = accept(c, token)
        assert r.status_code == 303 and r.headers["location"] == "/"
        cookie = r.headers["set-cookie"].lower()
        assert all(flag in cookie for flag in ("httponly", "secure", "samesite=lax", "path=/"))
        max_age = int(cookie.split("max-age=")[1].split(";")[0])
        assert 7 * 86400 - 60 <= max_age <= 7 * 86400
        assert r.headers["cache-control"] == "no-store" and r.headers["referrer-policy"] == "no-referrer"


def test_invalid_link_gives_no_cookie_and_guessing_is_rate_limited(tmp_path):
    settings, _ = make(tmp_path, rate_auth_failures_per_min=3)
    with TestClient(create_app(settings)) as c:
        codes = [accept(c, f"guess-{i}").status_code for i in range(5)]
        assert codes == [404, 404, 404, 429, 429]
        assert "set-cookie" not in accept(c, "x").headers


def test_token_never_appears_in_the_access_log():
    f = MaskInviteTokens()
    rec = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', ("1.2.3.4:5", "GET", "/invite/SECRET-TOKEN", "1.1", 303), None)
    f.filter(rec)
    assert "SECRET-TOKEN" not in rec.getMessage() and "/invite/***" in rec.getMessage()
    other = logging.LogRecord("uvicorn.access", logging.INFO, "", 0, '%s - "%s %s HTTP/%s" %d', ("1.2.3.4:5", "GET", "/api/health", "1.1", 200), None)
    f.filter(other)
    assert "/api/health" in other.getMessage()


# ------------------------------------------------------------------------------------ what a guest can do
def test_guest_gets_in_without_a_password_and_anonymous_does_not(tmp_path):
    settings, c = make(tmp_path)
    _, token = new_invite(settings)
    with c:
        anon = c.post("/api/batches")
        assert anon.status_code == 401 and anon.headers["www-authenticate"].startswith("Basic")
        accept(c, token)
        assert c.post("/api/batches").status_code == 201
        assert c.get("/api/config").json()["role"] == "guest"


def test_admin_password_still_works_and_is_not_limited_like_a_guest(tmp_path):
    settings, c = make(tmp_path)
    with c:
        cfg = c.get("/api/config", auth=ADMIN).json()
        assert (cfg["role"], cfg["maxFilesPerBatch"], cfg["maxFileMb"], cfg["imagesLeftToday"]) == ("admin", 100, 25, None)


def test_guest_config_reports_the_smaller_limits(tmp_path):
    settings, c = make(tmp_path)
    inv, token = new_invite(settings)
    with c:
        accept(c, token)
        cfg = c.get("/api/config").json()
        assert (cfg["role"], cfg["maxFilesPerBatch"], cfg["maxFileMb"], cfg["imagesLeftToday"]) == ("guest", 20, 10, 200)
        assert cfg["inviteExpiresAt"] == inv.expires_at


def test_guest_file_count_and_size_limits(tmp_path):
    settings, c = make(tmp_path, invite_max_files_per_batch=2, invite_max_file_mb=1)
    _, token = new_invite(settings)
    with c:
        accept(c, token)
        b = c.post("/api/batches").json()["id"]
        big = b"\xff\xd8" + b"0" * (1024 * 1024 + 10)
        assert "Larger than 1 MB" in up(c, b, "big.jpg", data=big).json()["results"][0]["error"]
        assert up(c, b, "1.jpg").json()["results"][0]["asset"] and up(c, b, "2.jpg").json()["results"][0]["asset"]
        assert "Limit of 2 files" in up(c, b, "3.jpg").json()["results"][0]["error"]


def test_daily_image_quota_and_rollover(tmp_path):
    settings, c = make(tmp_path, invite_images_per_day=2)
    inv, token = new_invite(settings)
    with c:
        accept(c, token)
        b = c.post("/api/batches").json()["id"]
        res = [up(c, b, f"{i}.jpg").json()["results"][0] for i in range(3)]
        assert [bool(r["asset"]) for r in res] == [True, True, False]
        assert "Daily limit of 2 images" in res[2]["error"]
        assert c.get("/api/config").json()["imagesLeftToday"] == 0

        store = c.app.state.invites
        store.flush()
        assert InviteStore(settings).images_today(inv.id) == 2  # survives a restart
        store.now = lambda real=store.now: real() + timedelta(days=1)  # next day
        assert c.get("/api/config").json()["imagesLeftToday"] == 2


# ------------------------------------------------------------------------------------ lifecycle of a link
def test_expired_link_stops_working_with_a_friendly_message(tmp_path):
    settings, c = make(tmp_path)
    _, token = new_invite(settings, days=7)
    with c:
        accept(c, token)
        c.app.state.invites.now = lambda: datetime.now(timezone.utc) + timedelta(days=8)
        api = c.post("/api/batches")
        assert api.status_code == 401 and "expired" in api.json()["detail"] and "www-authenticate" not in api.headers
        page = c.get("/")
        assert page.status_code == 401 and "no longer valid" in page.text and "www-authenticate" not in page.headers
        assert accept(c, token).status_code == 404  # the link itself is dead too


def test_revoking_takes_effect_immediately_without_restart(tmp_path, capsys):
    settings, c = make(tmp_path)
    inv, token = new_invite(settings)
    with c:
        accept(c, token)
        assert c.post("/api/batches").status_code == 201
        assert cli.main(["revoke", inv.id], settings) == 0
        assert c.post("/api/batches").status_code == 401
        assert accept(c, token).status_code == 404
        assert cli.main(["revoke", inv.id], settings) == 1  # already revoked


def test_a_link_created_while_the_server_runs_works_at_once(tmp_path):
    settings, c = make(tmp_path)
    with c:
        assert accept(c, "nothing-yet").status_code == 404
        _, token = new_invite(settings)
        assert accept(c, token).status_code == 303


def test_corrupt_invites_file_does_not_lock_everyone_out(tmp_path):
    settings, c = make(tmp_path)
    _, token = new_invite(settings)
    with c:
        assert accept(c, token).status_code == 303
        (tmp_path / "invites.json").write_text("{ not json")
        assert c.post("/api/batches").status_code == 201  # last good copy keeps serving


def test_guests_cannot_see_each_others_batches(tmp_path):
    settings, _ = make(tmp_path)
    _, t1 = new_invite(settings, "one")
    _, t2 = new_invite(settings, "two")
    app = create_app(settings)
    with TestClient(app) as a, TestClient(app) as b:
        accept(a, t1)
        accept(b, t2)
        batch = a.post("/api/batches").json()["id"]
        assert a.get(f"/api/batches/{batch}/status").status_code == 200
        assert b.get(f"/api/batches/{batch}/status").status_code == 404
        assert b.delete(f"/api/batches/{batch}").status_code == 404


def test_admin_is_a_separate_owner_from_guests(tmp_path):
    settings, c = make(tmp_path)
    _, token = new_invite(settings)
    with c:
        accept(c, token)
        batch = c.post("/api/batches").json()["id"]
        assert c.get(f"/api/batches/{batch}/status", auth=ADMIN).status_code == 404


# ------------------------------------------------------------------------------------ cross-site protection
def test_cross_site_state_changes_are_blocked_but_normal_use_is_not(tmp_path):
    settings, c = make(tmp_path)
    with c:
        ok = {"auth": ADMIN}
        assert c.post("/api/batches", headers={"Origin": "https://evil.example"}, **ok).status_code == 403
        assert c.post("/api/batches", headers={"Sec-Fetch-Site": "cross-site"}, **ok).status_code == 403
        assert c.post("/api/batches", headers={"Sec-Fetch-Site": "same-site"}, **ok).status_code == 403
        assert c.post("/api/batches", headers={"Origin": "http://testserver"}, **ok).status_code == 201
        assert c.post("/api/batches", headers={"Sec-Fetch-Site": "same-origin"}, **ok).status_code == 201
        assert c.post("/api/batches", **ok).status_code == 201  # curl / scripts
        assert c.get("/api/config", headers={"Sec-Fetch-Site": "cross-site"}, **ok).status_code == 200  # reads are not state-changing


def test_login_page_always_offers_the_password_prompt(tmp_path):
    settings, c = make(tmp_path)
    _, token = new_invite(settings)
    with c:
        accept(c, token)
        c.app.state.invites.now = lambda: datetime.now(timezone.utc) + timedelta(days=30)
        stale = c.get("/login")
        assert stale.status_code == 401 and stale.headers["www-authenticate"].startswith("Basic")
        ok = c.get("/login", auth=ADMIN, follow_redirects=False)
        assert ok.status_code == 303 and ok.headers["location"] == "/"


# ------------------------------------------------------------------------------------ the CLI
def test_cli_create_list_and_validation(tmp_path, capsys):
    settings = Settings(storage_dir=tmp_path)
    assert cli.main(["create", "--label", "Beta Co", "--days", "3", "--base-url", "https://tools.example.com/"], settings) == 0
    out = capsys.readouterr().out
    url = next(line.strip() for line in out.splitlines() if "/invite/" in line)
    assert url.startswith("https://tools.example.com/invite/") and "shown only once" in out
    token = url.rsplit("/", 1)[1]
    assert InviteStore(settings).lookup(token).label == "Beta Co"

    assert cli.main(["list"], settings) == 0
    listing = capsys.readouterr().out
    assert "Beta Co" in listing and "active" in listing
    assert cli.main(["create", "--label", "x", "--days", "0"], settings) == 2
    assert cli.main(["create", "--label", "x", "--days", "91"], settings) == 2


def test_default_lifetime_is_seven_days(tmp_path):
    inv, _ = InviteStore(Settings(storage_dir=tmp_path)).create("x", Settings().invite_ttl_days)
    assert (inv.expires() - InviteStore(Settings(storage_dir=tmp_path)).now()).days == 6  # 7 days minus the seconds already elapsed


@pytest.mark.parametrize("bad", ["", " ", "a" * 500])
def test_lookup_rejects_junk_tokens(tmp_path, bad):
    assert InviteStore(Settings(storage_dir=tmp_path)).lookup(bad) is None
