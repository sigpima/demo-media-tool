import io

import pytest
from PIL import Image, ImageCms

from app.models import Recipe
from app.services.image_service import ImageError, inspect_upload, output_size, process_image
from .conftest import jpeg, png, truncated_jpeg

MAX = 4_000_000


def R(**kw) -> Recipe:
    return Recipe(**{"resizeMode": "fit", "width": 100, "height": 100, "format": "webp", **kw})


def run(tmp_path, data: bytes, **kw):
    src, dst = tmp_path / "in", tmp_path / "out"
    src.write_bytes(data)
    result = process_image(src, dst, R(**kw), MAX)
    return result, Image.open(dst)


# --- geometry (examples straight from the spec) -----------------------------------------------
@pytest.mark.parametrize(
    "mode,expected",
    [("fit", (810, 1080)), ("cover", (1080, 1080)), ("width", (1080, 1440)), ("original", (3024, 4032))],
)
def test_output_size_matches_spec_examples(mode, expected):
    assert output_size(3024, 4032, R(resizeMode=mode, width=1080, height=1080)) == expected


@pytest.mark.parametrize("mode", ["fit", "cover", "width", "original"])
def test_output_dimensions_are_what_was_promised(tmp_path, mode):
    result, im = run(tmp_path, jpeg(400, 300), resizeMode=mode, width=100, height=100)
    assert im.size == (result.width, result.height) == output_size(400, 300, R(resizeMode=mode, width=100, height=100))


def test_fit_never_distorts(tmp_path):
    _, im = run(tmp_path, jpeg(400, 300), resizeMode="fit", width=100, height=100)
    assert im.size == (100, 75)


def test_cover_crops_the_centre_instead_of_stretching(tmp_path):
    src = Image.new("RGB", (300, 100), (0, 0, 255))
    src.paste((255, 0, 0), (100, 0, 200, 100))  # red centre third
    buf = io.BytesIO()
    src.save(buf, "PNG")
    _, im = run(tmp_path, buf.getvalue(), resizeMode="cover", width=100, height=100, format="png")
    assert im.size == (100, 100)
    assert im.convert("RGB").getpixel((50, 50)) == (255, 0, 0)
    assert im.convert("RGB").getpixel((2, 50)) == (255, 0, 0)  # edges are still red => centre crop, not a squeeze


# --- formats ---------------------------------------------------------------------------------
@pytest.mark.parametrize("fmt,pil", [("jpeg", "JPEG"), ("png", "PNG"), ("webp", "WEBP")])
def test_conversion_between_formats(tmp_path, fmt, pil):
    _, im = run(tmp_path, jpeg(), format=fmt)
    assert im.format == pil


def test_lower_quality_makes_smaller_files(tmp_path):
    noisy = Image.effect_noise((400, 400), 60).convert("RGB")
    buf = io.BytesIO()
    noisy.save(buf, "PNG")
    small, _ = run(tmp_path, buf.getvalue(), format="jpeg", quality=20, resizeMode="original")
    big, _ = run(tmp_path, buf.getvalue(), format="jpeg", quality=95, resizeMode="original")
    assert small.size < big.size


def test_transparency_is_flattened_onto_chosen_background_for_jpeg(tmp_path):
    data = png(50, 50, color=(0, 0, 0, 0), mode="RGBA")
    _, im = run(tmp_path, data, format="jpeg", background="#ff0000", resizeMode="original")
    assert im.mode == "RGB"
    r, g, b = im.getpixel((25, 25))
    assert r > 240 and g < 15 and b < 15


def test_transparency_is_kept_for_png_and_webp(tmp_path):
    data = png(50, 50, color=(0, 0, 0, 0), mode="RGBA")
    for fmt in ("png", "webp"):
        _, im = run(tmp_path, data, format=fmt, resizeMode="original")
        assert im.mode == "RGBA" and im.getpixel((10, 10))[3] == 0


def test_palette_png_with_transparency(tmp_path):
    pal = Image.new("P", (40, 40), 0)
    pal.putpalette([255, 0, 0] + [0] * 765)
    buf = io.BytesIO()
    pal.save(buf, "PNG", transparency=0)
    _, im = run(tmp_path, buf.getvalue(), format="webp", resizeMode="original")
    assert im.mode == "RGBA" and im.getpixel((5, 5))[3] == 0


