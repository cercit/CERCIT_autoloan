"""Builds the cercit logo set from the two source PNGs in docs/brand/source.

Outputs (transparent, trimmed):
  src/assets/brand/  logo-horizontal-{light,dark}.{png,webp}, logo-stacked-{light,dark}.{png,webp},
                     mark-{light,dark}.{png,webp}
  public/            favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png
  docs/brand/        the same logos at full size, for decks and documents

light = for light backgrounds (navy wordmark); dark = for dark backgrounds
(white wordmark, car lifted a little so the deep blue still reads on navy).
Run: python scripts/brand/make-logos.py
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "docs" / "brand" / "source"
ASSETS = ROOT / "src" / "assets" / "brand"
PUBLIC = ROOT / "public"
DOCS = ROOT / "docs" / "brand"
WHITE_TEXT = np.array([240, 244, 247])  # dark-theme foreground #F0F4F7


def to_alpha(path):
    """Remove the white background: GIMP-style colour-to-alpha against white."""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(float)
    alpha = (255 - rgb).max(axis=2) / 255
    alpha[alpha < 0.04] = 0
    safe = np.where(alpha > 0, alpha, 1)[..., None]
    col = 255 - (255 - rgb) / safe
    return np.clip(col, 0, 255), alpha


def dark_variant(col, alpha, word_mask):
    """Navy wordmark -> near white. Blues (car, dot on the i) at full brightness, keeping
    their hue, so thin lines still read on navy. Returns colour and a slightly bolder alpha."""
    col = col.copy()
    sat = col.max(axis=2) - col.min(axis=2)
    navy = word_mask & (sat < 150)
    col[navy] = WHITE_TEXT
    blue = ~navy & (alpha > 0)
    peak = col[blue].max(axis=1, keepdims=True)
    col[blue] = col[blue] * (255 / np.maximum(peak, 1))          # same hue, full value
    col[blue] = col[blue] + (255 - col[blue]) * 0.12             # a touch lighter
    bold = alpha.copy()
    bold[blue] = np.clip(alpha[blue] ** 0.7, 0, 1)                # thin lines a little heavier
    return col, bold


def image(col, alpha):
    a = (alpha * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([col.astype(np.uint8), a]), "RGBA")


def trim(img, pad_ratio=0.04):
    box = img.getchannel("A").getbbox()
    img = img.crop(box)
    pad = int(max(img.size) * pad_ratio)
    out = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    out.paste(img, (pad, pad))
    return out


def save(img, name, width, folders=(ASSETS,)):
    h = round(img.height * width / img.width)
    small = img.resize((width, h), Image.LANCZOS)
    for folder in folders:
        folder.mkdir(parents=True, exist_ok=True)
        small.save(folder / f"{name}.png", optimize=True)
        if folder == ASSETS:
            small.save(folder / f"{name}.webp", quality=92, method=6)


def build(src_name, word_split, axis, out_name, width):
    col, alpha = to_alpha(SRC / src_name)
    h, w = alpha.shape
    yy, xx = np.mgrid[0:h, 0:w]
    word_mask = (xx >= word_split) if axis == "x" else (yy >= word_split)
    light = trim(image(col, alpha))
    dark = trim(image(*dark_variant(col, alpha, word_mask)))
    save(light, f"{out_name}-light", width)
    save(dark, f"{out_name}-dark", width)
    save(light, f"{out_name}-light", 1600, folders=(DOCS,))
    save(dark, f"{out_name}-dark", 1600, folders=(DOCS,))
    return col, alpha, word_mask


# Horizontal: car left, wordmark from x=880. Stacked: wordmark from y=690.
col, alpha, word_mask = build("logo-horizontal.png", 880, "x", "logo-horizontal", 720)
build("logo-square.png", 690, "y", "logo-stacked", 600)

# Mark: the car alone, cut from the horizontal logo.
car_alpha = alpha.copy()
car_alpha[word_mask] = 0
mark_light = trim(image(col, car_alpha), 0.02)
mark_dark = trim(image(*dark_variant(col, car_alpha, word_mask)), 0.02)
save(mark_light, "mark-light", 320)
save(mark_dark, "mark-dark", 320)
save(mark_light, "mark-light", 1200, folders=(DOCS,))
save(mark_dark, "mark-dark", 1200, folders=(DOCS,))


# Monogram "c." — the wordmark's c with the blue dot of the i. Reads at 16-32 px, where the car does not.
def monogram(c_img, dot_img):
    gap = round(c_img.width * 0.06)
    out = Image.new("RGBA", (c_img.width + gap + dot_img.width, c_img.height), (0, 0, 0, 0))
    out.alpha_composite(c_img, (0, 0))
    out.alpha_composite(dot_img, (c_img.width + gap, c_img.height - dot_img.height))
    return out


def crop_alpha(img, box):
    part = img.crop(box)
    return part.crop(part.getchannel("A").getbbox())


C_BOX, DOT_BOX = (895, 395, 1010, 525), (1430, 338, 1470, 378)   # in logo-horizontal.png
full_light = image(col, alpha)
full_dark = image(*dark_variant(col, alpha, word_mask))
mono_light = monogram(crop_alpha(full_light, C_BOX), crop_alpha(full_light, DOT_BOX))
mono_dark = monogram(crop_alpha(full_dark, C_BOX), crop_alpha(full_dark, DOT_BOX))
save(trim(mono_light, 0.06), "monogram-light", 160)
save(trim(mono_dark, 0.06), "monogram-dark", 160)


def tile_icon(mark, size, fill=0.66, radius=0.22):
    """The monogram on a white rounded tile, so it shows in light and dark browser tabs."""
    scale = 4
    big = size * scale
    tile = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    mask = Image.new("L", (big, big), 0)
    from PIL import ImageDraw
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius), fill=255)
    tile.paste((255, 255, 255, 255), (0, 0), mask)
    w = round(big * fill)
    h = round(mark.height * w / mark.width)
    m = mark.resize((w, h), Image.LANCZOS)
    tile.alpha_composite(m, ((big - w) // 2, (big - h) // 2))
    return tile.resize((size, size), Image.LANCZOS)


# Tab / app icon: the wordmark's "c" enclosing the blue dot of the i (asked for by Sameer, 27 Sep 2026).
# Geometry shared by the SVG and the PNG/ICO fallbacks, on a 64-unit square.
NAVY, WHITE, DOT = "#102A54", "#F0F4F7", "#0268EA"
R, STROKE, GAP_DEG, DOT_R = 23.25, 9.5, 40, 8.5


def c_icon_svg():
    x = 32 + R * math.cos(math.radians(GAP_DEG))
    y1 = 32 - R * math.sin(math.radians(GAP_DEG))
    y2 = 32 + R * math.sin(math.radians(GAP_DEG))
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<style>.c{{stroke:{NAVY}}}@media (prefers-color-scheme:dark){{.c{{stroke:{WHITE}}}}}</style>
<path class="c" d="M{x:.2f} {y1:.2f}A{R} {R} 0 1 0 {x:.2f} {y2:.2f}" fill="none" stroke-width="{STROKE}"/>
<circle cx="32" cy="32" r="{DOT_R}" fill="{DOT}"/>
</svg>
"""


