import io
import threading
import time
import zipfile

from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app
from app.services import batch_service
from .conftest import jpeg, new_batch, png, process, recipe, truncated_jpeg, upload, wait_idle, webp


def ids(results):
    return [r["asset"]["id"] for r in results if r.get("asset")]


# ------------------------------------------------------------------------------------ upload
def test_upload_reads_real_format_and_dimensions(client):
    b = new_batch(client)
    res = upload(client, b, ("a.jpg", jpeg(300, 200), "image/jpeg"), ("b.png", png(50, 80), "image/png"), ("c.webp", webp(40, 40), "image/webp"))
    got = [(r["asset"]["format"], r["asset"]["width"], r["asset"]["height"]) for r in res]
    assert got == [("jpeg", 300, 200), ("png", 50, 80), ("webp", 40, 40)]


def test_client_supplied_mime_and_extension_are_ignored(client):
    b = new_batch(client)
    res = upload(client, b, ("looks-like.jpg", png(10, 10), "image/jpeg"))  # a PNG pretending to be a JPEG
    assert res[0]["asset"]["format"] == "png"


def test_fake_and_unsupported_files_are_rejected_with_a_reason(client):
    b = new_batch(client)
    res = upload(client, b, ("evil.jpg", b"<html><script>alert(1)</script>", "image/jpeg"), ("empty.png", b"", "image/png"))
    assert all(r["asset"] is None and r["error"] for r in res)
    assert client.get(f"/api/batches/{b}/status").json()["assets"] == []


def test_size_and_count_limits(client):
    b = new_batch(client)
    big = b"\xff\xd8" + b"0" * (2 * 1024 * 1024 + 10)  # > 2 MB test limit
    assert "Larger than 2 MB" in upload(client, b, ("big.jpg", big, "image/jpeg"))[0]["error"]
    for i in range(5):
        assert upload(client, b, (f"{i}.jpg", jpeg(), "image/jpeg"))[0]["asset"]
    assert "Limit of 5 files" in upload(client, b, ("6.jpg", jpeg(), "image/jpeg"))[0]["error"]


def test_hostile_file_names_never_reach_the_filesystem(client, settings):
    b = new_batch(client)
    res = upload(client, b, ("../../../../tmp/pwned.jpg", jpeg(), "image/jpeg"), ("..\\..\\win.jpg", jpeg(), "image/jpeg"))
    assert [r["asset"]["name"] for r in res] == ["pwned.jpg", "win.jpg"]
    stored = list((settings.storage_dir / "batches" / b / "uploads").iterdir())
    assert len(stored) == 2 and all(len(p.name) == 32 for p in stored)  # internal ids only


def test_bad_batch_ids_are_not_found(client):
    for bad in ("nope", "..%2F..%2Fetc", "0" * 32, "G" * 32):
        assert client.get(f"/api/batches/{bad}/status").status_code == 404


# ------------------------------------------------------------------------------------ processing
def test_process_download_and_names(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("one.jpg", jpeg(400, 300), "image/jpeg"), ("two.png", png(100, 100), "image/png")))
    data = process(client, b, a, format="jpeg", width=200, height=200, prefix="shot")
    assets = {x["id"]: x for x in data["assets"]}
    assert [assets[i]["status"] for i in a] == ["completed", "completed"]
    assert [assets[i]["outName"] for i in a] == ["shot_001.jpg", "shot_002.jpg"]
    assert (assets[a[0]]["outWidth"], assets[a[0]]["outHeight"]) == (200, 150)  # fit, aspect kept

    r = client.get(f"/api/batches/{b}/assets/{a[0]}/download")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert 'attachment; filename="shot_001.jpg"' in r.headers["content-disposition"]
    assert Image.open(io.BytesIO(r.content)).size == (200, 150)
    assert len(r.content) == assets[a[0]]["outSize"]  # the reported size is the real size, not an estimate
    assert client.get(f"/api/batches/{b}/assets/{a[0]}/output").headers["content-disposition"].startswith("inline")


