"""Тренировъчни групи + картотечни (СЕК) членства за списъци/профили."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import BvfCardIndex, BvfCardIndexMember
from app.services.bvf_season_carding import card_index_display_label


def carded_team_badges_by_athlete(db: Session, athlete_ids: list[int]) -> dict[int, list[dict]]:
    """Връща {athlete_id: [{label, year, age_group, sex_label}, ...]} за текущи членства."""
    ids = [int(x) for x in athlete_ids if x]
    if not ids:
        return {}
    rows = (
        db.query(BvfCardIndexMember.athlete_id, BvfCardIndex)
        .join(BvfCardIndex, BvfCardIndex.id == BvfCardIndexMember.card_index_id)
        .filter(BvfCardIndexMember.athlete_id.in_(ids))
        .order_by(BvfCardIndex.year.desc(), BvfCardIndex.age.asc())
        .all()
    )
    out: dict[int, list[dict]] = {}
    for athlete_id, ci in rows:
        if not ci:
            continue
        label = card_index_display_label(ci)
        age_lbl = (ci.age_group or "").strip() or label.split(" · ")[0]
        sex_lbl = "Жени" if int(ci.sex or 0) == 1 else "Мъже"
        out.setdefault(int(athlete_id), []).append(
            {
                "label": label,
                "year": int(ci.year) if ci.year is not None else None,
                "age_group": age_lbl,
                "sex_label": sex_lbl,
            }
        )
    return out


def athlete_display_has_photo(athlete, *, cached: bool) -> bool:
    """Свързан със СЕК → считаме, че има портрет (локално често не четем /api/files)."""
    if cached:
        return True
    if getattr(athlete, "bvf_player_id", None):
        return True
    if getattr(athlete, "bvf_photo_id", None):
        return True
    return False
