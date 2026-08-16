"""Клубен състезателен номер (№ екип) — не е СЕК номер."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Athlete


def normalize_jersey_number(raw) -> int | None:
    if raw is None or raw == "":
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Състезателният номер трябва да е цяло число 0–99") from exc
    if n < 0 or n > 99:
        raise HTTPException(status_code=422, detail="Състезателният номер трябва да е между 0 и 99")
    return n


def assert_jersey_unique_in_club(
    db: Session,
    *,
    club_id: int | None,
    gender: str | None,
    jersey_number: int | None,
    exclude_athlete_id: int | None = None,
) -> None:
    """Уникалност в рамките на клуб + пол. Без пол / без клуб — само валидация на диапазона."""
    if jersey_number is None:
        return
    if not club_id:
        return
    g = (gender or "").strip().lower() or None
    if not g:
        raise HTTPException(
            status_code=422,
            detail="Задай пол преди състезателен номер (уникалността е по пол в клуба).",
        )
    q = db.query(Athlete).filter(
        Athlete.club_id == int(club_id),
        Athlete.gender == g,
        Athlete.jersey_number == int(jersey_number),
        Athlete.is_active.is_(True),
    )
    if exclude_athlete_id:
        q = q.filter(Athlete.id != int(exclude_athlete_id))
    other = q.first()
    if other:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Номер {jersey_number} вече е зает от {other.athlete_name} "
                f"({'мъже' if g == 'male' else 'жени'} в клуба)."
            ),
        )


def allocate_jerseys_for_athletes(athletes: list[Athlete]) -> list[tuple[Athlete, int]]:
    """Prefill: профилен номер ако е свободен; иначе следващ свободен 1…99."""
    used: set[int] = set()
    planned: list[tuple[Athlete, int | None]] = []
    for a in athletes:
        j = getattr(a, "jersey_number", None)
        if j is not None and 0 <= int(j) <= 99 and int(j) not in used:
            used.add(int(j))
            planned.append((a, int(j)))
        else:
            planned.append((a, None))
    next_j = 1
    out: list[tuple[Athlete, int]] = []
    for a, j in planned:
        if j is not None:
            out.append((a, j))
            continue
        while next_j in used and next_j < 100:
            next_j += 1
        if next_j >= 100:
            raise HTTPException(status_code=422, detail="Няма свободен номер 0–99 за състава")
        used.add(next_j)
        out.append((a, next_j))
        next_j += 1
    return out
