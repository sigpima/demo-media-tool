"""Batch lifecycle: uploads, bounded-concurrency processing with per-asset error isolation, export, cleanup.

State lives in memory (spec: no database). That is why the server must run as ONE process.
Files live under  <storage_dir>/batches/<batch-id>/{uploads,processed}/<internal-id>  — user-supplied file names
are only ever stored as metadata and never used as paths (no path traversal possible).
"""
import logging
import queue
import re
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO

from ..config import Settings
from .auth import Principal
from ..models import AssetOut, BatchOut, ProcessRequest, Recipe
from . import export_service
from .image_service import EXTENSION, ImageError, inspect_upload, output_size, process_image
from .naming_service import build_name, unique_name

log = logging.getLogger(__name__)
BATCH_ID = re.compile(r"^[0-9a-f]{32}$")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class ApiError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code, self.detail = status_code, detail


@dataclass
class Asset:
    id: str
    name: str
    format: str
    size: int
    width: int
    height: int
    path: Path
    status: str = "pending"  # pending | queued | processing | completed | failed
    slot: int | None = None
    error: str | None = None
    out_name: str | None = None
    out_path: Path | None = None
    out_size: int | None = None
    out_width: int | None = None
    out_height: int | None = None
    out_format: str | None = None
    out_quality: int | None = None


@dataclass
class Batch:
    id: str
    dir: Path
    owner_ip: str
    created_at: datetime
    last_active: float
    assets: dict[str, Asset] = field(default_factory=dict)
    run_ids: list[str] = field(default_factory=list)  # order used for {index} in file names
    recipe: Recipe | None = None
    bytes: int = 0
    deleted: bool = False
    owner_key: str = "admin"  # who may see this batch: "admin" or an invite id
    max_file_bytes: int = 0
    max_files: int = 0
    lock: threading.RLock = field(default_factory=threading.RLock)

    @property
    def processing(self) -> bool:
        return any(a.status in ("queued", "processing") for a in self.assets.values())


def display_name(raw: str | None) -> str:
    """Metadata only. Strip directories and control characters; never used as a path."""
    name = _CONTROL.sub("", (raw or "image").replace("\\", "/").split("/")[-1]).strip()
    return (name or "image")[:200]


