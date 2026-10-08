"""Тренировъчни групи + картотечни (СЕК) членства за списъци/профили."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    AthleteParentAccessToken,
    BvfCardIndex,
    BvfCardIndexMember,
    TeamMember,
    User,
)
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


_SIGNED_CARD_STATUSES = frozenset({"signed", "pending_bvf_sign", "synced", "ready", "closed"})


def leave_club_locally(
    db: Session,
    athlete: Athlete,
    *,
    by_user: User | None = None,
    note: str | None = None,
) -> dict:
    """Отпис от клуба в платформата. Не пипа СЕК / bvf_player_id. Пази история."""
    now = datetime.utcnow()
    athlete.is_active = False
    athlete.sek_task_code = None
    athlete.sek_task_detail = None
    athlete.sek_task_at = None
    athlete.sek_task_by_user_id = None
    athlete.updated_at = now

    stamp = now.strftime("%d.%m.%Y")
    who = (getattr(by_user, "name", None) or "").strip() or "главен треньор"
    leave_line = f"[Отписан {stamp} · {who}]"
    if note:
        leave_line = f"{leave_line} {note.strip()}"
    prev = (athlete.notes or "").strip()
    if leave_line not in prev:
        athlete.notes = f"{leave_line}\n{prev}".strip() if prev else leave_line

    team_rows = (
        db.query(TeamMember)
        .filter(TeamMember.athlete_id == int(athlete.id), TeamMember.is_active.is_(True))
        .all()
    )
    for row in team_rows:
        row.is_active = False
        if hasattr(row, "left_at"):
            row.left_at = now

    tokens = (
        db.query(AthleteParentAccessToken)
        .filter(
            AthleteParentAccessToken.athlete_id == int(athlete.id),
            AthleteParentAccessToken.is_active.is_(True),
        )
        .all()
    )
    for tok in tokens:
        tok.is_active = False
        tok.expires_at = now

    # Махни от локални състави, които още не са подписани/затворени в СЕК.
    memberships = (
        db.query(BvfCardIndexMember, BvfCardIndex)
        .join(BvfCardIndex, BvfCardIndex.id == BvfCardIndexMember.card_index_id)
        .filter(BvfCardIndexMember.athlete_id == int(athlete.id))
        .all()
    )
    removed_rosters = 0
    for mem, card in memberships:
        status = str(getattr(card, "status", "") or "")
        if bool(getattr(card, "is_signed", False)) or status in _SIGNED_CARD_STATUSES:
            continue
        db.delete(mem)
        removed_rosters += 1

    return {
        "athlete_id": int(athlete.id),
        "is_active": False,
        "teams_deactivated": len(team_rows),
        "parent_tokens_revoked": len(tokens),
        "local_rosters_removed": removed_rosters,
        "bvf_player_id": athlete.bvf_player_id,
        "kept_sek_link": bool(athlete.bvf_player_id),
    }


def restore_club_locally(db: Session, athlete: Athlete) -> dict:
    """Връща отписан състезател в активния клубен списък. Не добавя автоматично към групи."""
    athlete.is_active = True
    athlete.updated_at = datetime.utcnow()
    return {
        "athlete_id": int(athlete.id),
        "is_active": True,
        "bvf_player_id": athlete.bvf_player_id,
        "message": "Възстановен в клуба. Добави го отново към тренировъчна група при нужда.",
    }
