"""Render Bulgarian text overlays ON infographic images (cover EN/ES text in place)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _infografiki_content import COMPARISON, STEPS  # noqa: E402

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
    return ImageFont.truetype(str(path), max(10, size))


def upscale(img: Image.Image) -> Image.Image:
    w, h = img.size
    if w >= TARGET_MIN_W:
        return img.filter(ImageFilter.UnsharpMask(radius=1.0, percent=110, threshold=2))
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
    lines: list[str],
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] = (20, 40, 50),
    line_gap: int = 3,
) -> int:
    cy = y
    for line in lines:
        draw.text((x, cy), line, font=font, fill=fill)
        cy += font.size + line_gap
    return cy


def fr(w: int, h: int, x0: float, y0: float, x1: float, y1: float) -> tuple[int, int, int, int]:
    return int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)


def cover(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: tuple[int, int, int, int]) -> None:
    draw.rectangle(box, fill=fill)


def render_comparison(base: Image.Image, spec: dict) -> Image.Image:
    """Correct vs wrong side-by-side — cover all EN text zones in place."""
    img = base.convert("RGBA")
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)

    tf = load_font(max(20, w // 28), bold=True)
    sf = load_font(max(13, w // 42), bold=True)
    hf = load_font(max(14, w // 38), bold=True)
    bf = load_font(max(11, w // 52))
    small = load_font(max(10, w // 58))

    # Top header
    cover(draw, fr(w, h, 0, 0, 1, 0.115), (12, 35, 55, 255))
    cover(draw, fr(w, h, 0, 0.115, 1, 0.145), (8, 28, 45, 255))
    draw.text((w // 2 - draw.textlength(spec["title"], font=tf) // 2, int(h * 0.018)), spec["title"], font=tf, fill=(255, 255, 255))
    sub = spec["subtitle"]
    draw.text((w // 2 - draw.textlength(sub, font=sf) // 2, int(h * 0.075)), sub, font=sf, fill=(120, 220, 140))
    tag = spec.get("tagline", "")
    if tag:
        draw.text((w // 2 - draw.textlength(tag, font=small) // 2, int(h * 0.118)), tag, font=small, fill=(220, 230, 240))

    # Column headers
    cover(draw, fr(w, h, 0, 0.148, 0.495, 0.178), (20, 120, 60, 250))
    cover(draw, fr(w, h, 0.505, 0.148, 1, 0.178), (160, 35, 35, 250))
    draw.text((int(w * 0.04), int(h * 0.152)), spec["left_head"], font=hf, fill=(255, 255, 255))
    draw.text((int(w * 0.54), int(h * 0.152)), spec["right_head"], font=hf, fill=(255, 255, 255))

    # Callout label bands (cover EN labels, keep player photos in center)
    y_bands = [0.19, 0.28, 0.37, 0.46, 0.55, 0.64]
    left_labels = spec.get("left_labels", [])
    right_labels = spec.get("right_labels", [])
    for i, y0 in enumerate(y_bands):
        y1 = y0 + 0.075
        if i < len(left_labels):
            box = fr(w, h, 0.02, y0, 0.47, y1)
            cover(draw, box, (255, 255, 255, 235))
            lines = wrap_text(draw, left_labels[i], small, int(w * 0.42))
            draw_text_block(draw, box[0] + 6, box[1] + 4, lines[:2], small, fill=(15, 80, 40))
        if i < len(right_labels):
            box = fr(w, h, 0.53, y0, 0.98, y1)
            cover(draw, box, (255, 255, 255, 235))
            lines = wrap_text(draw, right_labels[i], small, int(w * 0.42))
            draw_text_block(draw, box[0] + 6, box[1] + 4, lines[:2], small, fill=(120, 25, 25))

    # Footer list boxes
    cover(draw, fr(w, h, 0, 0.715, 0.495, 0.905), (15, 75, 40, 245))
    cover(draw, fr(w, h, 0.505, 0.715, 1, 0.905), (120, 25, 30, 245))
    draw.text((int(w * 0.04), int(h * 0.722)), spec.get("left_footer_title", "Ключови точки"), font=hf, fill=(180, 255, 180))
    draw.text((int(w * 0.54), int(h * 0.722)), spec.get("right_footer_title", "Чести грешки"), font=hf, fill=(255, 200, 200))
    ly = int(h * 0.748)
    for pt in spec.get("left_footer", []):
        draw.text((int(w * 0.05), ly), f"✓ {pt}", font=bf, fill=(240, 255, 240))
        ly += bf.size + 5
    ry = int(h * 0.748)
    for pt in spec.get("right_footer", []):
        draw.text((int(w * 0.55), ry), f"✗ {pt}", font=bf, fill=(255, 235, 235))
        ry += bf.size + 5

    # Bottom banner
    cover(draw, fr(w, h, 0, 0.905, 1, 1), (240, 190, 40, 255))
    banner = spec.get("banner", "")
    draw.text((w // 2 - draw.textlength(banner, font=sf) // 2, int(h * 0.925)), banner, font=sf, fill=(20, 30, 40))

    return Image.alpha_composite(img, ov).convert("RGB")


def render_vertical_strips(base: Image.Image, title: str, steps: list[str]) -> Image.Image:
    """Multi-step vertical infographic — cover EN text in each band."""
    img = base.convert("RGBA")
    w, h = img.size
    n = max(len(steps), 1)
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)

    strip_h = h / n
    title_font = load_font(max(14, w // 38), bold=True)
    body_font = load_font(max(12, w // 48))

    for i, step in enumerate(steps):
        y0 = int(i * strip_h)
        y1 = int((i + 1) * strip_h)
        sh = y1 - y0
        header_h = int(sh * 0.24)
        body_h = int(sh * 0.52)
        body_y0 = y1 - body_h

        cover(draw, (0, y0, w, y0 + header_h), (14, 58, 90, 252))
        cover(draw, (0, body_y0, w, y1), (255, 255, 255, 252))

        num = str(i + 1)
        r = max(18, header_h - 8)
        draw.ellipse([12, y0 + 4, 12 + r, y0 + 4 + r], fill=(232, 93, 4, 255))
        draw.text((18, y0 + 6), num, font=title_font, fill=(255, 255, 255))

        short = step.split("—")[0].strip() if "—" in step else step[:36]
        draw.text((12 + r + 6, y0 + 6), short[:48], font=title_font, fill=(255, 255, 255))

        body_lines = wrap_text(draw, step, body_font, w - 24)
        draw_text_block(draw, 14, body_y0 + 8, body_lines[:5], body_font)

    out = Image.alpha_composite(img, ov)
    band_h = max(48, int(w * 0.085))
    draw2 = ImageDraw.Draw(out)
    cover(draw2, (0, 0, w, band_h), (10, 61, 74, 245))
    tf = load_font(max(17, w // 34), bold=True)
    draw2.text((14, max(6, band_h // 7)), title[:72], font=tf, fill=(255, 255, 255))
    return out.convert("RGB")


def render_inplace_blocks(base: Image.Image, title: str, steps: list[str]) -> Image.Image:
    """Complex/wide infographics — cover top title + bottom text blocks ON the image."""
    img = base.convert("RGBA")
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(ov)

    tf = load_font(max(18, w // 32), bold=True)
    bf = load_font(max(13, w // 46))

    # Top title — cover EN header
    top_h = int(h * 0.11)
    cover(draw, (0, 0, w, top_h), (10, 61, 74, 248))
    draw.text((16, top_h // 5), title[:70], font=tf, fill=(255, 255, 255))

    # Bottom zone — cover EN footer/lists (no canvas extension)
    bot_h = int(min(h * 0.38, max(h * 0.22, len(steps) * 42 + 50)))
    bot_y = h - bot_h
    cover(draw, (0, bot_y, w, h), (255, 252, 245, 250))

    cols = 2 if len(steps) >= 6 else 1
    col_w = w // cols
    for i, step in enumerate(steps):
        col = i % cols
        row = i // cols
        x = 16 + col * col_w
        y = bot_y + 14 + row * (bf.size + 28)
        draw.ellipse([x, y, x + 22, y + 22], fill=(232, 93, 4, 255))
        draw.text((x + 6, y + 2), str(i + 1), font=bf, fill=(255, 255, 255))
        lines = wrap_text(draw, step, bf, col_w - 44)
        draw_text_block(draw, x + 28, y, lines[:3], bf)

    return Image.alpha_composite(img, ov).convert("RGB")


def pick_layout(fn: str, w: int, h: int, n: int) -> str:
    if fn in COMPARISON:
        return "comparison"
    ratio = h / w
    if n >= 3 and ratio >= 0.95:
        return "vertical"
    if ratio >= 1.05 and n >= 2:
        return "vertical"
    if w >= 700 and ratio >= 0.75:
        return "inplace"
    return "vertical"


def render_one(src: Path, fn: str, title: str, steps: list[str], dest: Path) -> tuple[int, int]:
    raw = Image.open(src)
    img = upscale(raw)
    w, h = img.size
    layout = pick_layout(fn, w, h, len(steps))

    if layout == "comparison":
        out = render_comparison(img, COMPARISON[fn])
    elif layout == "vertical":
        out = render_vertical_strips(img, title, steps)
    else:
        out = render_inplace_blocks(img, title, steps)

    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, quality=93, optimize=True)
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
        dest = OUT / f"{Path(fn).stem}_bg.jpg"
        size = render_one(src, fn, title, steps, dest)
        done += 1
        print(f"OK {fn} -> {dest.name} {size[0]}x{size[1]} [{pick_layout(fn, size[0], size[1], len(steps))}]")

    print(f"Rendered {done} images -> {OUT}")


if __name__ == "__main__":
    main()
