"""Output file names. Must stay in sync with frontend/src/lib/naming.ts (that one is only a live preview)."""
import re
import unicodedata
from datetime import date

from ..models import Recipe
from .image_service import EXTENSION

_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def sanitize(name: str) -> str:
    """Filesystem- and zip-safe: ASCII letters/digits/._- only, no leading dots, no path separators."""
    name = unicodedata.normalize("NFKD", name)
    name = "".join(c for c in name if not unicodedata.combining(c))
    name = re.sub(r"[^\w.\- ]+", "_", name, flags=re.ASCII)
    name = re.sub(r"\s+", "_", name)
    name = re.sub(r"^[._-]+", "", name)[:120]
    return name


def build_name(original_name: str, position: int, out_w: int, out_h: int, r: Recipe, today: date | None = None) -> str:
    base = original_name.rsplit(".", 1)[0] if "." in original_name else original_name
    index = str(r.start_index + position).zfill(r.padding)
    stamp = (today or date.today()).strftime("%Y%m%d")
    raw = (
        r.pattern.replace("{prefix}", r.prefix)
        .replace("{index}", index)
        .replace("{name}", base)
        .replace("{date}", stamp)
        .replace("{w}", str(out_w))
        .replace("{h}", str(out_h))
    )
    stem = sanitize(raw) or "image"
    if stem.upper() in _RESERVED:
        stem = f"_{stem}"
    return f"{stem}.{EXTENSION[r.format]}"


def unique_name(name: str, used: set[str]) -> str:
    """Make `name` unique (case-insensitively) against `used`, then register it."""
    stem, dot, ext = name.rpartition(".")
    candidate, n = name, 2
    while candidate.lower() in used:
        candidate = f"{stem}_{n}{dot}{ext}"
        n += 1
    used.add(candidate.lower())
    return candidate
