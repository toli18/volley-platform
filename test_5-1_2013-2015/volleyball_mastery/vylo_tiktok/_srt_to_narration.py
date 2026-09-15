"""Draft BG narration from EN VTT (refine for kids before dub)."""
from __future__ import annotations

import re
import sys
from pathlib import Path

BATCH = Path(__file__).resolve().parent
CATALOG = BATCH / "_catalog.txt"


def parse_vtt(path: Path) -> list[tuple[float, float, str]]:
    cues = []
    block_lines: list[str] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if line.strip():
            block_lines.append(line.strip())
        elif block_lines:
            cues.extend(_parse_block(block_lines))
            block_lines = []
    if block_lines:
        cues.extend(_parse_block(block_lines))
    return cues


def _parse_block(lines: list[str]) -> list[tuple[float, float, str]]:
    if len(lines) < 2:
        return []
    m = re.match(r"(.+?)\s*-->\s*(.+)", lines[0])
    if not m:
        return []
    text = " ".join(lines[1:])
    return [(ts(m.group(1)), ts(m.group(2)), text)]


def ts(t: str) -> float:
    t = t.strip().replace(",", ".")
    parts = t.split(":")
    if len(parts) == 3:
        h, m, s = parts
        return int(h) * 3600 + int(m) * 60 + float(s)
    m, s = parts
    return int(m) * 60 + float(s)


def merge_cues(cues: list[tuple[float, float, str]], max_gap: float = 0.35, max_chars: int = 90) -> list[tuple[float, str]]:
    if not cues:
        return []
    merged: list[tuple[float, str]] = []
    start, end, buf = cues[0][0], cues[0][1], cues[0][2]
    for cs, ce, ct in cues[1:]:
        if cs - end <= max_gap and len(buf) + len(ct) < max_chars:
            buf = f"{buf} {ct}"
            end = ce
        else:
            merged.append((start, buf.strip()))
            start, end, buf = cs, ce, ct
    merged.append((start, buf.strip()))
    return merged


def simplify_en(text: str) -> str:
    t = text
    repl = [
        (r"#\w+", ""),
        (r"\bposition\s+(\d+)\b", r"зона \1", re.I),
        (r"\bzone\s+(\d+)\b", r"зона \1", re.I),
        (r"\bsetter\b", "разпределител", re.I),
        (r"\bmiddle\b", "център", re.I),
        (r"\blibero\b", "либеро", re.I),
        (r"\bblock\b", "блок", re.I),
        (r"\bdefense\b", "защита", re.I),
        (r"\battack\b", "атака", re.I),
        (r"\bserve\b", "сервис", re.I),
        (r"\bfloat\b", "float", re.I),
        (r"\bpipe\b", "pipe", re.I),
        (r"\btriple block\b", "троен блок", re.I),
        (r"\bcross[- ]court\b", "диагонала", re.I),
    ]
    for item in repl:
        pat, rep = item[0], item[1]
        flags = item[2] if len(item) > 2 else 0
        t = re.sub(pat, rep, t, flags=flags)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def slug_for(line: str) -> str | None:
    if not line or line.startswith("#"):
        return None
    parts = [p.strip() for p in line.split("|")]
    if len(parts) < 2:
        return None
    if len(parts) > 5 and parts[5].lower().startswith("yes"):
        return None
    return parts[1]


def main() -> int:
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        slug = slug_for(line.strip())
        if not slug:
            continue
        vtts = list(BATCH.glob(f"{slug}_video*.vtt"))
        if not vtts:
            print("SKIP no vtt", slug, file=sys.stderr)
            continue
        phrases = merge_cues(parse_vtt(vtts[0]))
        out = BATCH / f"{slug}.bg_narration.txt"
        lines = [f"# DRAFT — refine for kids 10–12 before dub", f"# from {vtts[0].name}"]
        for start, text in phrases:
            lines.append(f"{start:.2f} | {simplify_en(text)}")
        out.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"Wrote {out.name} ({len(phrases)} phrases)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