def test_one_broken_file_does_not_stop_the_batch_and_can_be_retried(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("ok1.jpg", jpeg(), "image/jpeg"), ("broken.jpg", truncated_jpeg(), "image/jpeg"), ("ok2.png", png(), "image/png")))
    data = process(client, b, a)
    st = {x["name"]: x for x in data["assets"]}
    assert (st["ok1.jpg"]["status"], st["ok2.png"]["status"]) == ("completed", "completed")
    assert st["broken.jpg"]["status"] == "failed" and "Cannot decode" in st["broken.jpg"]["error"]

    again = process(client, b, a)  # no reset: only the failed asset is attempted again
    assert {x["name"]: x["status"] for x in again["assets"]} == {"ok1.jpg": "completed", "broken.jpg": "failed", "ok2.png": "completed"}
    assert client.get(f"/api/batches/{b}/assets/{a[1]}/download").status_code == 409  # nothing to download for a failed asset


def test_names_stay_stable_on_retry_and_never_collide(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("x.jpg", jpeg(), "image/jpeg"), ("y.jpg", truncated_jpeg(), "image/jpeg"), ("z.jpg", jpeg(), "image/jpeg")))
    first = {x["id"]: x.get("outName") for x in process(client, b, a)["assets"]}
    assert first[a[0]] == "img_001.webp" and first[a[2]] == "img_003.webp"
    # the broken file keeps position 2, so retrying never renumbers the others
    second = {x["id"]: x.get("outName") for x in process(client, b, a)["assets"]}
    assert second[a[0]] == "img_001.webp" and second[a[2]] == "img_003.webp"


def test_same_name_pattern_gets_unique_suffixes(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("same.jpg", jpeg(), "image/jpeg"), ("same.png", png(), "image/png")))
    data = process(client, b, a, pattern="{name}", prefix="")
    assert sorted(x["outName"] for x in data["assets"]) == ["same.webp", "same_2.webp"]


def test_reset_reprocesses_with_new_settings(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("a.jpg", jpeg(400, 400), "image/jpeg")))
    process(client, b, a, format="jpeg")
    data = process(client, b, a, reset=True, format="png", width=50, height=50)
    x = data["assets"][0]
    assert (x["outFormat"], x["outWidth"], x["outName"].endswith(".png"), x["outQuality"]) == ("png", 50, True, None)


def test_concurrency_never_exceeds_the_limit(client, monkeypatch):
    live, peak, lock = 0, 0, threading.Lock()
    real = batch_service.process_image

    def slow(*args, **kw):
        nonlocal live, peak
        with lock:
            live += 1
            peak = max(peak, live)
        time.sleep(0.15)
        try:
            return real(*args, **kw)
        finally:
            with lock:
                live -= 1

    monkeypatch.setattr(batch_service, "process_image", slow)
    b = new_batch(client)
    a = ids(upload(client, b, *[(f"{i}.jpg", jpeg(), "image/jpeg") for i in range(5)]))  # 5 = per-batch limit in tests
    data = process(client, b, a)
    assert all(x["status"] == "completed" for x in data["assets"])
    assert peak == 2  # == settings.concurrency in tests


def test_cannot_start_twice_or_delete_while_busy(client, monkeypatch):
    gate = threading.Event()
    real = batch_service.process_image
    monkeypatch.setattr(batch_service, "process_image", lambda *a, **k: (gate.wait(5), real(*a, **k))[1])
    b = new_batch(client)
    a = ids(upload(client, b, ("a.jpg", jpeg(), "image/jpeg")))
    assert client.post(f"/api/batches/{b}/process", json={"assetIds": a, "settings": recipe()}).status_code == 202
    assert client.post(f"/api/batches/{b}/process", json={"assetIds": a, "settings": recipe()}).status_code == 409
    assert client.delete(f"/api/batches/{b}/assets/{a[0]}").status_code == 409
    gate.set()
    wait_idle(client, b)
    assert client.delete(f"/api/batches/{b}/assets/{a[0]}").status_code == 204


