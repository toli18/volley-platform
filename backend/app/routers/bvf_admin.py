"""BVF Administration — link club + selective player import from federation JSON."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, Club, User, UserRole

router = APIRouter(prefix="/api/bvf-admin", tags=["BVF Admin"])


def _ensure_head_with_club(user: User) -> None:
    if user.role not in (UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin):
        raise HTTPException(status_code=403, detail="Само главен треньор / админ")
    if user.role == UserRole.club_head_coach and not user.club_id:
        raise HTTPException(status_code=422, detail="Главният треньор няма назначен клуб")


def _club_for_user(db: Session, user: User, club_id: int | None = None) -> Club:
    target_id = club_id or user.club_id
    if not target_id:
        raise HTTPException(status_code=422, detail="Няма клуб")
    if user.role == UserRole.club_head_coach and int(user.club_id) != int(target_id):
        raise HTTPException(status_code=403, detail="Нямаш достъп до този клуб")
    club = db.query(Club).filter(Club.id == int(target_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    return club


def _parse_birth_date(raw: Any) -> date | None:
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            return None


def _sex_to_gender(sex: Any) -> str | None:
    if sex is None:
        return None
    try:
        n = int(sex)
    except Exception:
        return None
    if n == 0:
        return "male"
    if n == 1:
        return "female"
    return None


def _display_name(row: dict) -> str:
    parts = [
        str(row.get("firstName") or "").strip(),
        str(row.get("middleName") or "").strip(),
        str(row.get("lastName") or "").strip(),
    ]
    return " ".join(p for p in parts if p) or f"Състезател #{row.get('id') or '?'}"


class LinkClubIn(BaseModel):
    bvf_club_id: int = Field(..., ge=1)
    bvf_club_name: Optional[str] = None
    club_id: Optional[int] = None


class BvfPlayerIn(BaseModel):
    id: int
    number: Optional[int] = None
    firstName: Optional[str] = None
    middleName: Optional[str] = None
    lastName: Optional[str] = None
    egn: Optional[str] = None
    birthDate: Optional[str] = None
    birthYear: Optional[int] = None
    sex: Optional[int] = None
    nationality: Optional[str] = None
    city: Optional[dict] = None
    currentClubId: Optional[int] = None
    currentCoachId: Optional[int] = None
    currentCoach: Optional[dict] = None
    photoId: Optional[str] = None
    isDeleted: Optional[bool] = None


class PreviewPlayersIn(BaseModel):
    players: list[dict] = Field(default_factory=list)
    club_id: Optional[int] = None


class ImportPlayersIn(BaseModel):
    players: list[dict] = Field(default_factory=list)
    club_id: Optional[int] = None
    # Ако липсва, импортът отива към текущия главен треньор
    assign_coach_id: Optional[int] = None


@router.get("/status")
def bvf_admin_status(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    linked_count = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None))
        .count()
    )
    return {
        "club_id": club.id,
        "club_name": club.name,
        "bvf_club_id": club.bvf_club_id,
        "bvf_club_name": club.bvf_club_name,
        "bvf_linked_at": club.bvf_linked_at.isoformat() if club.bvf_linked_at else None,
        "linked_athletes": linked_count,
    }


@router.put("/link-club")
def link_club(
    payload: LinkClubIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    other = (
        db.query(Club)
        .filter(Club.bvf_club_id == int(payload.bvf_club_id), Club.id != club.id)
        .first()
    )
    if other:
        raise HTTPException(
            status_code=409,
            detail=f"БФВ клуб {payload.bvf_club_id} вече е свързан с „{other.name}“",
        )

    club.bvf_club_id = int(payload.bvf_club_id)
    name = (payload.bvf_club_name or "").strip() or None
    if name:
        club.bvf_club_name = name
    club.bvf_linked_at = datetime.utcnow()
    db.commit()
    db.refresh(club)
    return {
        "club_id": club.id,
        "club_name": club.name,
        "bvf_club_id": club.bvf_club_id,
        "bvf_club_name": club.bvf_club_name,
        "bvf_linked_at": club.bvf_linked_at.isoformat() if club.bvf_linked_at else None,
    }


@router.delete("/link-club")
def unlink_club(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    club.bvf_club_id = None
    club.bvf_club_name = None
    club.bvf_linked_at = None
    db.commit()
    return {"ok": True, "club_id": club.id}


@router.post("/players/preview")
def preview_players(
    payload: PreviewPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Сравнява качен БФВ JSON списък с вече импортираните спортисти."""
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    existing = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None))
        .all()
    )
    by_bvf = {int(a.bvf_player_id): a for a in existing if a.bvf_player_id}
    by_egn = {
        str(a.egn).strip(): a
        for a in db.query(Athlete).filter(Athlete.club_id == club.id, Athlete.egn.isnot(None)).all()
        if a.egn
    }

    rows = []
    for raw in payload.players or []:
        if not isinstance(raw, dict):
            continue
        pid = raw.get("id")
        try:
            pid_i = int(pid)
        except Exception:
            continue
        egn = str(raw.get("egn") or "").strip() or None
        linked = by_bvf.get(pid_i)
        egn_hit = by_egn.get(egn) if egn else None
        status = "new"
        platform_athlete_id = None
        if linked:
            status = "linked"
            platform_athlete_id = linked.id
        elif egn_hit:
            status = "egn_match"
            platform_athlete_id = egn_hit.id

        coach = raw.get("currentCoach") if isinstance(raw.get("currentCoach"), dict) else {}
        city = raw.get("city") if isinstance(raw.get("city"), dict) else {}
        rows.append(
            {
                "bvf_player_id": pid_i,
                "bvf_player_number": raw.get("number"),
                "name": _display_name(raw),
                "firstName": raw.get("firstName"),
                "middleName": raw.get("middleName"),
                "lastName": raw.get("lastName"),
                "birthYear": raw.get("birthYear"),
                "birthDate": (str(raw.get("birthDate") or "")[:10] or None),
                "sex": raw.get("sex"),
                "gender": _sex_to_gender(raw.get("sex")),
                "has_egn": bool(egn),
                "currentCoach": coach.get("name"),
                "city": city.get("name"),
                "isDeleted": bool(raw.get("isDeleted")),
                "status": status,
                "platform_athlete_id": platform_athlete_id,
            }
        )

    rows.sort(key=lambda r: (r.get("birthYear") or 0, r.get("name") or ""))
    return {
        "club_id": club.id,
        "bvf_club_id": club.bvf_club_id,
        "total": len(rows),
        "already_linked": sum(1 for r in rows if r["status"] == "linked"),
        "egn_matches": sum(1 for r in rows if r["status"] == "egn_match"),
        "new": sum(1 for r in rows if r["status"] == "new"),
        "players": rows,
    }


