"""Локален сезон → назначение треньор → състав (Форма 03) → заявка към главния."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteBvfDocument, BvfCardIndex, User
from app.services.athlete_photo import has_cached_photo

AGE_GROUP_LABELS: dict[int, str] = {
    12: "Детски",
    13: "Мини",
    14: "Под 14",
    16: "Под 16",
    18: "Под 18",
    20: "Под 20",
    99: "Мъже / Жени",
}


def age_group_label(age: int) -> str:
    return AGE_GROUP_LABELS.get(int(age), f"До {age}")


def looks_like_form_03(doc_type: int | None, description: str | None) -> bool:
    desc = (description or "").lower()
    compact = desc.replace(" ", "")
    return (
        doc_type == 2
        or "форм" in desc
        or "03-а" in desc
        or "03-a" in desc
        or "форма 03" in desc
        or "форма03" in compact
    )


def athlete_docs_as_dicts(athlete: Athlete) -> list[dict[str, Any]]:
    return [
        {
            "doc_type": d.doc_type,
            "description": d.description,
            "season_year": d.season_year,
        }
        for d in (athlete.bvf_documents or [])
    ]


def athlete_has_form_03(athlete: Athlete, season_year: int, db: Session | None = None) -> bool:
    """Истинска подписана Форма 03/03-А или реален документ в БФВ (не локален маркер)."""
    if db is not None:
        from app.services.carding_form import athlete_has_signed_carding_form

        if athlete_has_signed_carding_form(db, athlete, int(season_year)):
            return True

    docs = athlete_docs_as_dicts(athlete)
    # Include local metadata rows but exclude local-form03-* markers
    real_docs = []
    for d in athlete.bvf_documents or []:
        bid = str(getattr(d, "bvf_document_id", None) or "")
        if bid.startswith("local-form03-") or bid.startswith("local-"):
            continue
        real_docs.append(
            {
                "doc_type": d.doc_type,
                "description": d.description,
                "season_year": d.season_year,
            }
        )
    season_docs = [
        d
        for d in real_docs
        if d.get("season_year") == season_year or str(season_year) in (d.get("description") or "")
    ]
    pool = season_docs or real_docs
    return any(looks_like_form_03(d.get("doc_type"), d.get("description")) for d in pool)


def eligible_athlete_payload(athlete: Athlete, season_year: int, db: Session | None = None) -> dict[str, Any]:
    has_form = athlete_has_form_03(athlete, season_year, db=db)
    has_egn = bool((athlete.egn or "").strip())
    has_photo = has_cached_photo(athlete.id) or bool(athlete.bvf_photo_id)
    return {
        "id": athlete.id,
        "athlete_name": athlete.athlete_name,
        "bvf_player_id": athlete.bvf_player_id,
        "bvf_player_number": athlete.bvf_player_number,
        "birth_year": athlete.birth_year,
        "gender": athlete.gender,
        "has_egn": has_egn,
        "has_photo": has_photo,
        "has_form_03": has_form,
        "eligible_for_roster": bool(athlete.bvf_player_id) and has_form,
    }


def coach_display_name(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    u = db.query(User).filter(User.id == int(user_id)).first()
    return u.name if u else None


def serialize_card_index_row(db: Session, local: BvfCardIndex) -> dict[str, Any]:
    status = (local.status or "").strip()
    can_delete = (
        local.bvf_card_index_id is None
        and not bool(local.is_signed)
        and status in ("draft", "building")
    )
    return {
        "id": local.id,
        "bvf_card_index_id": local.bvf_card_index_id,
        "year": local.year,
        "age": local.age,
        "age_group": local.age_group or age_group_label(local.age),
        "sex": local.sex,
        "status": local.status,
        "is_signed": bool(local.is_signed),
        "members_count": len(local.members or []),
        "assigned_coach_user_id": local.assigned_coach_user_id,
        "assigned_coach_name": coach_display_name(db, local.assigned_coach_user_id),
        "second_coach_user_id": getattr(local, "second_coach_user_id", None),
        "second_coach_name": coach_display_name(db, getattr(local, "second_coach_user_id", None)),
        "doctor_name": (getattr(local, "doctor_name", None) or "").strip() or None,
        "season_application_id": local.season_application_id,
        "requested_at": local.requested_at.isoformat() if local.requested_at else None,
        "request_note": local.request_note,
        "created_by_user_id": local.created_by_user_id,
        "local_only": local.bvf_card_index_id is None,
        "can_delete": can_delete,
    }


def list_ready_for_head(db: Session, club_id: int, limit: int = 24) -> list[dict[str, Any]]:
    rows = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.club_id == club_id, BvfCardIndex.status == "ready_for_head")
        .order_by(BvfCardIndex.id.desc())
        .limit(limit)
        .all()
    )
    return [serialize_card_index_row(db, r) for r in rows]
