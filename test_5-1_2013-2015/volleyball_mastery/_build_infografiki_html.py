"""Generate infografiki/index.html from catalog."""
from __future__ import annotations

from html import escape
from pathlib import Path

PUBLIC = Path(__file__).resolve().parents[2] / "frontend" / "volley-platform-client" / "public" / "uchebnik" / "infografiki"
CATALOG = PUBLIC / "_catalog.txt"

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
        cards = []
        for fn, _c, title, body in items:
            cards.append(
                f"""    <article class="card" id="{escape(fn)}">
      <img src="/uchebnik/infografiki/img/{escape(fn)}" alt="{escape(title)}" loading="lazy" />
      <div class="card-body">
        <h3>{escape(title)}</h3>
        <p>{escape(body)}</p>
      </div>
    </article>"""
            )
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
  .sub {{ margin:8px 0 16px; font-weight:600; color:#355; }}
  nav.cat {{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:24px; position:sticky; top:0; z-index:10; background:rgba(232,247,245,.95); padding:10px 0; backdrop-filter:blur(6px); }}
  nav.cat a {{ padding:8px 12px; border-radius:999px; background:#fff; border:2px solid var(--deep); font-size:.8rem; font-weight:800; text-decoration:none; color:var(--deep); }}
  .sec {{ margin-top:36px; scroll-margin-top:56px; }}
  .sec h2 {{ font-family:Bangers,cursive; font-size:1.5rem; color:var(--pop); margin-bottom:12px; }}
  .grid {{ display:grid; gap:16px; }}
  .card {{ background:#fff; border:3px solid var(--deep); border-radius:14px; overflow:hidden; box-shadow:4px 4px 0 rgba(10,61,74,.12); }}
  .card img {{ display:block; width:100%; height:auto; background:#f0f0f0; }}
  .card-body {{ padding:12px 14px 14px; }}
  .card h3 {{ font-size:1rem; color:var(--deep); margin-bottom:6px; }}
  .card p {{ font-size:.9rem; line-height:1.45; font-weight:600; color:#334; }}
</style>
</head>
<body>
<div class="wrap">
  <a class="back" href="/uchebnik/">← Волей Герои</a>
  <h1>ИНФОГРАФИКИ</h1>
  <p class="sub">На български · {len(rows)} карти · за тренировка и състезание</p>
  <nav class="cat" aria-label="Категории">
{nav}
  </nav>
{chr(10).join(sections)}
</div>
</body>
</html>"""
    (PUBLIC / "index.html").write_text(html, encoding="utf-8")
    print(f"Wrote index.html ({len(rows)} cards)")


if __name__ == "__main__":
    main()
