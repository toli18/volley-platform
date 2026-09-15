"""Download VYLO TikTok batch from _catalog.txt (vm.tiktok or full URLs)."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent.parent
BATCH = Path(__file__).resolve().parent
CATALOG = BATCH / "_catalog.txt"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}\n{p.stderr}")


def parse_row(line: str) -> tuple[str, str, bool]:
    parts = [p.strip() for p in line.split("|")]
    url, slug = parts[0], parts[1]
    skip = len(parts) > 5 and parts[5].lower().startswith("yes")
    return url, slug, skip


def main() -> int:
    BATCH.mkdir(exist_ok=True)
    for line in CATALOG.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        url, slug, skip = parse_row(line)
        if skip:
            print(f"SKIP promo {slug}")
            continue
        out = BATCH / f"{slug}_video.mp4"
        if out.exists() and out.stat().st_size > 100_000:
            print(f"OK exists {slug}")
            continue
        print(f"Downloading {slug}...")
        run([
            "yt-dlp", "--no-update",
            "--ffmpeg-location", FFMPEG,
            "-f", "best[ext=mp4]/best",
            "--write-subs", "--write-auto-subs",
            "--sub-lang", "eng-US,en",
            "-o", str(BATCH / f"{slug}_video.%(ext)s"),
            url,
        ])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