def test_invalid_recipes_are_rejected(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("a.jpg", jpeg(), "image/jpeg")))
    for bad in (recipe(width=0), recipe(quality=101), recipe(format="avif"), recipe(background="red"), recipe(width=9000)):
        assert client.post(f"/api/batches/{b}/process", json={"assetIds": a, "settings": bad}).status_code == 422
    assert client.post(f"/api/batches/{b}/process", json={"assetIds": ["x" * 32], "settings": recipe()}).status_code == 422


# ------------------------------------------------------------------------------------ export
def test_export_zip_contains_files_manifest_and_report(client):
    b = new_batch(client)
    a = ids(upload(client, b, ("=cmd.jpg", jpeg(), "image/jpeg"), ("broken.jpg", truncated_jpeg(), "image/jpeg"), ("ok.png", png(), "image/png")))
    process(client, b, a, prefix="exp")
    r = client.get(f"/api/batches/{b}/export")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    z = zipfile.ZipFile(io.BytesIO(r.content))
    names = z.namelist()
    folder = names[0].split("/")[0]
    assert folder.startswith("creative_batch_") and r.headers["content-disposition"].count(folder) == 1
    assert sorted(n for n in names if "/processed/" in n) == [f"{folder}/processed/exp_001.webp", f"{folder}/processed/exp_003.webp"]
    assert z.testzip() is None
    for n in names:
        if n.endswith(".webp"):
            Image.open(io.BytesIO(z.read(n))).verify()

    import json

    manifest = json.loads(z.read(f"{folder}/manifest.json"))
    assert manifest["stats"]["completed"] == 2 and manifest["stats"]["failed"] == 1 and manifest["settings"]["format"] == "webp"
    report = z.read(f"{folder}/processing_report.csv").decode().splitlines()
    assert report[0] == "original_name,output_name,status,original_size,output_size,error"
    assert report[1].startswith("'=cmd.jpg,")  # formula injection neutralised
    assert "broken.jpg,,failed" in report[2] and "Cannot decode" in report[2]


def test_export_without_results_is_a_clear_error_and_leaves_no_temp_files(client, settings):
    b = new_batch(client)
    upload(client, b, ("a.jpg", jpeg(), "image/jpeg"))
    assert client.get(f"/api/batches/{b}/export").status_code == 409
    a = [x["id"] for x in client.get(f"/api/batches/{b}/status").json()["assets"]]
    process(client, b, a)
    assert client.get(f"/api/batches/{b}/export").status_code == 200
    assert not list((settings.storage_dir / "batches" / b).glob("*.zip"))  # zip removed after sending


# ------------------------------------------------------------------------------------ lifecycle
def test_delete_batch_removes_files(client, settings):
    b = new_batch(client)
    upload(client, b, ("a.jpg", jpeg(), "image/jpeg"))
    assert (settings.storage_dir / "batches" / b).exists()
    assert client.delete(f"/api/batches/{b}").status_code == 204
    assert not (settings.storage_dir / "batches" / b).exists()
    assert client.get(f"/api/batches/{b}/status").status_code == 404


def test_expired_batches_are_purged(client, settings):
    svc = client.app.state.service
    b = new_batch(client)
    upload(client, b, ("a.jpg", jpeg(), "image/jpeg"))
    assert svc.purge_expired() == 0
    svc.batches[b].last_active -= 2 * 3600  # idle for longer than the 1 h TTL used in tests
    assert svc.purge_expired() == 1
    assert not (settings.storage_dir / "batches" / b).exists()


def test_startup_wipes_orphaned_files(tmp_path):
    s = Settings(storage_dir=tmp_path)
    (tmp_path / "batches" / "stale").mkdir(parents=True)
    (tmp_path / "batches" / "stale" / "x").write_bytes(b"1")
    with TestClient(create_app(s)):
        assert not (tmp_path / "batches" / "stale").exists()


