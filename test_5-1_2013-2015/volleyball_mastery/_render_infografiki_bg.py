"""Render Bulgarian text overlays on infographic images (higher quality output)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _infografiki_content import STEPS  # noqa: E402

PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik" / "infografiki"
SRC = PUBLIC / "img"
OUT = PUBLIC / "img_bg"
CATALOG = PUBLIC / "_catalog.txt"

TARGET_MIN_W = 1080
FONT_BOLD = Path(r"C:\Windows\Fonts\arialbd.ttf")
FONT_REG = Path(r"C:\Windows\Fonts\arial.ttf")


def load_catalog() -> dict[str, tuple[str, str, str]]:
    rows: dict[str, tuple[str, str, str]] = {}
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        fn, cat, title, body = line.split("|", 3)
        rows[fn.strip()] = (cat.strip(), title.strip(), body.strip())
    return rows


def steps_for(fn: str, body: str) -> list[str]:
    if fn in STEPS:
        return STEPS[fn]
    parts = re.split(r"(?<=[.;])\s+", body)
    out = [p.strip().rstrip(".") for p in parts if len(p.strip()) > 6]
    if len(out) <= 1:
        out = [s.strip() for s in re.split(r",\s+", body) if len(s.strip()) > 6]
    return out if out else [body]


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = FONT_BOLD if bold and FONT_BOLD.exists() else FONT_REG
    return ImageFont.truetype(str(path), size)


def upscale(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w >= TARGET_MIN_W:
        return img
    scale = TARGET_MIN_W / w
    nw, nh = int(w * scale), int(h * scale)
    out = img.resize((nw, nh), Image.Resampling.LANCZOS)
    return out.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=2))


def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    cur = words[0]
    for word in words[1:]:
        test = f"{cur} {word}"
        if draw.textlength(test, font=font) <= max_w:
            cur = test
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


def draw_text_block(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = (20, 40, 50),
    line_gap: int = 4,
) -> int:
    cy = y
    for line in lines:
        draw.text((x, cy), line, font=font, fill=fill)
        cy += font.size + line_gap
    return cy


def render_vertical_strips(base: Image.Image, title: str, steps: list[str]) -> Image.Image:
    """Cover EN headers/body in each horizontal band; keep illustrations."""
    img = base.convert("RGBA")
    w, h = img.size
    n = len(steps)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    strip_h = h / n
    title_font = load_font(max(14, w // 38), bold=True)
    body_font = load_font(max(12, w // 48))

    for i, step in enumerate(steps):
        y0 = int(i * strip_h)
        y1 = int((i + 1) * strip_h)
        sh = y1 - y0

        header_h = int(sh * 0.22)
        body_h = int(sh * 0.50)
        body_y0 = y1 - body_h

        draw.rectangle([0, y0, w, y0 + header_h], fill=(14, 58, 90, 245))
        draw.rectangle([0, body_y0, w, y1], fill=(255, 255, 255, 248))

        num = str(i + 1)
        draw.ellipse([16, y0 + 6, 16 + header_h - 10, y0 + header_h - 4], fill=(232, 93, 4, 255))
        draw.text((24, y0 + 8), num, font=title_font, fill=(255, 255, 255))

        short = step.split("—")[0].strip() if "—" in step else step[:28]
        draw.text((16 + header_h, y0 + 8), short[:42], font=title_font, fill=(255, 255, 255))

        body_lines = wrap_text(draw, step, body_font, w - 32)
        draw_text_block(draw, 16, body_y0 + 8, w - 32, body_lines[:4], body_font)

    out = Image.alpha_composite(img, overlay)
    # Title band over top of image (no extra canvas height)
    band_h = max(52, int(w * 0.09))
    draw2 = ImageDraw.Draw(out)
    draw2.rectangle([0, 0, w, band_h], fill=(10, 61, 74, 240))
    tf = load_font(max(18, w // 32), bold=True)
    draw2.text((16, max(8, band_h // 6)), title[:70], font=tf, fill=(255, 255, 255))
    return out.convert("RGB")


def render_bottom_extension(base: Image.Image, title: str, steps: list[str]) -> Image.Image:
    """For wide/tall complex infographics: keep full art, add BG panel below."""
    img = base.convert("RGB")
    w, h = img.size
    panel_h = int(max(220, len(steps) * 52 + 100))
    canvas = Image.new("RGB", (w, h + panel_h), (255, 250, 240))
    canvas.paste(img, (0, 0))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, h, w, h + panel_h], fill=(255, 250, 240))
    draw.line([0, h, w, h], fill=(10, 61, 74), width=4)

    tf = load_font(max(18, w // 32), bold=True)
    bf = load_font(max(14, w // 42))
    draw.text((20, h + 16), title, font=tf, fill=(10, 61, 74))

    y = h + 56
    for i, step in enumerate(steps):
        r = 18
        cx, cy = 28, y + r
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(232, 93, 4))
        draw.text((cx - 6, cy - 10), str(i + 1), font=bf, fill=(255, 255, 255))
        lines = wrap_text(draw, step, bf, w - 80)
        y = draw_text_block(draw, 56, y, w - 80, lines[:3], bf) + 8

    return canvas


def render_sidebar(base: Image.Image, title: str, steps: list[str]) -> Image.Image:
    """Square/simple cards: illustration left, BG text panel right."""
    img = base.convert("RGB")
    w, h = img.size
    panel_w = int(w * 0.46)
    out_w = w + panel_w
    canvas = Image.new("RGB", (out_w, h), (255, 255, 255))
    canvas.paste(img, (0, 0))

    draw = ImageDraw.Draw(canvas)
    draw.rectangle([w, 0, out_w, h], fill=(248, 252, 255))
    draw.line([w, 0, w, h], fill=(10, 61, 74), width=3)

    tf = load_font(max(16, panel_w // 12), bold=True)
    bf = load_font(max(13, panel_w // 16))
    lines_title = wrap_text(draw, title, tf, panel_w - 24)
    y = 16
    y = draw_text_block(draw, w + 12, y, panel_w - 24, lines_title[:3], tf, fill=(10, 61, 74)) + 12

    for i, step in enumerate(steps):
        draw.ellipse([w + 12, y, w + 36, y + 24], fill=(232, 93, 4))
        draw.text((w + 18, y + 3), str(i + 1), font=bf, fill=(255, 255, 255))
        lines = wrap_text(draw, step, bf, panel_w - 44)
        y = draw_text_block(draw, w + 44, y, panel_w - 44, lines[:4], bf) + 10

    return canvas


def pick_layout(w: int, h: int, n: int) -> str:
    ratio = h / w
    if w <= 280 and n >= 3:
        return "vertical"
    if ratio >= 1.15 and n >= 3:
        return "vertical"
    if ratio >= 0.9 and w >= 900:
        return "bottom"
    if n >= 4 and w >= 700:
        return "bottom"
    return "sidebar"


def render_one(src: Path, title: str, steps: list[str], dest: Path) -> tuple[int, int]:
    raw = Image.open(src)
    img = upscale(raw)
    w, h = img.size
    layout = pick_layout(w, h, len(steps))

    if layout == "vertical":
        out = render_vertical_strips(img, title, steps)
    elif layout == "bottom":
        out = render_bottom_extension(img, title, steps)
    else:
        out = render_sidebar(img, title, steps)

    dest.parent.mkdir(parents=True, exist_ok=True)
    ext = dest.suffix.lower()
    if ext in {".jpg", ".jpeg"}:
        out.save(dest, quality=92, optimize=True)
    else:
        out.save(dest, quality=92, optimize=True)
    return out.size


def main() -> None:
    catalog = load_catalog()
    OUT.mkdir(parents=True, exist_ok=True)
    done = 0
    for fn, (_cat, title, body) in sorted(catalog.items()):
        src = SRC / fn
        if not src.exists():
            print(f"SKIP missing {fn}")
            continue
        steps = steps_for(fn, body)
        stem = Path(fn).stem
        dest = OUT / f"{stem}_bg.jpg"
        size = render_one(src, title, steps, dest)
        done += 1
        print(f"OK {fn} -> {dest.name} {size[0]}x{size[1]}")

    print(f"Rendered {done} images -> {OUT}")


if __name__ == "__main__":
    main()
