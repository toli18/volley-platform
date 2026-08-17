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

# СЕК SeasonApplication.AgeGroup (0–13) → (локален age, sex 0=М/1=Ж, етикет).
# Редът следва UI-то на db.bvf.bg: момичета/момчета по възрастови ленти, после жени/мъже.
SEK_SEASON_AGE_GROUP_MAP: dict[int, tuple[int, int, str]] = {
    0: (12, 1, "Детски"),
    1: (12, 0, "Детски"),
    2: (13, 1, "Мини"),
    3: (13, 0, "Мини"),
    4: (14, 1, "Под 14"),
    5: (14, 0, "Под 14"),
    6: (16, 1, "Под 16"),
    7: (16, 0, "Под 16"),
    8: (18, 1, "Под 18"),
    9: (18, 0, "Под 18"),
    10: (20, 1, "Под 20"),
    11: (20, 0, "Под 20"),
    12: (99, 1, "Жени"),
    13: (99, 0, "Мъже"),
}

SEK_LEAGUE_LABELS: dict[int, str] = {
    0: "",
    1: "Висша лига",
    2: "А НВГ",
}


def age_group_label(age: int) -> str:
    return AGE_GROUP_LABELS.get(int(age), f"До {age}")


def map_sek_season_age_group(age_group: int) -> tuple[int, int, str] | None:
    """Връща (age, sex, label) или None ако кодът е неизвестен."""
    try:
        key = int(age_group)
    except (TypeError, ValueError):
        return None
    return SEK_SEASON_AGE_GROUP_MAP.get(key)


def sek_entry_age_group_label(age_group: int, league: int | None = None) -> str:
    mapped = map_sek_season_age_group(age_group)
    base = mapped[2] if mapped else f"Група {age_group}"
    league_lbl = SEK_LEAGUE_LABELS.get(int(league or 0), "")
    if league_lbl and int(age_group) >= 12:
        return f"{base} · {league_lbl}"
    return base


def card_index_display_label(ci) -> str:
    age_lbl = (getattr(ci, "age_group", None) or "").strip() or age_group_label(int(ci.age))
    sex_lbl = "Жени" if int(getattr(ci, "sex", 0) or 0) == 1 else "Мъже"
    return f"{age_lbl} · {sex_lbl} · {ci.year}"


