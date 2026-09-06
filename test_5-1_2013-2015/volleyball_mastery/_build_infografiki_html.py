"""Generate infografiki/index.html — BG text overlays on original images (CSS layers)."""
from __future__ import annotations

import re
import sys
from html import escape
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _infografiki_content import STEPS  # noqa: E402
from _infografiki_overlays import overlays_for  # noqa: E402

PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik" / "infografiki"
CATALOG = PUBLIC / "_catalog.txt"
IMG = PUBLIC / "img"

CAT_LABEL = {
    "posreshtane": "Посрещане",
    "blok": "Блок",
    "zashtita": "Защита",
    "ataka": "Атака",
    "tehnika": "Техника",
    "trenirovka": "Тренировка (разпределител)",
    "pravila": "Правила",
    "obsho": "Общо",
}

CAT_ORDER = ["posreshtane", "ataka", "blok", "zashtita", "tehnika", "pravila", "trenirovka", "obsho"]


def load_rows() -> list[tuple[str, str, str, str]]:
    rows = []
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        fn, cat, title, body = line.split("|", 3)
        rows.append((fn.strip(), cat.strip(), title.strip(), body.strip()))
    return rows


def steps_for(fn: str, body: str) -> list[str]:
    if fn in STEPS:
        return STEPS[fn]
    parts = re.split(r"(?<=[.;])\s+", body)
    out = [p.strip().rstrip(".") for p in parts if len(p.strip()) > 6]
    if len(out) <= 1:
        out = [s.strip() for s in re.split(r",\s+", body) if len(s.strip()) > 6]
    return out if out else [body]


def image_size(fn: str) -> tuple[int, int]:
    p = IMG / fn
    if Image and p.exists():
        with Image.open(p) as im:
            return im.size
    return 1080, 1400


def render_layer(layer: dict) -> str:
    x, y, w, h = layer["x"], layer["y"], layer["w"], layer["h"]
    cls = escape(layer["cls"])
    style = f"left:{x}%;top:{y}%;width:{w}%;height:{h}%;"
    items = layer.get("items")
    if items:
        lis = "".join(f"<li>{escape(it)}</li>" for it in items)
        head = escape(layer["text"])
        inner = f'<strong class="foot-head">{head}</strong><ul class="foot-list">{lis}</ul>'
        return f'      <div class="layer {cls}" style="{style}">{inner}</div>'
    text = escape(layer.get("text", ""))
    if not text:
        return ""
    return f'      <div class="layer {cls}" style="{style}"><span>{text}</span></div>'


def render_card(fn: str, title: str, body: str) -> str:
    steps = steps_for(fn, body)
    w, h = image_size(fn)
    layers = overlays_for(fn, title, steps, w, h)
    layer_html = "\n".join(render_layer(L) for L in layers if L.get("text") or L.get("items"))
    src = f"img/{escape(fn)}"
    return f"""    <article class="card" id="{escape(fn)}">
      <a class="frame-link" href="{src}" target="_blank" rel="noopener" title="Отвори оригинал + превод">
        <div class="frame">
          <img src="{src}" alt="{escape(title)}" loading="lazy" width="{w}" height="{h}" />
{layer_html}
        </div>
      </a>
    </article>"""


