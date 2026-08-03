"""SEK / BVF athlete readiness — missing fields, board status, coach tasks."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from app.models import Athlete
from app.services.athlete_photo import has_cached_photo

# Codes stored on Athlete.sek_task_code
TASK_NEED_PHOTO = "need_photo"
TASK_NEED_DATA = "need_data"


def bvf_missing_fields(athlete: Athlete) -> list[str]:
    missing: list[str] = []
    if not (getattr(athlete, "first_name", None) or "").strip():
        missing.append("собствено име")
    if not (getattr(athlete, "middle_name", None) or "").strip():
        missing.append("бащино име")
    if not (getattr(athlete, "last_name", None) or "").strip():
        missing.append("фамилия")
    if not getattr(athlete, "birth_date", None):
        missing.append("дата на раждане")
    if not (getattr(athlete, "place_of_birth", None) or "").strip():
        missing.append("град")
    if not (getattr(athlete, "nationality", None) or "").strip():
        missing.append("националност")
    if not getattr(athlete, "gender", None):
        missing.append("пол")
    if not (getattr(athlete, "egn", None) or "").strip():
        missing.append("ЕГН")
    if not has_cached_photo(athlete.id) and not (getattr(athlete, "bvf_photo_id", None) or "").strip():
        missing.append("снимка")
    return missing


def bvf_ready_for_create(athlete: Athlete) -> bool:
    """Ready for POST /api/players except photo (uploaded at create time)."""
    if getattr(athlete, "bvf_player_id", None):
        return True
    critical = [m for m in bvf_missing_fields(athlete) if m != "снимка"]
    return len(critical) == 0


def has_local_photo(athlete: Athlete) -> bool:
    return has_cached_photo(athlete.id) or bool((getattr(athlete, "bvf_photo_id", None) or "").strip())


def compute_sek_board_row(athlete: Athlete, *, coach_name: str | None = None) -> dict[str, Any]:
    in_sek = bool(getattr(athlete, "bvf_player_id", None))
    missing = bvf_missing_fields(athlete)
    missing_no_photo = [m for m in missing if m != "снимка"]
    has_egn = len((getattr(athlete, "egn", None) or "").strip()) == 10
    photo_ok = has_local_photo(athlete)

    if in_sek:
        readiness = "in_sek"
    elif not missing_no_photo and photo_ok:
        readiness = "ready_create"
    elif not missing_no_photo and not photo_ok:
        readiness = "ready_create_need_photo"
    elif has_egn and missing_no_photo:
        readiness = "can_link_need_data"
    elif has_egn:
        readiness = "can_link"
    else:
        readiness = "need_data"

    # Link is always attempted first when EGN present and not in SEK
    can_link = (not in_sek) and has_egn
    can_create = (not in_sek) and not missing_no_photo and photo_ok

    task_code = (getattr(athlete, "sek_task_code", None) or "").strip() or None
    return {
        "athlete_id": athlete.id,
        "athlete_name": athlete.athlete_name,
        "first_name": athlete.first_name,
        "middle_name": athlete.middle_name,
        "last_name": athlete.last_name,
        "egn": athlete.egn,
        "birth_year": athlete.birth_year,
        "gender": athlete.gender,
        "coach_id": athlete.coach_id,
        "coach_name": coach_name,
        "in_sek": in_sek,
        "bvf_player_id": athlete.bvf_player_id,
        "bvf_player_number": athlete.bvf_player_number,
        "has_photo": photo_ok,
        "missing": missing,
        "readiness": readiness,
        "can_link": can_link,
        "can_create": can_create,
        "sek_task_code": task_code,
        "sek_task_detail": getattr(athlete, "sek_task_detail", None),
        "sek_task_at": getattr(athlete, "sek_task_at", None),
    }


def set_sek_task(
    athlete: Athlete,
    *,
    code: str,
    detail: str,
    by_user_id: Optional[int],
) -> None:
    athlete.sek_task_code = code
    athlete.sek_task_detail = (detail or "").strip() or None
    athlete.sek_task_at = datetime.utcnow()
    athlete.sek_task_by_user_id = by_user_id


def clear_sek_task(athlete: Athlete) -> None:
    athlete.sek_task_code = None
    athlete.sek_task_detail = None
    athlete.sek_task_at = None
    athlete.sek_task_by_user_id = None


def maybe_clear_sek_task_after_photo(athlete: Athlete) -> bool:
    """Clear need_photo task when a local photo exists; return True if cleared."""
    if (getattr(athlete, "sek_task_code", None) or "") != TASK_NEED_PHOTO:
        return False
    if not has_cached_photo(athlete.id):
        return False
    clear_sek_task(athlete)
    return True


def list_sek_tasks_for_coach(db, coach_user_id: int, *, limit: int = 24) -> list[dict[str, Any]]:
    """Open SEK photo/data tasks for athletes owned by this coach."""
    from app.models import Athlete

    rows = (
        db.query(Athlete)
        .filter(
            Athlete.coach_id == int(coach_user_id),
            Athlete.is_active.is_(True),
            Athlete.sek_task_code.isnot(None),
            Athlete.bvf_player_id.is_(None),
        )
        .order_by(Athlete.sek_task_at.desc(), Athlete.athlete_name.asc())
        .limit(limit)
        .all()
    )
    out: list[dict[str, Any]] = []
    for a in rows:
        code = (a.sek_task_code or "").strip()
        if not code:
            continue
        out.append(
            {
                "athlete_id": a.id,
                "athlete_name": a.athlete_name,
                "sek_task_code": code,
                "sek_task_detail": a.sek_task_detail,
                "sek_task_at": a.sek_task_at.isoformat() if a.sek_task_at else None,
            }
        )
    return out


def build_task_from_missing(athlete: Athlete) -> tuple[str, str]:
    missing = bvf_missing_fields(athlete)
    if "снимка" in missing and len([m for m in missing if m != "снимка"]) == 0:
        return TASK_NEED_PHOTO, "Липсва портретна снимка за създаване в СЕК."
    if "снимка" in missing:
        rest = [m for m in missing if m != "снимка"]
        return (
            TASK_NEED_PHOTO,
            f"Липсва снимка и още: {', '.join(rest)}. Качи снимка и попълни данните.",
        )
    if missing:
        return TASK_NEED_DATA, f"Липсват данни за СЕК: {', '.join(missing)}."
    return TASK_NEED_PHOTO, "Нужна е портретна снимка преди създаване в СЕК."
