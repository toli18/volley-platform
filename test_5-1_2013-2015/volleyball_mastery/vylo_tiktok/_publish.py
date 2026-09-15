"""Dub all vylo_tiktok clips and publish MP4 + VTT to public/uchebnik."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BATCH = Path(__file__).resolve().parent
CATALOG = BATCH / "_catalog.txt"
PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik"
SUBS = PUBLIC / "subs"
DUB = ROOT / "_dub_bg.py"
KLIPOVE = PUBLIC / "klipove.html"


def rows() -> list[tuple[str, str, str, str]]:
    out: list[tuple[str, str, str, str]] = []
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) > 5 and parts[5].lower().startswith("yes"):
            continue
        url, slug, stem, title, subtitle = parts[:5]
        out.append((slug, stem, title, subtitle))
    return out


def dub_all() -> None:
    for slug, *_ in rows():
        out = BATCH / f"{slug}_BG_internal.mp4"
        vtt = BATCH / f"{slug}.bg.vtt"
        nosubs = BATCH / f"{slug}_video_nosubs.mp4"
        for p in (out, vtt, nosubs):
            if p.exists():
                p.unlink()
        cmd = [sys.executable, str(DUB), slug, "--dir", "vylo_tiktok"]
        print(">>>", " ".join(cmd))
        subprocess.run(cmd, cwd=ROOT, check=True)


def publish() -> None:
    SUBS.mkdir(parents=True, exist_ok=True)
    for slug, stem, title, subtitle in rows():
        src = BATCH / f"{slug}_BG_internal.mp4"
        vtt = BATCH / f"{slug}.bg.vtt"
        if not src.exists() or not vtt.exists():
            raise FileNotFoundError(f"Missing dub for {slug}")
        shutil.copy2(src, PUBLIC / f"{stem}.mp4")
        shutil.copy2(vtt, SUBS / f"{stem}.vtt")
        print("Published", stem)


def append_klipove() -> None:
    html = KLIPOVE.read_text(encoding="utf-8")
    marker = "    ].map((c) => ({ ...c, vtt:"
    if "blok-greshka.mp4" in html:
        print("klipove.html already has vylo_tiktok clips")
        return
    entries = []
    for _slug, stem, title, subtitle in rows():
        entries.append(
            f'      {{ src: "/uchebnik/{stem}.mp4", title: "{title}", sub: "{subtitle}" }},'
        )
    block = "\n".join(entries) + "\n"
    html = html.replace(marker, block + marker, 1)
    KLIPOVE.write_text(html, encoding="utf-8")
    print("Updated klipove.html (+19 clips)")


def main() -> int:
    dub_all()
    publish()
    append_klipove()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