@router.post("/players/import")
def import_players(
    payload: ImportPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Импортира само избраните БФВ състезатели (не целия регистър)."""
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Първо свържи клуба с БФВ (bvf_club_id)")

    assign_coach_id = payload.assign_coach_id or current_user.id
    coach = db.query(User).filter(User.id == int(assign_coach_id)).first()
    if not coach or (coach.club_id and int(coach.club_id) != int(club.id)):
        # platform admin may assign any coach in club; head coach defaults to self
        if current_user.role == UserRole.club_head_coach:
            assign_coach_id = current_user.id
        elif not coach:
            raise HTTPException(status_code=422, detail="Невалиден треньор за assign")

    created = 0
    linked = 0
    skipped = 0
    errors: list[str] = []

    for raw in payload.players or []:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        try:
            pid = int(raw.get("id"))
        except Exception:
            skipped += 1
            continue

        name = _display_name(raw)
        egn = str(raw.get("egn") or "").strip() or None
        birth_date = _parse_birth_date(raw.get("birthDate"))
        birth_year = raw.get("birthYear")
        try:
            birth_year = int(birth_year) if birth_year is not None else (birth_date.year if birth_date else None)
        except Exception:
            birth_year = birth_date.year if birth_date else None
        gender = _sex_to_gender(raw.get("sex"))
        number = raw.get("number")
        try:
            number_i = int(number) if number is not None else None
        except Exception:
            number_i = None

        existing = db.query(Athlete).filter(Athlete.bvf_player_id == pid).first()
        if existing:
            # sync light fields
            existing.athlete_name = name
            if egn:
                existing.egn = egn
            if birth_date:
                existing.birth_date = birth_date
            if birth_year:
                existing.birth_year = birth_year
            if gender:
                existing.gender = gender
            if number_i:
                existing.bvf_player_number = number_i
            existing.bvf_synced_at = datetime.utcnow()
            if existing.club_id is None:
                existing.club_id = club.id
            linked += 1
            continue

        if egn:
            by_egn = (
                db.query(Athlete)
                .filter(Athlete.club_id == club.id, Athlete.egn == egn)
                .first()
            )
            if by_egn:
                by_egn.bvf_player_id = pid
                by_egn.bvf_player_number = number_i
                by_egn.athlete_name = name or by_egn.athlete_name
                if birth_date:
                    by_egn.birth_date = birth_date
                if birth_year:
                    by_egn.birth_year = birth_year
                if gender:
                    by_egn.gender = gender
                by_egn.bvf_synced_at = datetime.utcnow()
                linked += 1
                continue

        athlete = Athlete(
            coach_id=int(assign_coach_id),
            club_id=club.id,
            athlete_name=name,
            birth_date=birth_date,
            birth_year=birth_year,
            place_of_birth=(raw.get("city") or {}).get("name")
            if isinstance(raw.get("city"), dict)
            else None,
            gender=gender,
            egn=egn,
            bvf_player_id=pid,
            bvf_player_number=number_i,
            bvf_synced_at=datetime.utcnow(),
            is_active=True,
            notes="Импортиран от БФВ картотека",
        )
        db.add(athlete)
        created += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Неуспешен запис: {exc}") from exc

    return {
        "created": created,
        "linked": linked,
        "skipped": skipped,
        "errors": errors,
        "club_id": club.id,
    }
