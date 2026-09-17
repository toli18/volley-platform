"""Export / import all klipove narration texts for manual review."""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
KLIPOVE = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik" / "klipove.html"
OUT = ROOT / "KLIPOVE_TEKST_ZA_KOREKCIYA.txt"
CATALOG = ROOT / "vylo_tiktok" / "_catalog.txt"

# (public_stem, slug, subdir) — original 18 clips
ORIGINAL = [
    ("posreshtane-stranichno", "lateral_movement", ""),
    ("posreshtane-konflikti", "posreshtane_seams", "vylo"),
    ("posreshtane-lateralen-pas", "lateral_passing", ""),
    ("posreshtane", "reception", ""),
    ("rotacia-51", "rotacia_51", "vylo"),
    ("edinichen-blok-i-zashtita", "single_block_defense", ""),
    ("dvoen-blok-i-zashtita", "double_block_line_closed", ""),
    ("blok-funia", "blok_funnel", "vylo"),
    ("troen-blok", "triple_block", ""),
    ("ataka-z4-zamah", "attack_z4_swing", ""),
    ("diagonal-ataka", "opposite_directions", ""),
    ("centar-tempo", "middle_tempo", ""),
    ("razpredelitel-centar", "setter_centar", "vylo"),
    ("z1-ataka", "backrow_right", ""),
    ("pokritie-z4", "coverage_z4", ""),
    ("dylga-diagonal", "deep_cross_libero", ""),
    ("zashtita-z4", "pov_z4_defense", ""),
    ("tesna-diagonal", "tight_cross_defense", ""),
]

BLOCK_START = re.compile(r"^={10,}\s*КЛИП\s+(\d+)\s*={10,}\s*$")
FIELD = re.compile(r"^(STEM|TITLE|SUB|SLUG|DIR|FILE):\s*(.*)$")
END_MARK = "--- КРАЙ ---"


def stem_to_source(stem: str) -> tuple[str, str, Path]:
    for pub, slug, sub in ORIGINAL:
        if pub == stem:
            base = ROOT / sub if sub else ROOT
            return slug, sub, base / f"{slug}.bg_narration.txt"
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) > 5 and parts[5].lower().startswith("yes"):
            continue
        _url, slug, pub, _title, _sub = parts[:5]
        if pub == stem:
            return slug, "vylo_tiktok", ROOT / "vylo_tiktok" / f"{slug}.bg_narration.txt"
    raise KeyError(f"No narration source for stem: {stem}")


def parse_klipove() -> list[tuple[str, str, str]]:
    html = KLIPOVE.read_text(encoding="utf-8")
    pattern = re.compile(
        r'\{\s*src:\s*"/uchebnik/([^"]+\.mp4)"\s*,\s*title:\s*"([^"]*)"\s*,\s*sub:\s*"([^"]*)"\s*\}'
    )
    return [(m.group(1).replace(".mp4", ""), m.group(2), m.group(3)) for m in pattern.finditer(html)]


def read_phrases(path: Path) -> list[tuple[float, str]]:
    rows: list[tuple[float, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        start_s, text = line.split("|", 1)
        rows.append((float(start_s.strip()), text.strip()))
    return rows


def write_narration(path: Path, rows: list[tuple[float, str]], header: str | None) -> None:
    lines: list[str] = []
    if header:
        lines.append(header)
    for start, text in rows:
        lines.append(f"{start:.2f} | {text}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def export_text() -> None:
    clips = parse_klipove()
    chunks: list[str] = [
        "КЛИПОВЕ — ТЕКСТ ЗА КОРЕКЦИЯ",
        f"Общо: {len(clips)} клипа · ред = feed в klipove.html",
        "",
        "КАК ДА РЕДАКТИРАШ:",
        "1. Промени само редовете между „--- ТЕКСТ ---“ и „--- КРАЙ ---“.",
        "2. Един ред = едно изречение/фраза за TTS (не махай редове без причина).",
        "3. Не пипай STEM, SLUG, DIR, FILE и маркерите.",
        "4. След корекция: python _export_narrations.py import",
        "",
    ]
    for i, (stem, title, sub) in enumerate(clips, 1):
        slug, subdir, path = stem_to_source(stem)
        if not path.exists():
            raise FileNotFoundError(path)
        phrases = read_phrases(path)
        header_line = next(
            (ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip().startswith("#")),
            f"# {title}",
        )
        chunks.append("=" * 72)
        chunks.append(f"КЛИП {i:02d}")
        chunks.append("=" * 72)
        chunks.append(f"STEM: {stem}")
        chunks.append(f"TITLE: {title}")
        chunks.append(f"SUB: {sub}")
        chunks.append(f"SLUG: {slug}")
        chunks.append(f"DIR: {subdir or '.'}")
        chunks.append(f"FILE: {path.relative_to(ROOT.parents[1])}")
        chunks.append("--- ТЕКСТ ---")
        for _start, text in phrases:
            chunks.append(text)
        chunks.append("--- КРАЙ ---")
        chunks.append(f"ПЪЛЕН ТЕКСТ: {' '.join(t for _, t in phrases)}")
        chunks.append("")
    OUT.write_text("\n".join(chunks), encoding="utf-8")
    print(f"Wrote {OUT} ({len(clips)} clips)")


def import_text() -> None:
    if not OUT.exists():
        raise FileNotFoundError(OUT)
    text = OUT.read_text(encoding="utf-8")
    blocks = re.split(r"={10,}\s*КЛИП\s+\d+\s*={10,}", text)
    updated = 0
    for block in blocks:
        if "FILE:" not in block:
            continue
        meta: dict[str, str] = {}
        body_lines: list[str] = []
        in_body = False
        for line in block.splitlines():
            if line.strip() == "--- ТЕКСТ ---":
                in_body = True
                continue
            if line.strip() == END_MARK:
                in_body = False
                continue
            if in_body:
                if line.strip():
                    body_lines.append(line.rstrip())
                continue
            m = FIELD.match(line.strip())
            if m:
                meta[m.group(1)] = m.group(2)
        if not meta.get("FILE") or not body_lines:
            continue
        path = ROOT.parents[1] / meta["FILE"]
        if not path.exists():
            raise FileNotFoundError(path)
        old_rows = read_phrases(path)
        if len(body_lines) != len(old_rows):
            raise ValueError(
                f"{path.name}: очаквани {len(old_rows)} реда, получени {len(body_lines)}"
            )
        header = next(
            (ln for ln in path.read_text(encoding="utf-8").splitlines() if ln.strip().startswith("#")),
            None,
        )
        new_rows = [(start, body_lines[i]) for i, (start, _old) in enumerate(old_rows)]
        write_narration(path, new_rows, header)
        print("Updated", path.relative_to(ROOT.parents[1]))
        updated += 1
    print(f"Import done: {updated} files")


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        import_text()
    else:
        export_text()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
