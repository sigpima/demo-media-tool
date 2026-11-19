"""Image validation and processing with Pillow. Pure functions — no HTTP, no global state."""
import logging
import os
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError

from ..models import Recipe

log = logging.getLogger(__name__)

ALLOWED_FORMATS = {"JPEG": "jpeg", "PNG": "png", "WEBP": "webp"}
EXTENSION = {"jpeg": "jpg", "png": "png", "webp": "webp"}
MEDIA_TYPE = {"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}


class ImageError(Exception):
    """An error whose message is safe and useful to show to the user."""


@dataclass(frozen=True)
class Inspected:
    format: str  # jpeg | png | webp
    width: int
    height: int


@dataclass(frozen=True)
class Processed:
    width: int
    height: int
    size: int


def _too_large(max_pixels: int) -> ImageError:
    return ImageError(f"Image exceeds the {max_pixels // 1_000_000} megapixel limit.")


def inspect_upload(path: Path, max_pixels: int) -> Inspected:
    """Decide what a file *really* is by decoding its header — the client's MIME type/extension are ignored."""
    Image.MAX_IMAGE_PIXELS = max_pixels  # Pillow raises DecompressionBombError at 2x this
    try:
        with Image.open(path) as im:
            fmt = ALLOWED_FORMATS.get(im.format or "")
            if fmt is None:
                raise ImageError("Only JPG, PNG and WebP images are supported.")
            width, height = im.size
            if width < 1 or height < 1:
                raise ImageError("Could not read this image.")
            if width * height > max_pixels:
                raise _too_large(max_pixels)
            im.verify()  # must be the first thing after open(); checks structure/CRCs where the format supports it
        with Image.open(path) as im:  # verify() leaves the image unusable, so read the rest from a second handle
            try:  # report the size people will actually see: cameras store rotated photos with an orientation tag
                if im.getexif().get(0x0112) in (5, 6, 7, 8):
                    width, height = height, width
            except Exception:  # noqa: BLE001 — a broken EXIF block must not reject the image
                pass
            return Inspected(fmt, width, height)
    except ImageError:
        raise
    except Image.DecompressionBombError:
        raise _too_large(max_pixels) from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError):
        raise ImageError("Could not read this image — it may be corrupted or not an image.") from None


def output_size(w: int, h: int, r: Recipe) -> tuple[int, int]:
    """Never distorts. Must match frontend/src/lib/geometry.ts."""
    if r.resize_mode == "original":
        return w, h
    if r.resize_mode == "width":
        return r.width, max(1, round(h * r.width / w))
    if r.resize_mode == "cover":
        return r.width, r.height
    scale = min(r.width / w, r.height / h)  # fit / contain
    return max(1, round(w * scale)), max(1, round(h * scale))


def _cover_box(w: int, h: int, tw: int, th: int) -> tuple[float, float, float, float]:
    """Centered crop box with the target aspect ratio."""
    target, source = tw / th, w / h
    if source > target:
        cw = h * target
        return ((w - cw) / 2, 0, (w + cw) / 2, h)
    ch = w / target
    return (0, (h - ch) / 2, w, (h + ch) / 2)


def _has_alpha(im: Image.Image) -> bool:
    return im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info


_SRGB = None


def _to_srgb(im: Image.Image, icc: bytes) -> Image.Image:
    """Convert to sRGB so colours stay right after the ICC profile is stripped. Best effort."""
    global _SRGB
    try:
        import io

        _SRGB = _SRGB or ImageCms.createProfile("sRGB")
        src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        return ImageCms.profileToProfile(im, src, _SRGB, outputMode=im.mode)
    except Exception:  # noqa: BLE001 — a broken profile must not fail the image
        return im


def process_image(src: Path, dst: Path, r: Recipe, max_pixels: int) -> Processed:
    """Read `src`, apply the recipe, write `dst` atomically."""
    Image.MAX_IMAGE_PIXELS = max_pixels
    tmp = dst.with_name(dst.name + ".part")
    try:
        with Image.open(src) as opened:
            opened.load()  # raises on truncated / corrupt data
            icc = opened.info.get("icc_profile")
            im = ImageOps.exif_transpose(opened)  # apply the camera orientation, then drop the tag

        alpha = _has_alpha(im)
        if im.mode in ("I;16", "I;16L", "I;16B", "I"):  # 16-bit greyscale: scale down instead of clipping to white
            im = im.point(lambda p: p * (1 / 256)).convert("L")
        # Convert palette/CMYK/etc. up-front: LANCZOS needs RGB(A), and JPEG has no alpha channel.
        im = im.convert("RGBA" if alpha else "RGB")
        if r.remove_metadata and icc:
            im = _to_srgb(im, icc)

        w, h = im.size
        tw, th = output_size(w, h, r)
        if tw * th > max_pixels:
            raise _too_large(max_pixels)
        if (tw, th) != (w, h) or r.resize_mode == "cover":
            box = _cover_box(w, h, tw, th) if r.resize_mode == "cover" else None
            im = im.resize((tw, th), Image.Resampling.LANCZOS, box=box, reducing_gap=2.0)

        if r.format == "jpeg" and im.mode == "RGBA":  # JPEG cannot store alpha: flatten onto the chosen colour
            flat = Image.new("RGB", im.size, r.background)
            flat.paste(im, mask=im.getchannel("A"))
            im = flat

        params: dict = {}
        if r.format == "jpeg":
            params = {"quality": r.quality, "optimize": True, "progressive": True}
        elif r.format == "webp":
            params = {"quality": r.quality, "method": 4}
        else:
            params = {"compress_level": 6}
        if not r.remove_metadata:
            exif = im.getexif()
            if len(exif):
                params["exif"] = exif
            if icc:
                params["icc_profile"] = icc
        # Otherwise nothing is passed: Pillow then writes no EXIF/XMP/GPS/ICC at all.

        im.save(tmp, format={"jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}[r.format], **params)
        os.replace(tmp, dst)
        return Processed(tw, th, dst.stat().st_size)
    except ImageError:
        raise
    except Image.DecompressionBombError:
        raise _too_large(max_pixels) from None
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, EOFError):
        log.info("decode failed for %s", src.name, exc_info=True)
        raise ImageError("Cannot decode image — the file appears to be corrupted.") from None
    except MemoryError:
        raise ImageError("Not enough memory to process this image.") from None
    finally:
        tmp.unlink(missing_ok=True)