def looks_like_form_03(doc_type: int | None, description: str | None) -> bool:
    desc = (description or "").lower()
    compact = desc.replace(" ", "").replace("-", "")
    return (
        doc_type == 2
        or "форм" in desc
        or "03а" in compact
        or "03a" in compact
        or "03b" in compact
        or "форма03" in compact
        or "форма0" in compact
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
    """Истинска подписана Форма 03/03-А за сезона, или реален документ в БФВ.
    В СЕК за сезона без наша/федерална форма не се брои — формата трябва вече да е изпратена и подписана.
    """
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
    by = athlete_birth_year(athlete)
    nat = natural_age_code(by, int(season_year)) if by else None
    return {
        "id": athlete.id,
        "athlete_name": athlete.athlete_name,
        "bvf_player_id": athlete.bvf_player_id,
        "bvf_player_number": athlete.bvf_player_number,
        "birth_year": by if by is not None else athlete.birth_year,
        "gender": athlete.gender,
        "has_egn": has_egn,
        "has_photo": has_photo,
        "has_form_03": has_form,
        "natural_age": nat,
        "natural_age_label": age_group_label(nat) if nat is not None else None,
        "eligible_for_roster": bool(athlete.bvf_player_id) and has_form,
    }


def athlete_sex_code(athlete: Athlete) -> int | None:
    g = (getattr(athlete, "gender", None) or "").strip().lower()
    if g in ("female", "f", "ж", "женски"):
        return 1
    if g in ("male", "m", "м", "мъжки"):
        return 0
    return None


# Най-млада → най-възрастна. СЕК: естествена група или една нагоре, без надолу и без прескачане.
AGE_LADDER: tuple[int, ...] = (12, 13, 14, 16, 18, 20, 99)


def athlete_birth_year(athlete: Athlete) -> int | None:
    by = getattr(athlete, "birth_year", None)
    if by:
        try:
            return int(by)
        except (TypeError, ValueError):
            pass
    bd = getattr(athlete, "birth_date", None)
    if bd is not None and getattr(bd, "year", None):
        return int(bd.year)
    egn = "".join(ch for ch in str(getattr(athlete, "egn", None) or "") if ch.isdigit())
    if len(egn) != 10:
        return None
    yy = int(egn[0:2])
    mm = int(egn[2:4])
    if mm > 40:
        return 2000 + yy
    if mm > 20:
        return 1800 + yy
    by = 1900 + yy
    if by < 1950 and yy < 30:
        return 2000 + yy
    return by


def natural_age_code(birth_year: int, season_year: int) -> int:
    """Естествена възрастова група по година на раждане за сезон YEAR (напр. 2026 = 2026/27).

    Кохортите следват БФВ (сезон 2022/23: Детски=2012, Мини=2011, Под 14=2010,
    Под 16=2008/09, Под 18=2006/07) — изместени с (season_year − 2022).
    """
    y = int(season_year)
    by = int(birth_year)
    if by >= y - 10:
        return 12
    if by == y - 11:
        return 13
    if by == y - 12:
        return 14
    if by in (y - 14, y - 13):
        return 16
    if by in (y - 16, y - 15):
        return 18
    if by in (y - 18, y - 17):
        return 20
    return 99


def allowed_age_codes(birth_year: int, season_year: int) -> set[int]:
    nat = natural_age_code(birth_year, season_year)
    idx = AGE_LADDER.index(nat)
    allowed = {nat}
    if idx + 1 < len(AGE_LADDER):
        allowed.add(AGE_LADDER[idx + 1])
    return allowed


def birth_years_for_age_code(season_year: int, age_code: int) -> list[int]:
    """Рождени години, които СЕК допуска в тази група (естествени + една по-млада група)."""
    y = int(season_year)
    code = int(age_code)
    years: list[int] = []
    # Широк, но краен диапазон — филтрираме през allowed_age_codes.
    for by in range(y - 50, y + 1):
        if code in allowed_age_codes(by, y):
            years.append(by)
    return years


def card_index_age_rule_hint(season_year: int, age_code: int) -> str:
    years = birth_years_for_age_code(season_year, age_code)
    label = age_group_label(age_code)
    if int(age_code) >= 99:
        return f"{label}: възрастни + Под 20 (една група нагоре)."
    if not years:
        return f"{label}: няма допустими години на раждане."
    lo, hi = min(years), max(years)
    if lo == hi:
        band = f"родени {lo}"
    else:
        band = f"родени {lo}–{hi}"
    return (
        f"{label} сезон {season_year}: {band}. "
        "СЕК: своята група или една нагоре — без по-големи в по-малка група."
    )


def athlete_fits_card_index_rules(
    athlete: Athlete,
    *,
    season_year: int,
    age: int,
    sex: int,
) -> tuple[bool, str | None]:
    """Локално като СЕК: пол + кохорта по година на раждане (без игра надолу / прескачане)."""
    want_sex = int(sex)
    got_sex = athlete_sex_code(athlete)
    if got_sex is None:
        return False, "липсва пол"
    if got_sex != want_sex:
        return False, "полът не съвпада с отбора"

    age_code = int(age)
    by = athlete_birth_year(athlete)
    if by is None:
        return False, "липсва година на раждане"

    allowed = allowed_age_codes(by, int(season_year))
    if age_code not in allowed:
        nat = natural_age_code(by, int(season_year))
        return False, (
            f"родени {by} са за {age_group_label(nat)}, не за {age_group_label(age_code)} "
            f"(разрешена е само една група нагоре)"
        )
    return True, None


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