def test_storage_cap(tmp_path):
    s = Settings(storage_dir=tmp_path, max_storage_mb=0)
    with TestClient(create_app(s)) as c:
        b = new_batch(c)
        r = c.post(f"/api/batches/{b}/assets", files=[("files", ("a.jpg", jpeg(), "image/jpeg"))])
        assert r.status_code == 507


# ------------------------------------------------------------------------------------ abuse protection
def test_rate_limit_on_batch_creation(tmp_path):
    with TestClient(create_app(Settings(storage_dir=tmp_path, rate_batches_per_hour=2))) as c:
        assert [c.post("/api/batches").status_code for _ in range(3)] == [201, 201, 429]


def test_active_batches_per_ip_are_capped(tmp_path):
    with TestClient(create_app(Settings(storage_dir=tmp_path, max_active_batches_per_ip=2))) as c:
        assert [c.post("/api/batches").status_code for _ in range(3)] == [201, 201, 429]


def test_upload_requires_content_length_and_respects_cap(client):
    b = new_batch(client)
    r = client.post(f"/api/batches/{b}/assets", files=[("files", ("a.jpg", b"x" * (25 * 1024 * 1024), "image/jpeg"))])
    assert r.status_code == 413


def test_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert "default-src 'self'" in r.headers["content-security-policy"]
    assert client.get("/api/config").headers["cache-control"] == "no-store"


def test_api_docs_are_not_exposed(client):
    assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404


# ------------------------------------------------------------------------------------ basic auth
def auth_client(tmp_path, **kw):
    return TestClient(create_app(Settings(storage_dir=tmp_path, basic_auth_user="admin", basic_auth_password="s3cret", **kw)))


def test_basic_auth_protects_everything_except_health(tmp_path):
    with auth_client(tmp_path) as c:
        assert c.get("/api/health").status_code == 200
        r = c.post("/api/batches")
        assert r.status_code == 401 and r.headers["www-authenticate"].startswith("Basic")
        assert c.post("/api/batches", auth=("admin", "wrong")).status_code == 401
        assert c.post("/api/batches", auth=("admin", "s3cret")).status_code == 201


def test_basic_auth_brute_force_is_rate_limited(tmp_path):
    with auth_client(tmp_path, rate_auth_failures_per_min=3) as c:
        codes = [c.get("/api/config", auth=("admin", f"guess{i}")).status_code for i in range(5)]
        assert codes == [401, 401, 401, 429, 429]


def test_static_frontend_is_served_behind_auth(tmp_path):
    web = tmp_path / "web"
    web.mkdir()
    (web / "index.html").write_text("<h1>app</h1>")
    s = Settings(storage_dir=tmp_path / "s", static_dir=web, basic_auth_user="a", basic_auth_password="b")
    with TestClient(create_app(s)) as c:
        assert c.get("/").status_code == 401
        r = c.get("/", auth=("a", "b"))
        assert r.status_code == 200 and "<h1>app</h1>" in r.text


def test_client_ip_uses_proxy_header_only_when_trusted(tmp_path):
    for trust in (True, False):  # trusted: two different X-Real-IP values are two clients; untrusted: header is ignored
        with TestClient(create_app(Settings(storage_dir=tmp_path / str(trust), rate_batches_per_hour=1, trust_proxy=trust))) as c:
            codes = [c.post("/api/batches", headers={"X-Real-IP": ip}).status_code for ip in ("1.1.1.1", "2.2.2.2")]
            assert codes.count(201) == (2 if trust else 1)


def test_require_auth_refuses_to_start_without_a_strong_password(tmp_path):
    import pytest

    for user, pw in (("", ""), ("admin", ""), ("admin", "short")):
        with pytest.raises(RuntimeError, match="CBT_REQUIRE_AUTH"):
            create_app(Settings(storage_dir=tmp_path, require_auth=True, basic_auth_user=user, basic_auth_password=pw))
    create_app(Settings(storage_dir=tmp_path, require_auth=True, basic_auth_user="admin", basic_auth_password="a-long-enough-pw"))