class BatchService:
    def __init__(self, settings: Settings):
        self.s = settings
        self.root = settings.storage_dir / "batches"
        self.batches: dict[str, Batch] = {}
        self._lock = threading.RLock()
        self._executor = ThreadPoolExecutor(max_workers=settings.concurrency, thread_name_prefix="img")
        self._slots: queue.SimpleQueue[int] = queue.SimpleQueue()
        for i in range(1, settings.concurrency + 1):
            self._slots.put(i)

    # ------------------------------------------------------------------ lifecycle
    def startup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)  # in-memory state is gone, so any old files are orphans
        self.root.mkdir(parents=True, exist_ok=True)

    def shutdown(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)

    def purge_expired(self) -> int:
        ttl = self.s.ttl_hours * 3600
        with self._lock:
            old = [b for b in self.batches.values() if not b.processing and time.monotonic() - b.last_active > ttl]
        for b in old:
            self._drop(b)
        return len(old)

    def total_bytes(self) -> int:
        with self._lock:
            return sum(b.bytes for b in self.batches.values())

    # ------------------------------------------------------------------ batches
    def create(self, ip: str, who: Principal) -> Batch:
        with self._lock:
            if sum(1 for b in self.batches.values() if b.owner_ip == ip) >= self.s.max_active_batches_per_ip:
                raise ApiError(429, "Too many active batches. Delete one or wait for it to expire.")
            batch_id = uuid.uuid4().hex
            batch = Batch(batch_id, self.root / batch_id, ip, datetime.now(timezone.utc), time.monotonic(),
                          owner_key=who.key, max_file_bytes=who.max_file_bytes, max_files=who.max_files_per_batch)
            (batch.dir / "uploads").mkdir(parents=True)
            (batch.dir / "processed").mkdir()
            self.batches[batch.id] = batch
        return batch

    def get(self, batch_id: str, who: Principal) -> Batch:
        batch = self.batches.get(batch_id) if BATCH_ID.match(batch_id) else None
        if batch is None or batch.deleted or batch.owner_key != who.key:  # someone else's batch looks exactly like a missing one
            raise ApiError(404, "Batch not found or expired.")
        batch.last_active = time.monotonic()
        return batch

    def delete(self, batch_id: str, who: Principal) -> None:
        self._drop(self.get(batch_id, who))

    def _drop(self, batch: Batch) -> None:
        batch.deleted = True  # running workers notice this and clean up after themselves
        with self._lock:
            self.batches.pop(batch.id, None)
        shutil.rmtree(batch.dir, ignore_errors=True)

    # ------------------------------------------------------------------ uploads
    def add_upload(self, batch: Batch, filename: str | None, fileobj: BinaryIO) -> Asset:
        if len(batch.assets) >= batch.max_files:
            raise ImageError(f"Limit of {batch.max_files} files per batch.")
        if self.total_bytes() >= self.s.max_storage_mb * 1024 * 1024:
            raise ApiError(507, "Server storage is full. Please try again later.")

        asset_id = uuid.uuid4().hex
        dest = batch.dir / "uploads" / asset_id
        written = 0
        try:
            with open(dest, "wb") as out:
                while chunk := fileobj.read(1024 * 1024):
                    written += len(chunk)
                    if written > batch.max_file_bytes:
                        raise ImageError(f"Larger than {batch.max_file_bytes // 1024 // 1024} MB.")
                    out.write(chunk)
            if written == 0:
                raise ImageError("The file is empty.")
            info = inspect_upload(dest, self.s.max_pixels)
        except BaseException:
            dest.unlink(missing_ok=True)
            raise
        asset = Asset(asset_id, display_name(filename), info.format, written, info.width, info.height, dest)
        with batch.lock:
            batch.assets[asset_id] = asset
            batch.bytes += written
        return asset

    def delete_asset(self, batch: Batch, asset_id: str) -> None:
        with batch.lock:
            asset = batch.assets.get(asset_id)
            if asset is None:
                raise ApiError(404, "Asset not found.")
            if asset.status in ("queued", "processing"):
                raise ApiError(409, "This image is being processed.")
            del batch.assets[asset_id]
            if asset_id in batch.run_ids:
                batch.run_ids.remove(asset_id)
            batch.bytes -= asset.size + (asset.out_size or 0)
        asset.path.unlink(missing_ok=True)
        if asset.out_path:
            asset.out_path.unlink(missing_ok=True)

    # ------------------------------------------------------------------ processing
    def start_processing(self, batch: Batch, req: ProcessRequest) -> None:
        recipe = req.settings
        if max(recipe.width, recipe.height) > self.s.max_output_dim:
            raise ApiError(422, f"Output dimensions are limited to {self.s.max_output_dim}px.")
        with batch.lock:
            if batch.processing:
                raise ApiError(409, "This batch is already processing.")
            missing = [i for i in req.asset_ids if i not in batch.assets]
            if missing:
                raise ApiError(422, "Unknown asset id.")
            ids = list(dict.fromkeys(req.asset_ids))  # de-duplicate, keep order
            batch.run_ids = ids if req.reset else batch.run_ids + [i for i in ids if i not in batch.run_ids]
            batch.recipe = recipe
            targets = [batch.assets[i] for i in batch.run_ids if i in ids and (req.reset or batch.assets[i].status in ("pending", "failed"))]
            if not targets:
                raise ApiError(409, "Nothing to process.")

            target_ids = {a.id for a in targets}
            used = {a.out_name.lower() for a in batch.assets.values() if a.out_name and a.status == "completed" and a.id not in target_ids}
            for a in targets:
                if a.out_path:
                    a.out_path.unlink(missing_ok=True)
                    batch.bytes -= a.out_size or 0
                ow, oh = output_size(a.width, a.height, recipe)
                a.out_name = unique_name(build_name(a.name, batch.run_ids.index(a.id), ow, oh, recipe), used)
                a.out_path = a.out_size = a.out_width = a.out_height = a.out_format = a.out_quality = a.error = None
                a.status = "queued"
        for a in targets:
            self._executor.submit(self._run, batch, a, recipe)

    def _run(self, batch: Batch, asset: Asset, recipe: Recipe) -> None:
        slot = self._slots.get()
        try:
            with batch.lock:
                if batch.deleted or asset.status != "queued":
                    return
                asset.status, asset.slot = "processing", slot
            dst = batch.dir / "processed" / f"{asset.id}.{EXTENSION[recipe.format]}"
            try:
                result = process_image(asset.path, dst, recipe, self.s.max_pixels)
            except ImageError as exc:
                self._finish(batch, asset, error=str(exc))
            except Exception:  # noqa: BLE001 — isolate failures per asset, never kill the batch
                log.exception("unexpected failure processing asset %s", asset.id)
                self._finish(batch, asset, error="Unexpected error while processing this image.")
            else:
                self._finish(batch, asset, recipe=recipe, dst=dst, result=result)
        finally:
            self._slots.put(slot)

    def _finish(self, batch: Batch, asset: Asset, *, error: str | None = None, recipe: Recipe | None = None, dst: Path | None = None, result=None) -> None:
        with batch.lock:
            asset.slot = None
            if batch.deleted:  # batch was removed while we were working: do not leave files behind
                if dst:
                    dst.unlink(missing_ok=True)
                return
            if error is not None:
                asset.status, asset.error = "failed", error
                return
            asset.status, asset.out_path = "completed", dst
            asset.out_size, asset.out_width, asset.out_height = result.size, result.width, result.height
            asset.out_format = recipe.format
            asset.out_quality = None if recipe.format == "png" else recipe.quality
            batch.bytes += result.size

    # ------------------------------------------------------------------ views
    def to_out(self, a: Asset) -> AssetOut:
        return AssetOut(
            id=a.id, name=a.name, format=a.format, size=a.size, width=a.width, height=a.height,
            status="pending" if a.status == "queued" else a.status, slot=a.slot, error=a.error,
            out_name=a.out_name if a.status == "completed" else None, out_size=a.out_size,
            out_width=a.out_width, out_height=a.out_height, out_format=a.out_format, out_quality=a.out_quality,
        )

    def batch_out(self, batch: Batch) -> BatchOut:
        with batch.lock:
            assets = [self.to_out(a) for a in batch.assets.values()]
            processing = batch.processing
        expires = datetime.now(timezone.utc) + timedelta(hours=self.s.ttl_hours)
        return BatchOut(
            id=batch.id, status="processing" if processing else "idle", assets=assets,
            created_at=batch.created_at.isoformat(timespec="seconds"), expires_at=expires.isoformat(timespec="seconds"),
        )

    def completed_asset(self, batch: Batch, asset_id: str) -> Asset:
        with batch.lock:
            asset = batch.assets.get(asset_id)
            if asset is None:
                raise ApiError(404, "Asset not found.")
            if asset.status != "completed" or not asset.out_path or not asset.out_path.exists():
                raise ApiError(409, "This image has not been processed yet.")
            return asset

    # ------------------------------------------------------------------ export
    def build_export(self, batch: Batch) -> tuple[Path, str]:
        with batch.lock:
            run = [batch.assets[i] for i in batch.run_ids if i in batch.assets]
            files = [(a.out_path, a.out_name) for a in run if a.status == "completed" and a.out_path and a.out_path.exists()]
            if not files:
                raise ApiError(409, "Nothing to export yet.")
            rows = [
                {"original_name": a.name, "output_name": a.out_name if a.status == "completed" else "", "status": a.status if a.status != "queued" else "pending",
                 "original_size": a.size, "output_size": a.out_size or 0, "error": a.error or ""}
                for a in run
            ]
            recipe, created = batch.recipe, batch.created_at
        folder = f"creative_batch_{datetime.now().strftime('%Y_%m_%d')}"
        dest = batch.dir / f"export-{uuid.uuid4().hex[:8]}.zip"
        export_service.write_zip(dest, folder, files, rows, recipe, created)
        return dest, f"{folder}.zip"
