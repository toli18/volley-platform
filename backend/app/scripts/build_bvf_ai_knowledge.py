"""Генерира bvf_ai_knowledge.json от Volley Comment bundle."""

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.national_method.bvf_ai_knowledge import DATA_PATH, build_from_volleycomment_json

VC = BACKEND_ROOT / "app" / "seed" / "data" / "bvf_volleycomment_bg.json"


def main():
    if not VC.is_file():
        print(f"Missing {VC}")
        sys.exit(1)
    bundle = build_from_volleycomment_json(VC)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {DATA_PATH} — ages: {list(bundle.get('ages', {}).keys())}")


if __name__ == "__main__":
    main()
