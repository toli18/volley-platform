# backend/app/services/assessment_consent.py
"""Родителско съгласие за Картата за развитие + изграждане на родителския изглед.

Съгласието е маркер (един ред на състезател), записван от треньора. Когато е
дадено, родителят вижда read-only Карта за развитие (Development Score + фокус
области), но без AI генериране и без сурови резултати.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentConsent,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    DevelopmentScore,
)
from app.services.assessment_generator_bridge import find_deficits
from app.services.motivation_service import compute_athlete_motivation


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
    conducted_by_window: dict[int, date] = {}
    if window_ids:
        windows = (
            db.query(AssessmentWindow)
            .filter(AssessmentWindow.id.in_(window_ids))
            .all()
        )
        # Дата на тестиране = conducted_on от сесията, в която има резултат за атлета.
        session_rows = (
            db.query(AssessmentSession.window_id, AssessmentSession.conducted_on)
            .join(AssessmentResult, AssessmentResult.session_id == AssessmentSession.id)
            .filter(
                AssessmentSession.window_id.in_(window_ids),
                AssessmentResult.athlete_id == athlete.id,
                AssessmentSession.conducted_on.isnot(None),
            )
            .all()
        )
        for wid, conducted in session_rows:
            if conducted is None:
                continue
            prev = conducted_by_window.get(wid)
            if prev is None or conducted > prev:
                conducted_by_window[wid] = conducted

        def _window_sort_key(w: AssessmentWindow):
            return (
                conducted_by_window.get(w.id) or w.start_date or date.min,
                w.id,
            )

        windows = sorted(windows, key=_window_sort_key)

    deficits: list[dict] = []
    main_focus = None
    secondary_focus = None
    if windows:
        latest_window = windows[-1]
        deficits = find_deficits(db, athlete.id, latest_window)
        focus_order = [d["domain"] for d in deficits]
        main_focus = focus_order[0] if focus_order else None
        secondary_focus = focus_order[1] if len(focus_order) > 1 else None

    # Позитивен мотивационен слой (рекорди, следваща цел, % връстници, талант).
    # Надстроечен — не докосва официалните оценки. None при липса на данни.
    motivation = compute_athlete_motivation(db, athlete.id)

    return {
        "consent_granted": True,
        "athlete_name": athlete.athlete_name,
        "scores": scores,
        "windows": [
            {
                "id": w.id,
                "season": w.season,
                "phase": getattr(w.phase, "value", w.phase),
                "label": w.label,
                "start_date": w.start_date,
                "end_date": w.end_date,
                "conducted_on": conducted_by_window.get(w.id),
            }
            for w in windows
        ],
        "deficits": deficits,
        "main_focus": main_focus,
        "secondary_focus": secondary_focus,
        "motivation": motivation,
    }