def test_cmyk_jpeg_is_converted(tmp_path):
    buf = io.BytesIO()
    Image.new("CMYK", (40, 40), (0, 255, 255, 0)).save(buf, "JPEG")
    _, im = run(tmp_path, buf.getvalue(), format="png", resizeMode="original")
    assert im.mode == "RGB"


# --- orientation & metadata --------------------------------------------------------------------
def _exif(orientation=None, make=None, gps=False):
    exif = Image.Exif()
    if orientation:
        exif[0x0112] = orientation
    if make:
        exif[0x010F] = make
    if gps:
        exif.get_ifd(0x8825)[1] = "N"  # GPSLatitudeRef
    return exif


def test_exif_orientation_is_applied_and_reported_dimensions_match(tmp_path):
    buf = io.BytesIO()
    Image.new("RGB", (40, 20), "blue").save(buf, "JPEG", exif=_exif(orientation=6))  # camera says: rotate 90°
    path = tmp_path / "in"
    path.write_bytes(buf.getvalue())
    info = inspect_upload(path, MAX)
    assert (info.width, info.height) == (20, 40)  # what the user will see
    _, im = run(tmp_path, buf.getvalue(), resizeMode="original")
    assert im.size == (20, 40)


def test_metadata_is_stripped_by_default(tmp_path):
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "blue").save(buf, "JPEG", exif=_exif(make="SecretCam", gps=True))
    for fmt in ("jpeg", "webp"):
        _, im = run(tmp_path, buf.getvalue(), format=fmt, removeMetadata=True, resizeMode="original")
        assert len(im.getexif()) == 0
        assert b"SecretCam" not in (tmp_path / "out").read_bytes()


def test_metadata_is_kept_when_asked(tmp_path):
    buf = io.BytesIO()
    Image.new("RGB", (40, 40), "blue").save(buf, "JPEG", exif=_exif(make="KeepMe"))
    _, im = run(tmp_path, buf.getvalue(), format="jpeg", removeMetadata=False, resizeMode="original")
    assert im.getexif().get(0x010F) == "KeepMe"


def test_icc_profile_is_converted_to_srgb_then_dropped(tmp_path):
    p3ish = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB")).tobytes()  # any non-sRGB profile
    buf = io.BytesIO()
    Image.new("RGB", (30, 30), (120, 80, 40)).save(buf, "JPEG")
    data = buf.getvalue()
    # a broken/unsupported profile must never fail the image
    img = Image.open(io.BytesIO(data))
    out = io.BytesIO()
    img.save(out, "JPEG", icc_profile=p3ish)
    _, result = run(tmp_path, out.getvalue(), format="jpeg", removeMetadata=True, resizeMode="original")
    assert "icc_profile" not in result.info


# --- hostile / broken input ------------------------------------------------------------------------
def test_text_file_with_image_extension_is_rejected(tmp_path):
    f = tmp_path / "evil.jpg"
    f.write_text("<script>alert(1)</script>")
    with pytest.raises(ImageError):
        inspect_upload(f, MAX)


def test_unsupported_real_image_format_is_rejected(tmp_path):
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    f = tmp_path / "x.jpg"  # a GIF pretending to be a JPEG
    f.write_bytes(buf.getvalue())
    with pytest.raises(ImageError, match="Only JPG, PNG and WebP"):
        inspect_upload(f, MAX)


def test_image_over_pixel_limit_is_rejected_before_decoding(tmp_path):
    f = tmp_path / "big.png"
    f.write_bytes(png(3000, 2000))  # 6 MP > 4 MP limit
    with pytest.raises(ImageError, match="megapixel"):
        inspect_upload(f, MAX)


def test_truncated_image_passes_upload_but_fails_processing_with_clear_message(tmp_path):
    f = tmp_path / "t.jpg"
    f.write_bytes(truncated_jpeg())
    inspect_upload(f, MAX)  # header is fine
    with pytest.raises(ImageError, match="Cannot decode"):
        process_image(f, tmp_path / "o", R(), MAX)
    assert not (tmp_path / "o").exists() and not list(tmp_path.glob("*.part"))  # no half-written output left behind
