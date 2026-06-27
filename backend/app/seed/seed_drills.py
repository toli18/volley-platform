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


def _build_drill_kwargs(row: dict) -> dict:
    """Превръща CSV ред в полета на модела Drill."""
    return dict(
        title=(row.get("name") or "").strip(),
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
    )


# Полета, които се опресняват при синхронизация на вече съществуващи seed
# упражнения (новото тагване от пре-тагването). Описанието/целта НЕ се
# презаписват, за да не се губят евентуални ръчни корекции.
_SYNC_REFRESH_FIELDS = (
    "skill_focus", "skill_domains", "game_phases",
    "tactical_focus", "technical_focus", "position_focus", "zone_focus",
)


def seed_drills(db: Session):
    """Идемпотентна синхронизация на каталога от CSV.

    - Добавя упражнения, които още липсват (по заглавие, сред seed-записите).
    - Опреснява таговете на вече съществуващите seed упражнения
      (``created_by IS NULL`` и scope ``community``), без да пипа
      потребителски подадените упражнения.
    """
    if not CSV_PATH.exists():
        print(f"⚠️ drills.csv not found at: {CSV_PATH}")
        return

    seed_rows = (
        db.query(Drill)
        .filter(Drill.created_by.is_(None), Drill.scope == "community")
        .all()
    )
    by_title: dict[str, list[Drill]] = {}
    for d in seed_rows:
        by_title.setdefault((d.title or "").strip(), []).append(d)

    created = updated = 0
    with open(CSV_PATH, "r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            kw = _build_drill_kwargs(row)
            title = kw["title"]
            if not title:
                continue

            matches = by_title.get(title)
            if matches:
                for d in matches:
                    for fld in _SYNC_REFRESH_FIELDS:
                        setattr(d, fld, kw[fld])
                updated += len(matches)
            else:
                drill = Drill(status="approved", **kw)
                db.add(drill)
                by_title.setdefault(title, []).append(drill)
                created += 1

    db.commit()
    print(f"✅ Drills sync from CSV: +{created} нови, {updated} обновени тага")
