"""Re-dub every clip listed in klipove.html and publish MP4 + VTT."""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik"
SUBS = PUBLIC / "subs"
DUB = ROOT / "_dub_bg.py"
KLIPOVE = PUBLIC / "klipove.html"

# same mapping as _export_narrations.py
from _export_narrations import stem_to_source  # noqa: E402

ANCHORED_STEMS = frozenset({"vsiaki-ugli"})


def stems() -> list[str]:
    html = KLIPOVE.read_text(encoding="utf-8")
    return [
        m.replace(".mp4", "")
        for m in re.findall(r'src:\s*"/uchebnik/([^"]+\.mp4)"', html)
    ]


def main() -> int:
    args = sys.argv[1:]
    only = False
    after = ""
    if "--only" in args:
        only = True
        i = args.index("--only")
        if i + 1 >= len(args):
            raise SystemExit("Usage: _redub_klipove.py [--only] STEM")
        after = args[i + 1]
    elif args:
        after = args[0]
    all_stems = stems()
    if after:
        if after not in all_stems:
            raise SystemExit(f"Unknown stem: {after}")
        all_stems = [after] if only else all_stems[all_stems.index(after) :]
    SUBS.mkdir(parents=True, exist_ok=True)
    for stem in all_stems:
        slug, subdir, narr = stem_to_source(stem)
        base = ROOT / subdir if subdir and subdir != "." else ROOT
        cmd = [sys.executable, str(DUB), slug]
        if subdir and subdir != ".":
            cmd.extend(["--dir", subdir])
        if stem in ANCHORED_STEMS:
            cmd.append("--anchored")
        cmd.append("--force-blur")
        print(">>>", " ".join(cmd))
        for attempt in range(5):
            r = subprocess.run(cmd, cwd=ROOT)
            if r.returncode == 0:
                break
            print(f"Retry {attempt + 1}/5 for {stem} (exit {r.returncode})", file=sys.stderr)
        else:
            raise subprocess.CalledProcessError(r.returncode, cmd)
        src = base / f"{slug}_BG_internal.mp4"
        vtt = base / f"{slug}.bg.vtt"
        shutil.copy2(src, PUBLIC / f"{stem}.mp4")
        shutil.copy2(vtt, SUBS / f"{stem}.vtt")
        print("Published", stem)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
