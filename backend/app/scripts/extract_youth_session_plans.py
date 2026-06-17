"""Извлича MINI/U13/U14 конспекти от учебника и записва bvf_textbook_bg.json."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.national_method.youth_session_plans import patch_textbook_json


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract mini/U13/U14 session plans into textbook JSON")
    parser.add_argument("--json", type=Path, default=None, help="Path to bvf_textbook_bg.json")
    args = parser.parse_args()
    stats = patch_textbook_json(args.json)
    print(f"Youth session plans patched: {stats}")


if __name__ == "__main__":
    main()