def main() -> None:
    rows = load_rows()
    by_cat: dict[str, list] = {c: [] for c in CAT_ORDER}
    for row in rows:
        by_cat.setdefault(row[1], []).append(row)

    nav = "\n".join(
        f'    <a href="#{c}">{CAT_LABEL.get(c, c)}</a>' for c in CAT_ORDER if by_cat.get(c)
    )
    sections = []
    for cat in CAT_ORDER:
        items = by_cat.get(cat, [])
        if not items:
            continue
        cards = [render_card(fn, title, body) for fn, _c, title, body in items]
        sections.append(
            f"""  <section class="sec" id="{cat}">
    <h2>{CAT_LABEL.get(cat, cat)}</h2>
    <div class="grid">
{chr(10).join(cards)}
    </div>
  </section>"""
        )

    html = f"""<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Инфографики — Волей Герои</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&display=swap" rel="stylesheet" />
<style>
  :root {{ --deep:#0a3d4a; --teal:#0d8a8a; --sand:#fff6e8; --pop:#e85d04; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:Nunito,system-ui,sans-serif; background:linear-gradient(180deg,#e8f7f5,var(--sand)); padding:16px 16px 48px; }}
  .wrap {{ max-width:720px; margin:0 auto; }}
  .back {{ display:inline-block; margin-bottom:10px; color:var(--teal); font-weight:800; text-decoration:none; }}
  h1 {{ font-size:1.75rem; font-weight:800; color:var(--deep); }}
  .sub {{ margin:8px 0 12px; font-weight:600; color:#355; }}
  .note {{ background:#fff; border:2px solid var(--teal); border-radius:12px; padding:12px 14px; font-size:.85rem; font-weight:700; color:#234; margin-bottom:18px; line-height:1.45; }}
  nav.cat {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; position:sticky; top:0; z-index:20; background:rgba(232,247,245,.96); padding:10px 0; }}
  nav.cat a {{ padding:8px 12px; border-radius:999px; background:#fff; border:2px solid var(--deep); font-size:.78rem; font-weight:800; text-decoration:none; color:var(--deep); }}
  .sec {{ margin-top:32px; scroll-margin-top:56px; }}
  .sec h2 {{ font-size:1.35rem; font-weight:800; color:var(--pop); margin-bottom:12px; }}
  .grid {{ display:grid; gap:20px; }}
  .card {{ background:#fff; border:3px solid var(--deep); border-radius:14px; overflow:hidden; box-shadow:4px 4px 0 rgba(10,61,74,.1); }}
  .frame-link {{ display:block; text-decoration:none; color:inherit; }}
  .frame {{ position:relative; width:100%; line-height:0; }}
  .frame img {{ width:100%; height:auto; display:block; }}
  .layer {{ position:absolute; display:flex; align-items:center; justify-content:center; text-align:center; padding:3px 5px; overflow:hidden; line-height:1.15; }}
  .layer span {{ display:block; width:100%; }}
  .layer.title {{ background:rgba(10,35,55,.96); color:#fff; font-weight:800; font-size:clamp(11px,3.2vw,20px); letter-spacing:.02em; }}
  .layer.sub {{ background:rgba(8,28,45,.94); color:#7dffb0; font-weight:800; font-size:clamp(9px,2.6vw,16px); }}
  .layer.tag {{ background:rgba(8,28,45,.9); color:#dce8f0; font-weight:700; font-size:clamp(7px,2vw,12px); }}
  .layer.head-l {{ background:rgba(22,110,55,.94); color:#fff; font-weight:800; font-size:clamp(8px,2.3vw,14px); }}
  .layer.head-r {{ background:rgba(165,35,35,.94); color:#fff; font-weight:800; font-size:clamp(8px,2.3vw,14px); }}
  .layer.label-l {{ background:rgba(255,255,255,.96); color:#145a32; font-weight:700; font-size:clamp(7px,1.85vw,12px); justify-content:flex-start; text-align:left; border-left:3px solid #2ecc71; }}
  .layer.label-r {{ background:rgba(255,255,255,.96); color:#8b1a1a; font-weight:700; font-size:clamp(7px,1.85vw,12px); justify-content:flex-start; text-align:left; border-left:3px solid #e74c3c; }}
  .layer.foot-title-l, .layer.foot-title-r {{ flex-direction:column; align-items:flex-start; justify-content:flex-start; padding:6px 8px; text-align:left; }}
  .layer.foot-title-l {{ background:rgba(18,85,45,.97); color:#eaffea; }}
  .layer.foot-title-r {{ background:rgba(120,28,28,.97); color:#ffeaea; }}
  .foot-head {{ display:block; font-weight:800; font-size:clamp(8px,2.2vw,13px); margin-bottom:4px; }}
  .foot-list {{ list-style:none; padding:0; margin:0; font-size:clamp(6px,1.65vw,11px); font-weight:700; line-height:1.25; }}
  .foot-list li {{ padding:1px 0; }}
  .foot-list li::before {{ content:"✓ "; color:#9f9; }}
  .layer.foot-title-r .foot-list li::before {{ content:"✗ "; color:#faa; }}
  .layer.banner {{ background:rgba(235,185,45,.97); color:#1a2030; font-weight:800; font-size:clamp(8px,2.4vw,14px); }}
  .layer.step-h {{ background:rgba(14,58,90,.95); color:#fff; font-weight:800; font-size:clamp(8px,2.2vw,13px); justify-content:flex-start; text-align:left; padding-left:10px; }}
  .layer.step-b {{ background:rgba(255,255,255,.95); color:#234; font-weight:700; font-size:clamp(7px,1.9vw,12px); justify-content:flex-start; text-align:left; padding:6px 10px; align-items:flex-start; }}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/uchebnik/">← Волей Герои</a>
  <h1>ИНФОГРАФИКИ</h1>
  <p class="sub">На български · {len(rows)} карти</p>
  <p class="note">Преводът е върху оригиналната картинка — скриваме чуждия текст и слагаме български на същото място. Оригиналът под слоевете се пази.</p>
  <nav class="cat" aria-label="Категории">
{nav}
  </nav>
{chr(10).join(sections)}
</div>
</body>
</html>"""
    (PUBLIC / "index.html").write_text(html, encoding="utf-8")
    print(f"Wrote index.html ({len(rows)} overlay cards, original img/)")


if __name__ == "__main__":
    main()
