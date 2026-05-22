"""
Извлича методически насоки от live Volley Coach SPA.

  python -m app.scripts.scrape_volley_coach_guidelines
  python -m app.scripts.scrape_volley_coach_guidelines --apply
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Merge import into bvf_coaching_guidelines_bg + bvf_method_sections_bg",
    )
    args = parser.parse_args()

    from app.scripts.volley_coach_extract import write_import_json

    bundle = write_import_json()
    print(f"Wrote import — {len(bundle['sections'])} sections")
    for s in bundle["sections"]:
        sk = len(s.get("skills") or [])
        bl = len(s.get("blocks") or [])
        print(f"  {s['slug']} -> {s.get('platform_slug', s['slug'])}: skills={sk} blocks={bl}")

    if args.apply:
        from app.scripts.apply_volley_coach_import import main as apply_main

        import json

        json.loads  # noqa — keep import path warm
        apply_main()


if __name__ == "__main__":
    main()
