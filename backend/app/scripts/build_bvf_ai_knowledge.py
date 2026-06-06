"""Генерира bvf_ai_knowledge.json от учебника БФВ."""

import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.national_method.bvf_ai_knowledge import DATA_PATH, build_from_textbook_json

TB = BACKEND_ROOT / "app" / "seed" / "data" / "bvf_textbook_bg.json"
TB_TXT = BACKEND_ROOT / "app" / "seed" / "data" / "bvf_textbook_bg.txt"


def main():
    if not TB.is_file():
        if not TB_TXT.is_file():
            print(f"Missing {TB_TXT} — add textbook text first")
            sys.exit(1)
        from app.scripts.ingest_bvf_textbook import export_textbook

        export_textbook()
    bundle = build_from_textbook_json(TB)
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(bundle, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {DATA_PATH} — ages: {list(bundle.get('ages', {}).keys())}")


if __name__ == "__main__":
    main()
