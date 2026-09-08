"""Re-dub all published uchebnik videos (no burned subs) and copy MP4 + VTT to public."""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT.parents[1] / "frontend" / "volley-platform-client" / "public" / "uchebnik"
SUBS = PUBLIC / "subs"
DUB = ROOT / "_dub_bg.py"

# (slug, subdir, public_stem)
VIDEOS = [
    ("reception", "", "posreshtane"),
    ("lateral_movement", "", "posreshtane-stranichno"),
    ("lateral_passing", "", "posreshtane-lateralen-pas"),
    ("posreshtane_seams", "vylo", "posreshtane-konflikti"),
    ("rotacia_51", "vylo", "rotacia-51"),
    ("blok_funnel", "vylo", "blok-funia"),
    ("setter_centar", "vylo", "razpredelitel-centar"),
    ("single_block_defense", "", "edinichen-blok-i-zashtita"),
    ("double_block_line_closed", "", "dvoen-blok-i-zashtita"),
    ("attack_z4_swing", "", "ataka-z4-zamah"),
    ("opposite_directions", "", "diagonal-ataka"),
    ("middle_tempo", "", "centar-tempo"),
    ("backrow_right", "", "z1-ataka"),
    ("coverage_z4", "", "pokritie-z4"),
    ("deep_cross_libero", "", "dylga-diagonal"),
    ("pov_z4_defense", "", "zashtita-z4"),
    ("tight_cross_defense", "", "tesna-diagonal"),
    ("triple_block", "", "troen-blok"),
]


def main() -> int:
    SUBS.mkdir(parents=True, exist_ok=True)
    for slug, subdir, stem in VIDEOS:
        base = ROOT / subdir if subdir else ROOT
        out = base / f"{slug}_BG_internal.mp4"
        vtt = base / f"{slug}.bg.vtt"
        nosubs = base / f"{slug}_video_nosubs.mp4"
        for p in (out, vtt, nosubs):
            if p.exists():
                p.unlink()
        cmd = [sys.executable, str(DUB), slug]
        if subdir:
            cmd.extend(["--dir", subdir])
        print(">>>", " ".join(cmd))
        subprocess.run(cmd, cwd=ROOT, check=True)
        if not out.exists():
            raise FileNotFoundError(out)
        if not vtt.exists():
            raise FileNotFoundError(vtt)
        dest = PUBLIC / f"{stem}.mp4"
        shutil.copy2(out, dest)
        shutil.copy2(vtt, SUBS / f"{stem}.vtt")
        print("Published", dest.name, "+", f"{stem}.vtt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