def c_icon_png(size, background=None, colour=NAVY, fill=1.0, radius=0.22):
    from PIL import ImageDraw
    k = 8
    big = size * k
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if background:
        d.rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * radius), fill=background)
    u = big / 64 * fill
    o = (big - 64 * u) / 2
    box = (o + (32 - R - STROKE / 2) * u, o + (32 - R - STROKE / 2) * u,
           o + (32 + R + STROKE / 2) * u, o + (32 + R + STROKE / 2) * u)
    d.arc(box, start=GAP_DEG, end=360 - GAP_DEG, fill=colour, width=round(STROKE * u))
    d.ellipse((o + (32 - DOT_R) * u, o + (32 - DOT_R) * u, o + (32 + DOT_R) * u, o + (32 + DOT_R) * u), fill=DOT)
    return img.resize((size, size), Image.LANCZOS)


PUBLIC.mkdir(exist_ok=True)
(PUBLIC / "favicon.svg").write_text(c_icon_svg(), encoding="utf-8")
c_icon_png(32).save(PUBLIC / "favicon-32.png", optimize=True)
c_icon_png(256).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
c_icon_png(180, (255, 255, 255, 255), fill=0.72, radius=0).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
c_icon_png(192, (255, 255, 255, 255), fill=0.72).save(PUBLIC / "icon-192.png", optimize=True)
c_icon_png(512, (255, 255, 255, 255), fill=0.72).save(PUBLIC / "icon-512.png", optimize=True)
save(c_icon_png(512, (255, 255, 255, 255), fill=0.72), "app-icon", 512, folders=(DOCS,))
print("done")
