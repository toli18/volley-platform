# backend/app/services/assessment_consent.py
"""Родителско съгласие за Картата за развитие + изграждане на родителския изглед.

Съгласието е маркер (един ред на състезател), записван от треньора. Когато е
дадено, родителят вижда read-only Карта за развитие (Development Score + фокус
области), но без AI генериране и без сурови резултати.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentConsent,
    AssessmentWindow,
    Athlete,
    DevelopmentScore,
)
from app.services.assessment_generator_bridge import find_deficits


def get_consent(db: Session, athlete_id: int) -> Optional[AssessmentConsent]:
    return (
        db.query(AssessmentConsent)
        .filter(AssessmentConsent.athlete_id == athlete_id)
        .first()
    )


def set_consent(
    db: Session,
    athlete_id: int,
    granted: bool,
    *,
    user_id: Optional[int] = None,
    note: Optional[str] = None,
) -> AssessmentConsent:
    """Upsert на съгласието. Записва кой и кога е дал/оттеглил."""
    consent = get_consent(db, athlete_id)
    now = datetime.utcnow()
    if consent is None:
        consent = AssessmentConsent(athlete_id=athlete_id)
        db.add(consent)
    consent.is_granted = bool(granted)
    consent.note = note
    consent.granted_by_user_id = user_id
    if granted:
        consent.granted_at = now
        consent.revoked_at = None
    else:
        consent.revoked_at = now
    db.commit()
    db.refresh(consent)
    return consent


def is_consent_granted(db: Session, athlete_id: int) -> bool:
    consent = get_consent(db, athlete_id)
    return bool(consent and consent.is_granted)


def build_parent_development(db: Session, athlete: Athlete, *, respect_consent: bool = True) -> dict:
    """Сглобява изгледа на Картата за развитие.

    `respect_consent=True` (родителски изглед): при липса на съгласие връща празен
    изглед с `consent_granted=False`. `respect_consent=False` се ползва, когато
    самият състезател гледа своите данни в атлетския портал — съгласието касае
    само видимостта за родител, не и за самия атлет."""
    if respect_consent and not is_consent_granted(db, athlete.id):
        return {"consent_granted": False, "athlete_name": athlete.athlete_name}

    scores = (
        db.query(DevelopmentScore)
        .filter(DevelopmentScore.athlete_id == athlete.id)
        .order_by(DevelopmentScore.window_id.asc())
        .all()
    )
    window_ids = sorted({s.window_id for s in scores})
    windows = []
    if window_ids:
        windows = (
            db.query(AssessmentWindow)
            .filter(AssessmentWindow.id.in_(window_ids))
            .all()
        )

    deficits: list[dict] = []
    main_focus = None
    secondary_focus = None
    if window_ids:
        latest_window = next((w for w in windows if w.id == window_ids[-1]), None)
        if latest_window is not None:
            deficits = find_deficits(db, athlete.id, latest_window)
            focus_order = [d["domain"] for d in deficits]
            main_focus = focus_order[0] if focus_order else None
            secondary_focus = focus_order[1] if len(focus_order) > 1 else None

    return {
        "consent_granted": True,
        "athlete_name": athlete.athlete_name,
        "scores": scores,
        "windows": [
            {"id": w.id, "season": w.season, "phase": getattr(w.phase, "value", w.phase)}
            for w in windows
        ],
        "deficits": deficits,
        "main_focus": main_focus,
        "secondary_focus": secondary_focus,
    }
