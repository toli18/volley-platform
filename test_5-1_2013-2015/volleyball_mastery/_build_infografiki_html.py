"""Generate infografiki/index.html — gallery with Bulgarian overlay images."""
from __future__ import annotations

import re
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _infografiki_content import STEPS  # noqa: E402

PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik" / "infografiki"
CATALOG = PUBLIC / "_catalog.txt"
IMG_BG = PUBLIC / "img_bg"

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


def bg_image_name(fn: str) -> str:
    return f"{Path(fn).stem}_bg.jpg"


def render_card(fn: str, title: str) -> str:
    src = f"img_bg/{bg_image_name(fn)}"
    return f"""    <article class="card" id="{escape(fn)}">
      <a href="{src}" target="_blank" rel="noopener">
        <img src="{src}" alt="{escape(title)}" loading="lazy" width="1080" />
      </a>
      <p class="cap">{escape(title)}</p>
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
        cards = [render_card(fn, title) for fn, _c, title, _body in items]
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
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@600;700;800&family=Bangers&display=swap" rel="stylesheet" />
<style>
  :root {{ --deep:#0a3d4a; --teal:#0d8a8a; --sand:#fff6e8; --pop:#e85d04; --ink:#1a2a2e; }}
  * {{ box-sizing:border-box; margin:0; padding:0; }}
  body {{ font-family:Nunito,system-ui,sans-serif; background:linear-gradient(180deg,#e8f7f5,var(--sand)); color:var(--ink); padding:16px 16px 48px; }}
  .wrap {{ max-width:720px; margin:0 auto; }}
  .back {{ display:inline-block; margin-bottom:10px; color:var(--teal); font-weight:800; text-decoration:none; }}
  h1 {{ font-family:Bangers,cursive; font-size:2rem; color:var(--deep); letter-spacing:.04em; }}
  .sub {{ margin:8px 0 12px; font-weight:600; color:#355; line-height:1.45; }}
  .note {{ background:#fff; border:2px solid var(--teal); border-radius:12px; padding:12px 14px; font-size:.88rem; font-weight:700; color:#234; margin-bottom:18px; }}
  nav.cat {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; position:sticky; top:0; z-index:10; background:rgba(232,247,245,.95); padding:10px 0; backdrop-filter:blur(6px); }}
  nav.cat a {{ padding:8px 12px; border-radius:999px; background:#fff; border:2px solid var(--deep); font-size:.8rem; font-weight:800; text-decoration:none; color:var(--deep); }}
  .sec {{ margin-top:36px; scroll-margin-top:56px; }}
  .sec h2 {{ font-family:Bangers,cursive; font-size:1.5rem; color:var(--pop); margin-bottom:12px; }}
  .grid {{ display:grid; gap:18px; }}
  .card {{ background:#fff; border:3px solid var(--deep); border-radius:14px; overflow:hidden; box-shadow:4px 4px 0 rgba(10,61,74,.12); }}
  .card a {{ display:block; line-height:0; }}
  .card img {{ width:100%; height:auto; display:block; }}
  .cap {{ padding:10px 14px 12px; font-size:.92rem; font-weight:800; color:var(--deep); }}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/uchebnik/">← Волей Герои</a>
  <h1>ИНФОГРАФИКИ</h1>
  <p class="sub">На български · {len(rows)} карти · натисни за по-голям размер</p>
  <p class="note">Преводът е върху картинките. 16 от 47 са HD (1365 px); останалите са upscaled от Facebook миниатюри — ако имаш оригинали в по-висока резолюция, кажи.</p>
  <nav class="cat" aria-label="Категории">
{nav}
  </nav>
{chr(10).join(sections)}
</div>
</body>
</html>"""
    (PUBLIC / "index.html").write_text(html, encoding="utf-8")
    print(f"Wrote index.html ({len(rows)} image cards from img_bg/)")


if __name__ == "__main__":
    main()
