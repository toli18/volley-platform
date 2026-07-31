"""Картотечни физически показатели от тестовата батерия.

БФВ developments приема само Height / Weight / FullExtent / Attack / Block.
Те се взимат от последните assessment резултати — без ръчно преписване.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import AthletePhysicalMeasurement
from app.models_assessment import AssessmentResult, AssessmentSession

# Локално поле → код от батерията.
BVF_FIELD_TEST_CODES: dict[str, str] = {
    "height_cm": "ANTH_HEIGHT",
    "weight_kg": "ANTH_WEIGHT",
    "full_extent_cm": "ANTH_REACH",  # разтег / размах → FullExtent
    "attack_cm": "PHYS_JUMP_APPROACH",
    "block_cm": "PHYS_JUMP_2ARM",
}

FIELD_LABELS_BG: dict[str, str] = {
    "height_cm": "Височина",
    "weight_kg": "Тегло",
    "full_extent_cm": "Размах / разтег",
    "attack_cm": "Атака",
    "block_cm": "Блок",
}

SOURCE_NOTES_PREFIX = "from_tests"


def _round_cm(raw: Any) -> Optional[int]:
    if raw is None:
        return None
    try:
        return int(round(float(raw)))
    except (TypeError, ValueError):
        return None


def latest_bvf_fields_from_tests(db: Session, athlete_id: int) -> dict[str, Any]:
    """Последни стойности за БФВ полетата + метаданни за UI."""
    codes = list(BVF_FIELD_TEST_CODES.values())
    rows = (
        db.query(
            AssessmentResult.test_code,
            AssessmentResult.raw_value,
            AssessmentSession.conducted_on,
            AssessmentResult.id,
            AssessmentResult.session_id,
        )
        .join(AssessmentSession, AssessmentSession.id == AssessmentResult.session_id)
        .filter(
            AssessmentResult.athlete_id == int(athlete_id),
            AssessmentResult.test_code.in_(codes),
            AssessmentResult.raw_value.isnot(None),
        )
        .order_by(
            AssessmentResult.test_code.asc(),
            AssessmentSession.conducted_on.desc(),
            AssessmentResult.id.desc(),
        )
        .all()
    )

    by_code: dict[str, dict[str, Any]] = {}
    for test_code, raw_value, conducted_on, _rid, session_id in rows:
        if test_code in by_code:
            continue
        by_code[test_code] = {
            "raw_value": raw_value,
            "conducted_on": conducted_on,
            "session_id": session_id,
        }

    fields: dict[str, Optional[int]] = {}
    sources: dict[str, Any] = {}
    measured_dates: list[date] = []

    for field, code in BVF_FIELD_TEST_CODES.items():
        hit = by_code.get(code)
        value = _round_cm(hit["raw_value"]) if hit else None
        fields[field] = value
        sources[field] = {
            "test_code": code,
            "label": FIELD_LABELS_BG[field],
            "value": value,
            "session_id": hit["session_id"] if hit else None,
            "conducted_on": hit["conducted_on"].isoformat() if hit and hit["conducted_on"] else None,
            "available": value is not None,
        }
        if hit and hit["conducted_on"]:
            measured_dates.append(hit["conducted_on"])

    measured_at = max(measured_dates) if measured_dates else date.today()
    has_any = any(v is not None for v in fields.values())

    return {
        "athlete_id": int(athlete_id),
        "has_data": has_any,
        "measured_at": measured_at.isoformat(),
        "fields": fields,
        "sources": sources,
        "mapping": [
            {
                "field": field,
                "test_code": code,
                "label": FIELD_LABELS_BG[field],
                "value": fields[field],
            }
            for field, code in BVF_FIELD_TEST_CODES.items()
        ],
    }


def values_tuple(fields: dict[str, Optional[int]]) -> tuple:
    return tuple(fields.get(k) for k in ("height_cm", "weight_kg", "full_extent_cm", "attack_cm", "block_cm"))


def find_matching_synced(
    db: Session, athlete_id: int, fields: dict[str, Optional[int]]
) -> Optional[AthletePhysicalMeasurement]:
    target = values_tuple(fields)
    rows = (
        db.query(AthletePhysicalMeasurement)
        .filter(
            AthletePhysicalMeasurement.athlete_id == int(athlete_id),
            AthletePhysicalMeasurement.bvf_development_id.isnot(None),
        )
        .order_by(AthletePhysicalMeasurement.measured_at.desc())
        .limit(20)
        .all()
    )
    for row in rows:
        current = (row.height_cm, row.weight_kg, row.full_extent_cm, row.attack_cm, row.block_cm)
        if current == target:
            return row
    return None


def upsert_pending_from_tests(
    db: Session,
    athlete_id: int,
    *,
    session_id: Optional[int] = None,
    user_id: Optional[int] = None,
) -> Optional[AthletePhysicalMeasurement]:
    """Създава/обновява локален pending запис от последните тестове."""
    payload = latest_bvf_fields_from_tests(db, athlete_id)
    if not payload["has_data"]:
        return None

    fields = payload["fields"]
    measured = datetime.strptime(payload["measured_at"], "%Y-%m-%d")
    notes = f"{SOURCE_NOTES_PREFIX}:session:{session_id}" if session_id else SOURCE_NOTES_PREFIX

    pending = (
        db.query(AthletePhysicalMeasurement)
        .filter(
            AthletePhysicalMeasurement.athlete_id == int(athlete_id),
            AthletePhysicalMeasurement.bvf_development_id.is_(None),
            AthletePhysicalMeasurement.notes == notes,
        )
        .order_by(AthletePhysicalMeasurement.id.desc())
        .first()
    )
    if pending is None:
        # Един общ pending без session tag — обновяваме него.
        pending = (
            db.query(AthletePhysicalMeasurement)
            .filter(
                AthletePhysicalMeasurement.athlete_id == int(athlete_id),
                AthletePhysicalMeasurement.bvf_development_id.is_(None),
                AthletePhysicalMeasurement.notes.like(f"{SOURCE_NOTES_PREFIX}%"),
            )
            .order_by(AthletePhysicalMeasurement.id.desc())
            .first()
        )

    if pending is None:
        pending = AthletePhysicalMeasurement(
            athlete_id=int(athlete_id),
            measured_at=measured,
            created_by_user_id=user_id,
            notes=notes,
        )
        db.add(pending)

    pending.measured_at = measured
    pending.height_cm = fields["height_cm"]
    pending.weight_kg = fields["weight_kg"]
    pending.full_extent_cm = fields["full_extent_cm"]
    pending.attack_cm = fields["attack_cm"]
    pending.block_cm = fields["block_cm"]
    pending.notes = notes
    return pending
