"""Generate procedural sample images (no external downloads, no copyright issues).

Outputs
  frontend/public/samples/thumb-XX.jpg   small previews used by the demo mode of the UI
  samples/XX-<name>.<ext>                 realistic-size originals for manually testing uploads/backend

Run:  python3 scripts/make_samples.py
"""
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
THUMBS = ROOT / "frontend" / "public" / "samples"
ORIGINALS = ROOT / "samples"

# name, width, height, hue, extension  (mix of landscape / portrait / square, jpg / png / webp)
SPECS = [
    ("sneaker-red-front", 1800, 2400, 355, "jpg"),
    ("sneaker-red-side", 2400, 1800, 8, "jpg"),
    ("backpack-olive", 2000, 2000, 75, "png"),
    ("backpack-detail-zip", 1800, 2400, 40, "jpg"),
    ("campaign-hero-wide", 2560, 1440, 215, "jpg"),
    ("mug-white-logo", 1600, 1600, 190, "webp"),
    ("hoodie-grey-back", 1800, 2400, 250, "jpg"),
    ("cap-navy", 2000, 1500, 225, "png"),
    ("lamp-brass-01", 2400, 1600, 38, "jpg"),
    ("lamp-brass-02", 2400, 1600, 28, "jpg"),
    ("bottle-steel", 1200, 1800, 200, "webp"),
    ("tote-natural", 2000, 2000, 30, "jpg"),
]


def hsv(h, s, v):
    from colorsys import hsv_to_rgb

    r, g, b = hsv_to_rgb((h % 360) / 360, s, v)
    return int(r * 255), int(g * 255), int(b * 255)


def make(w, h, hue, seed):
    rnd = random.Random(seed)
    img = Image.new("RGB", (w, h))
    px = ImageDraw.Draw(img)
    top, bottom = hsv(hue, 0.55, 0.62), hsv(hue + 35, 0.7, 0.16)
    for y in range(h):  # vertical gradient
        t = y / (h - 1)
        px.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))

    glow = Image.new("RGB", (w, h), (0, 0, 0))  # soft bokeh blobs
    gd = ImageDraw.Draw(glow)
    for _ in range(9):
        r = rnd.randint(min(w, h) // 8, min(w, h) // 3)
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        gd.ellipse([x - r, y - r, x + r, y + r], fill=hsv(hue + rnd.randint(-40, 60), 0.6, rnd.uniform(0.35, 0.8)))
    glow = glow.filter(ImageFilter.GaussianBlur(min(w, h) // 10))
    img = ImageChops.screen(img, glow.point(lambda v: int(v * 0.6)))

    # a "product" silhouette with a soft shadow
    shadow = Image.new("L", (w, h), 0)
    sd = ImageDraw.Draw(shadow)
    bw, bh = int(w * rnd.uniform(0.32, 0.5)), int(h * rnd.uniform(0.3, 0.5))
    x0, y0 = (w - bw) // 2, int(h * 0.38)
    sd.rounded_rectangle([x0, y0 + bh // 10, x0 + bw, y0 + bh + bh // 10], radius=bw // 5, fill=170)
    img = Image.composite(Image.new("RGB", (w, h), (0, 0, 0)), img, shadow.filter(ImageFilter.GaussianBlur(w // 40)))
    ImageDraw.Draw(img).rounded_rectangle(
        [x0, y0, x0 + bw, y0 + bh], radius=bw // 5, fill=hsv(hue + 10, 0.25, 0.92), outline=hsv(hue, 0.5, 0.5), width=max(2, w // 300)
    )

    noise = Image.effect_noise((w, h), 14).convert("RGB")  # film grain so files are realistically heavy
    return ImageChops.add(img, noise, scale=2.0, offset=-64)


def main():
    THUMBS.mkdir(parents=True, exist_ok=True)
    ORIGINALS.mkdir(parents=True, exist_ok=True)
    for i, (name, w, h, hue, ext) in enumerate(SPECS):
        img = make(w, h, hue, seed=i + 1)
        thumb = img.copy()
        thumb.thumbnail((640, 640))
        thumb.save(THUMBS / f"thumb-{i:02d}.jpg", quality=78, optimize=True)
        out = ORIGINALS / f"{i:02d}-{name}.{ext}"
        if ext == "jpg":
            img.save(out, quality=92)
        elif ext == "png":
            img.save(out, optimize=False)
        else:
            img.save(out, quality=90)
        print(f"{out.name:36} {w}x{h}  {out.stat().st_size / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
