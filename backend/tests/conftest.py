import io
import time

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import Settings
from app.main import create_app


def make_image(w=200, h=100, color=(200, 60, 60), fmt="JPEG", mode="RGB", **save) -> bytes:
    im = Image.new(mode, (w, h), color)
    buf = io.BytesIO()
    im.save(buf, format=fmt, **save)
    return buf.getvalue()


def jpeg(w=200, h=100, **kw) -> bytes:
    return make_image(w, h, fmt="JPEG", **kw)


def png(w=200, h=100, **kw) -> bytes:
    return make_image(w, h, fmt="PNG", **kw)


def webp(w=200, h=100, **kw) -> bytes:
    return make_image(w, h, fmt="WEBP", **kw)


def truncated_jpeg() -> bytes:
    """Header is valid (upload accepts it) but the pixel data is cut off (processing must fail)."""
    noisy = Image.effect_noise((600, 600), 80).convert("RGB")
    buf = io.BytesIO()
    noisy.save(buf, format="JPEG", quality=90)
    data = buf.getvalue()
    return data[: int(len(data) * 0.5)]


@pytest.fixture
def settings(tmp_path):
    return Settings(
        storage_dir=tmp_path / "storage", max_file_mb=2, max_files_per_batch=5, max_pixels=4_000_000, concurrency=2,
        ttl_hours=1, rate_batches_per_hour=1000, rate_uploads_per_min=10_000, rate_process_per_min=10_000, rate_export_per_min=10_000,
    )


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def new_batch(client) -> str:
    r = client.post("/api/batches")
    assert r.status_code == 201, r.text
    return r.json()["id"]


def upload(client, batch_id, *files):
    """files: (filename, bytes, content_type)"""
    r = client.post(f"/api/batches/{batch_id}/assets", files=[("files", f) for f in files])
    assert r.status_code == 200, r.text
    return r.json()["results"]


def recipe(**over):
    base = {"resizeMode": "fit", "width": 100, "height": 100, "format": "webp", "quality": 80, "background": "#ffffff",
            "removeMetadata": True, "prefix": "img", "pattern": "{prefix}_{index}", "padding": 3, "startIndex": 1}
    return {**base, **over}


def wait_idle(client, batch_id, timeout=15):
    end = time.time() + timeout
    while time.time() < end:
        data = client.get(f"/api/batches/{batch_id}/status").json()
        if data["status"] == "idle":
            return data
        time.sleep(0.05)
    raise AssertionError("batch did not finish processing")


def process(client, batch_id, ids, reset=False, **over):
    r = client.post(f"/api/batches/{batch_id}/process", json={"assetIds": ids, "settings": recipe(**over), "reset": reset})
    assert r.status_code == 202, r.text
    return wait_idle(client, batch_id)
