from pathlib import Path

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

from ..models import BatchOut, ConfigOut, ProcessRequest, UploadResponse, UploadResult
from ..services.auth import Principal
from ..services.batch_service import ApiError, BatchService, display_name
from ..services.image_service import MEDIA_TYPE, ImageError
from ..services.security import client_ip

router = APIRouter(prefix="/api")
MAX_FILES_PER_REQUEST = 10
ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"]


def _svc(request: Request) -> BatchService:
    return request.app.state.service


def _who(request: Request) -> Principal:
    return request.state.principal


def _limit(request: Request, name: str) -> str:
    ip = client_ip(request, request.app.state.settings)
    if not request.app.state.limiters[name].allow(ip):
        raise ApiError(429, "Too many requests. Please slow down and try again in a moment.")
    return ip


@router.get("/health", include_in_schema=False)
def health():
    return {"status": "ok"}


@router.get("/config", response_model=ConfigOut)
def config(request: Request):
    """Limits for the person asking (guests have smaller ones), so the UI can validate before uploading."""
    s, who, store = request.app.state.settings, _who(request), request.app.state.invites
    guest = who.invite
    return ConfigOut(
        role=who.kind, max_file_mb=who.max_file_bytes // 1024 // 1024, max_files_per_batch=who.max_files_per_batch, max_pixels=s.max_pixels,
        ttl_hours=s.ttl_hours, concurrency=s.concurrency, accepted_mime=ACCEPTED_MIME,
        images_left_today=store.images_left_today(guest.id) if guest else None, invite_expires_at=guest.expires_at if guest else None,
    )


@router.post("/batches", response_model=BatchOut, status_code=201)
def create_batch(request: Request):
    ip = _limit(request, "batches")
    svc = _svc(request)
    return svc.batch_out(svc.create(ip, _who(request)))


@router.get("/batches/{batch_id}/status", response_model=BatchOut)
def batch_status(batch_id: str, request: Request):
    svc = _svc(request)
    return svc.batch_out(svc.get(batch_id, _who(request)))


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch(batch_id: str, request: Request):
    _svc(request).delete(batch_id, _who(request))


@router.post("/batches/{batch_id}/assets", response_model=UploadResponse)
def upload_assets(batch_id: str, request: Request, files: list[UploadFile] = File(...)):
    """Plain `def` on purpose: runs in a worker thread, so disk I/O and image decoding never block the event loop."""
    _limit(request, "uploads")
    who, store = _who(request), request.app.state.invites
    length = request.headers.get("content-length")
    if length is None or not length.isdigit():
        raise ApiError(411, "Content-Length is required.")
    if int(length) > who.max_file_bytes * MAX_FILES_PER_REQUEST + 1024 * 1024:
        raise ApiError(413, "Upload too large.")
    if len(files) > MAX_FILES_PER_REQUEST:
        raise ApiError(413, f"At most {MAX_FILES_PER_REQUEST} files per request.")

    svc = _svc(request)
    batch = svc.get(batch_id, who)
    results: list[UploadResult] = []
    for f in files:
        name = display_name(f.filename)
        try:
            if who.invite and store.images_left_today(who.invite.id) <= 0:
                raise ImageError(f"Daily limit of {request.app.state.settings.invite_images_per_day} images reached for this invite. Try again tomorrow.")
            results.append(UploadResult(name=name, asset=svc.to_out(svc.add_upload(batch, f.filename, f.file))))
            if who.invite:
                store.record_images(who.invite.id)
        except ImageError as exc:
            results.append(UploadResult(name=name, error=str(exc)))
        finally:
            f.file.close()
    return UploadResponse(results=results)


@router.delete("/batches/{batch_id}/assets/{asset_id}", status_code=204)
def delete_asset(batch_id: str, asset_id: str, request: Request):
    svc = _svc(request)
    svc.delete_asset(svc.get(batch_id, _who(request)), asset_id)


@router.post("/batches/{batch_id}/process", response_model=BatchOut, status_code=202)
def process(batch_id: str, body: ProcessRequest, request: Request):
    _limit(request, "process")
    svc = _svc(request)
    batch = svc.get(batch_id, _who(request))
    svc.start_processing(batch, body)
    return svc.batch_out(batch)


def _output(request: Request, batch_id: str, asset_id: str, disposition: str) -> FileResponse:
    svc = _svc(request)
    a = svc.completed_asset(svc.get(batch_id, _who(request)), asset_id)
    return FileResponse(a.out_path, media_type=MEDIA_TYPE[a.out_format], filename=a.out_name, content_disposition_type=disposition)


@router.get("/batches/{batch_id}/assets/{asset_id}/output")
def asset_output(batch_id: str, asset_id: str, request: Request):
    return _output(request, batch_id, asset_id, "inline")


@router.get("/batches/{batch_id}/assets/{asset_id}/download")
def asset_download(batch_id: str, asset_id: str, request: Request):
    return _output(request, batch_id, asset_id, "attachment")


@router.get("/batches/{batch_id}/export")
def export(batch_id: str, request: Request):
    _limit(request, "export")
    svc = _svc(request)
    path, name = svc.build_export(svc.get(batch_id, _who(request)))
    return FileResponse(path, media_type="application/zip", filename=name, background=BackgroundTask(Path.unlink, path, missing_ok=True))
