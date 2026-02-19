import csv
import json
from pathlib import Path
from sqlalchemy.orm import Session

from app.models import Drill


BASE_DIR = Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "drills.csv"


def _to_int(x):
    if x is None:
        return None
    s = str(x).strip()
    if not s:
        return None
    try:
        return int(float(s))
    except Exception:
        return None


def _to_list(x):
    """
    Приема:
    - празно -> []
    - JSON array string -> [...]
    - текст с разделители (| или ;) -> [...]
    - единична стойност -> [value]
    """
    if x is None:
        return []
    s = str(x).strip()
    if not s:
        return []
    # JSON list?
    if (s.startswith("[") and s.endswith("]")) or (s.startswith("{") and s.endswith("}")):
        try:
            val = json.loads(s)
            if isinstance(val, list):
                return [str(v).strip() for v in val if str(v).strip()]
        except Exception:
            pass

    # split by common delimiters
    for delim in ["|", ";", ","]:
        if delim in s:
            items = [p.strip() for p in s.split(delim)]
            return [p for p in items if p]

    return [s]


def seed_drills(db: Session):
    if not CSV_PATH.exists():
        print(f"⚠️ drills.csv not found at: {CSV_PATH}")
        return

    # Ако не искаш да дублира при всяко стартиране:
    existing = db.query(Drill).count()
    if existing > 0:
        print(f"ℹ️ Drills already exist ({existing}). Skipping seed_drills().")
        return

    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)

        created = 0
        for row in reader:
            # mapping от CSV -> DB (snake_case)
            title = (row.get("name") or "").strip()
            if not title:
                continue

            drill = Drill(
                title=title,
                description=(row.get("description") or "").strip() or None,
                goal=(row.get("goal") or "").strip() or None,

                category=(row.get("category") or "").strip() or None,
                level=(row.get("level") or "").strip() or None,
                skill_focus=(row.get("skillFocus") or "").strip() or None,

                players=(row.get("players") or "").strip() or None,
                equipment=(row.get("equipment") or "").strip() or None,
                variations=(row.get("variations") or "").strip() or None,

                rpe=_to_int(row.get("rpe")),
                duration_min=_to_int(row.get("durationMin")),
                duration_max=_to_int(row.get("durationMax")),

                age_min=_to_int(row.get("age_min")),
                age_max=_to_int(row.get("age_max")),

                intensity_type=(row.get("intensity_type") or "").strip() or None,
                training_goal=(row.get("training_goal") or "").strip() or None,
                type_of_drill=(row.get("type_of_drill") or "").strip() or None,

                complexity_level=(row.get("complexity_level") or "").strip() or None,
                decision_level=(row.get("decision_level") or "").strip() or None,

                image_urls=_to_list(row.get("imageUrls")),
                video_urls=_to_list(row.get("videoUrls")),

                skill_domains=_to_list(row.get("skill_domains")),
                game_phases=_to_list(row.get("game_phases")),
                tactical_focus=_to_list(row.get("tactical_focus")),
                technical_focus=_to_list(row.get("technical_focus")),
                position_focus=_to_list(row.get("position_focus")),
                zone_focus=_to_list(row.get("zone_focus")),

                # Workflow defaults
                status="approved",   # ако seed-натите искаш да са видими публично
            )

            db.add(drill)
            created += 1

        db.commit()

    print(f"✅ Seeded drills from CSV: {created} created")
