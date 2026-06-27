# -*- coding: utf-8 -*-
"""Seed национална библиотека — курирани BG упражнения (методиката е в учебника).

22-те национални упражнения (scope=federation) са с диаграми и обогатено
съдържание. Seed-ът е идемпотентен: вмъква липсващите по заглавие и обновява
съдържанието/диаграмите на съществуващите (без да пипа потребителски записи).
"""

from sqlalchemy.orm import Session

from app.models import Drill, MethodSource
from app.seed.national_drills_data import NATIONAL_DRILLS

NATIONAL_DRILLS_SOURCE = "bvf-national-drills"

# Полета, които се опресняват за вече съществуващи federation упражнения.
_REFRESH_FIELDS = (
    "description", "goal", "category", "level", "skill_focus",
    "age_min", "age_max", "players", "equipment", "variations",
    "duration_min", "duration_max",
    "setup", "instructions", "coaching_points", "common_mistakes",
    "progressions", "regressions", "rpe", "intensity_type",
    "complexity_level", "decision_level", "type_of_drill", "training_goal",
    "skill_domains", "game_phases", "tactical_focus", "technical_focus",
    "position_focus", "zone_focus", "image_urls",
)


def _ensure_drills_source(db: Session) -> MethodSource:
    src = db.query(MethodSource).filter(MethodSource.filename == NATIONAL_DRILLS_SOURCE).first()
    if src:
        return src
    src = MethodSource(
        filename=NATIONAL_DRILLS_SOURCE,
        original_language="bg",
        content_type="drills",
        age_band="all",
        rights_note="БФВ — курирани национални упражнения",
        ingest_status="published",
        wave=2,
        admin_notes="Национални упражнения за AI генератора (отделно от учебника)",
    )
    db.add(src)
    db.flush()
    return src


def _upsert_drill(db: Session, source_id: int, data: dict) -> None:
    existing = (
        db.query(Drill)
        .filter(Drill.scope == "federation", Drill.title == data["title"])
        .first()
    )
    if existing:
        for field in _REFRESH_FIELDS:
            if field in data:
                setattr(existing, field, data[field])
        existing.method_source_id = source_id
        existing.is_national_read_only = True
        existing.status = "approved"
        return
    db.add(
        Drill(
            scope="federation",
            is_national_read_only=True,
            method_source_id=source_id,
            status="approved",
            **data,
        )
    )


def _seed_national_drills(db: Session, source_id: int) -> None:
    for data in NATIONAL_DRILLS:
        _upsert_drill(db, source_id, data)


def seed_national_method(db: Session) -> None:
    """Само federation drills — статии/цикли идват от учебника и годишната програма."""
    src = _ensure_drills_source(db)
    _seed_national_drills(db, src.id)
    db.commit()


def ensure_national_drills(db: Session) -> int:
    """Възстановява курираните BG упражнения след purge."""
    if db.query(Drill).filter(Drill.scope == "federation").count() >= 20:
        return 0
    src = _ensure_drills_source(db)
    _seed_national_drills(db, src.id)
    db.flush()
    return db.query(Drill).filter(Drill.scope == "federation").count()
