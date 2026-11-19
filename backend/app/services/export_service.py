"""ZIP export: processed files + manifest.json + processing_report.csv."""
import csv
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from ..models import Recipe

REPORT_COLUMNS = ["original_name", "output_name", "status", "original_size", "output_size", "error"]


def csv_safe(value: object) -> str:
    """Neutralise spreadsheet formula injection: file names are user-controlled and users open this in Excel."""
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def build_report(rows: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(REPORT_COLUMNS)
    for r in rows:
        writer.writerow([csv_safe(r.get(c)) for c in REPORT_COLUMNS])
    return out.getvalue()


def build_manifest(recipe: Recipe | None, rows: list[dict], created_at: datetime) -> dict:
    done = [r for r in rows if r["status"] == "completed"]
    original = sum(r["original_size"] for r in done)
    output = sum(r["output_size"] for r in done)
    return {
        "created_at": created_at.isoformat(timespec="seconds"),
        "completed_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "settings": recipe.model_dump(by_alias=True) if recipe else None,
        "stats": {
            "total_files": len(rows),
            "completed": len(done),
            "failed": len(rows) - len(done),
            "original_bytes": original,
            "output_bytes": output,
            "reduction_percent": round((original - output) / original * 100, 1) if original else 0,
        },
    }


def write_zip(dest: Path, folder: str, files: list[tuple[Path, str]], rows: list[dict], recipe: Recipe | None, created_at: datetime) -> None:
    """`files` = (path on disk, name inside processed/). Images are already compressed, so they are stored as-is."""
    with zipfile.ZipFile(dest, "w") as zf:
        for path, name in files:
            zf.write(path, f"{folder}/processed/{name}", compress_type=zipfile.ZIP_STORED)
        zf.writestr(
            f"{folder}/manifest.json",
            json.dumps(build_manifest(recipe, rows, created_at), indent=2),
            compress_type=zipfile.ZIP_DEFLATED,
        )
        zf.writestr(f"{folder}/processing_report.csv", build_report(rows), compress_type=zipfile.ZIP_DEFLATED)
