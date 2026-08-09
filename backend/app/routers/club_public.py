"""Публична клубна страница + записване на нови деца (enrollment funnel)."""

from __future__ import annotations

import re
import unicodedata
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Athlete,
    Club,
    ClubCompetitionEvent,
    ClubEnrollmentRequest,
    ClubEnrollmentStatus,
    ClubHall,
    Team,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
    UserRole,
)
from app.services.athlete_identity import compose_athlete_name
from app.services.club_profile_sync import load_club_halls, match_club_hall, serialize_hall

router = APIRouter(prefix="/api", tags=["Club Public & Enrollment"])

_SLUG_RE = re.compile(r"[^a-z0-9]+")
_WEEKDAY_BG = ["Пон", "Вт", "Ср", "Чет", "Пет", "Съб", "Нед"]


def _slugify(text: str, *, fallback: str = "club") -> str:
    raw = unicodedata.normalize("NFKD", (text or "").strip())
    ascii_only = "".join(ch for ch in raw if not unicodedata.combining(ch))
    slug = _SLUG_RE.sub("-", ascii_only.lower()).strip("-")
    return (slug or fallback)[:80]


def _club_for_coach(db: Session, user: User) -> Club:
    if not user.club_id:
        raise HTTPException(status_code=400, detail="Нямате клуб")
    club = db.query(Club).filter(Club.id == int(user.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    return club


def _is_head(user: User) -> bool:
    return user.role in {
        UserRole.club_head_coach,
        UserRole.platform_admin,
        UserRole.federation_admin,
    }


def _public_club_or_404(db: Session, slug: str) -> Club:
    key = (slug or "").strip().lower()
    if not key:
        raise HTTPException(status_code=404, detail="Страницата не е намерена")
    club = (
        db.query(Club)
        .filter(
            Club.public_slug == key,
            Club.public_page_enabled.is_(True),
            Club.is_active.is_(True),
        )
        .first()
    )
    if not club:
        raise HTTPException(status_code=404, detail="Публичната страница не е активна")
    return club


def _logo_url(club: Club) -> str | None:
    # Prefer public CDN when we have SEK logo id — works on the public page without API host.
    logo_id = (getattr(club, "bvf_logo_id", None) or "").strip()
    if logo_id:
        return f"https://cdn.bgvolley.dev/club-logos/{logo_id}"
    url = (club.logo_url or "").strip()
    if url:
        return url
    bvf_id = getattr(club, "bvf_club_id", None)
    if bvf_id:
        return f"/static/club-logos/{int(bvf_id)}.png"
    return None


def _digits(phone: str | None) -> str:
    return "".join(ch for ch in str(phone or "") if ch.isdigit())


def _contact_name_for_club(club: Club, coaches: list) -> str | None:
    name = (getattr(club, "contact_name", None) or "").strip()
    if name:
        return name
    want = _digits(club.contact_phone)
    if len(want) < 8:
        return None
    for u in coaches:
        phone = u.phone if bool(getattr(u, "phone_visible_to_parents", True)) else None
        got = _digits(phone)
        if got and (got == want or got.endswith(want[-8:]) or want.endswith(got[-8:])):
            return (u.name or "").strip() or None
    return None


def _normalize_facebook_url(raw: str | None) -> str | None:
    url = (raw or "").strip()
    if not url:
        return None
    if not url.startswith("http"):
        url = f"https://{url}"
    low = url.lower()
    if "facebook.com" not in low and "fb.com" not in low:
        raise HTTPException(status_code=422, detail="Невалиден Facebook линк")
    return url[:500]


def _enrich_slot_location(slot: dict[str, Any], halls: list[ClubHall]) -> dict[str, Any]:
    hall = match_club_hall(slot.get("location"), halls)
    slot["location_address"] = (hall.address if hall else None) or None
    slot["location_maps_url"] = (hall.google_maps_url if hall else None) or None
    if hall and hall.name and not slot.get("location"):
        slot["location"] = hall.name
    return slot


def _upcoming_trainings_for_team(
    db: Session,
    *,
    club_id: int,
    team_id: int,
    limit: int = 5,
    horizon_days: int = 45,
    halls: list[ClubHall] | None = None,
) -> list[dict[str, Any]]:
    """Следващите N реални тренировки за група (правила + изключения)."""
    today = date.today()
    d0 = today
    d1 = today + timedelta(days=max(7, int(horizon_days)))
    rules = (
        db.query(TrainingScheduleRule)
        .filter(
            TrainingScheduleRule.club_id == int(club_id),
            TrainingScheduleRule.team_id == int(team_id),
            TrainingScheduleRule.is_active.is_(True),
            TrainingScheduleRule.effective_from <= d1.isoformat(),
        )
        .filter(
            (TrainingScheduleRule.effective_to.is_(None))
            | (TrainingScheduleRule.effective_to >= d0.isoformat())
        )
        .all()
    )
    if not rules:
        return []

    rule_ids = [int(r.id) for r in rules]
    exc_rows = (
        db.query(TrainingScheduleException)
        .filter(
            TrainingScheduleException.rule_id.in_(rule_ids),
            TrainingScheduleException.date >= d0.isoformat(),
            TrainingScheduleException.date <= d1.isoformat(),
        )
        .all()
    )
    exc_by_key = {(int(e.rule_id), e.date): e for e in exc_rows}
    team_row = db.query(Team).filter(Team.id == int(team_id)).first()
    team_name = team_row.name if team_row else None
    team_label = (
        _public_team_hint(
            getattr(team_row, "age_group", None) if team_row else None,
            getattr(team_row, "gender", None) if team_row else None,
            None,
        )
        if team_row
        else None
    ) or team_name
    now_hm = datetime.now().strftime("%H:%M")
    hall_rows = halls if halls is not None else load_club_halls(db, club_id, active_only=True)
    out: list[dict[str, Any]] = []
    days = (d1 - d0).days
    for day_idx in range(days + 1):
        cur = d0 + timedelta(days=day_idx)
        weekday = cur.weekday()
        cur_s = cur.isoformat()
        for r in rules:
            if int(r.weekday) != int(weekday):
                continue
            if r.effective_from > cur_s:
                continue
            if r.effective_to and r.effective_to < cur_s:
                continue
            exc = exc_by_key.get((int(r.id), cur_s))
            if exc and exc.kind == "cancelled":
                continue
            start_v = (
                exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
            )
            end_v = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time
            loc_v = None
            if exc and exc.kind == "override" and (exc.location or "").strip():
                loc_v = (exc.location or "").strip()
            else:
                loc_v = (r.location or "").strip() or None
            if cur_s == today.isoformat() and (start_v or "") < now_hm:
                continue
            out.append(
                _enrich_slot_location(
                    {
                        "date": cur_s,
                        "weekday": weekday,
                        "weekday_label": _WEEKDAY_BG[weekday] if 0 <= weekday < 7 else str(weekday),
                        "start_time": start_v,
                        "end_time": end_v,
                        "location": loc_v,
                        "team_id": int(team_id),
                        "team_name": team_name,
                        "team_label": team_label,
                        "rule_id": int(r.id),
                        "slot_key": f"{cur_s}|{start_v}|{int(r.id)}",
                    },
                    hall_rows,
                )
            )
    out.sort(key=lambda x: (x["date"], x["start_time"] or ""))
    return out[: max(1, min(int(limit), 10))]


def _gender_label(g: str | None) -> str | None:
    key = (g or "").strip().lower()
    if key == "female":
        return "Момичета"
    if key == "male":
        return "Момчета"
    return None


def _public_team_hint(age_group: str | None, gender: str | None, season: str | None) -> str | None:
    """Подзаглавие за родители: пол + колона „Група“ (години), без сезон."""
    bits: list[str] = []
    gl = _gender_label(gender)
    if gl:
        bits.append(gl)
    raw = (age_group or "").strip()
    if raw:
        bits.append(raw)
    return " · ".join(bits) if bits else None


def _serialize_enrollment(row: ClubEnrollmentRequest, db: Session) -> dict[str, Any]:
    pref = None
    if row.preferred_team_id:
        pref = db.query(Team.name).filter(Team.id == int(row.preferred_team_id)).scalar()
    acc = None
    if row.accepted_team_id:
        acc = db.query(Team.name).filter(Team.id == int(row.accepted_team_id)).scalar()
    athlete_path = f"/coach/athletes/{int(row.athlete_id)}" if row.athlete_id else None
    return {
        "id": int(row.id),
        "club_id": int(row.club_id),
        "child_first_name": row.child_first_name,
        "child_last_name": row.child_last_name,
        "child_birth_year": int(row.child_birth_year),
        "child_gender": row.child_gender,
        "parent_name": row.parent_name,
        "parent_phone": row.parent_phone,
        "parent_email": row.parent_email,
        "preferred_team_id": int(row.preferred_team_id) if row.preferred_team_id else None,
        "preferred_team_name": pref,
        "note": row.note,
        "status": str(row.status or ClubEnrollmentStatus.new.value),
        "trial_date": row.trial_date,
        "trial_time": row.trial_time,
        "trial_location": row.trial_location,
        "trial_notes": row.trial_notes,
        "accepted_team_id": int(row.accepted_team_id) if row.accepted_team_id else None,
        "accepted_team_name": acc,
        "athlete_id": int(row.athlete_id) if row.athlete_id else None,
        "athlete_profile_path": athlete_path,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "handled_at": row.handled_at.isoformat() if row.handled_at else None,
    }


def _build_public_page(db: Session, club: Club) -> dict[str, Any]:
    all_teams = (
        db.query(Team)
        .filter(Team.club_id == int(club.id), Team.is_active.is_(True))
        .order_by(Team.name.asc())
        .all()
    )
    enroll_teams = [t for t in all_teams if bool(getattr(t, "public_enrollment_open", False))]
    coaches = (
        db.query(User)
        .filter(
            User.club_id == int(club.id),
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )
    enroll_ids = {int(t.id) for t in enroll_teams}
    rules = (
        db.query(TrainingScheduleRule)
        .filter(
            TrainingScheduleRule.club_id == int(club.id),
            TrainingScheduleRule.is_active.is_(True),
        )
        .order_by(TrainingScheduleRule.weekday.asc(), TrainingScheduleRule.start_time.asc())
        .all()
    )
    if enroll_ids:
        rules = [r for r in rules if int(r.team_id) in enroll_ids]
    team_names = {int(t.id): t.name for t in all_teams}
    today = date.today().isoformat()
    to = (date.today() + timedelta(days=60)).isoformat()
    comps = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.club_id == int(club.id),
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.date >= today,
            ClubCompetitionEvent.date <= to,
        )
        .order_by(ClubCompetitionEvent.date.asc(), ClubCompetitionEvent.start_time.asc())
        .limit(30)
        .all()
    )

    hours = []
    for r in rules:
        wd = int(r.weekday or 0)
        hours.append(
            {
                "weekday": wd,
                "weekday_label": _WEEKDAY_BG[wd] if 0 <= wd < 7 else str(wd),
                "start_time": r.start_time,
                "end_time": r.end_time,
                "team_id": int(r.team_id),
                "team_name": team_names.get(int(r.team_id)),
            }
        )

    fb = (getattr(club, "facebook_page_url", None) or "").strip() or None
    halls = load_club_halls(db, club.id, active_only=True)

    return {
        "slug": club.public_slug,
        "name": club.name,
        "full_name": club.full_name,
        "tagline": club.public_tagline,
        "about": club.public_about,
        "city": club.city,
        "address": club.address,
        "contact_email": club.contact_email,
        "contact_phone": club.contact_phone,
        "contact_name": _contact_name_for_club(club, coaches),
        "website_url": club.website_url,
        "facebook_page_url": fb,
        "logo_url": _logo_url(club),
        "bvf_region": club.bvf_region,
        "bulstat": club.bulstat,
        "license_number": club.license_number,
        "halls": [serialize_hall(h) for h in halls],
        "teams": [
            {
                "id": int(t.id),
                "name": t.name,
                "hint": _public_team_hint(t.age_group, t.gender, t.season),
                "gender_label": _gender_label(t.gender),
            }
            for t in enroll_teams
        ],
        "coaches": [
            {
                "id": int(u.id),
                "name": u.name,
                "role": u.role.value if hasattr(u.role, "value") else str(u.role),
                "role_label": "Треньор",
                "phone": u.phone if bool(getattr(u, "phone_visible_to_parents", True)) else None,
            }
            for u in coaches
        ],
        "training_hours": hours,
        "tournaments": [
            {
                "id": int(c.id),
                "date": c.date,
                "start_time": c.start_time,
                "end_time": c.end_time,
                "location": c.location,
                "competition_kind": c.competition_kind,
                "team_name": team_names.get(int(c.team_id)),
            }
            for c in comps
        ],
        "enrollment_open": bool(enroll_teams),
    }


# ---------- Public ----------


@router.get("/public/clubs/{slug}")
def get_public_club_page(slug: str, db: Session = Depends(get_db)):
    club = _public_club_or_404(db, slug)
    return _build_public_page(db, club)


@router.get("/public/clubs/{slug}/teams/{team_id}/upcoming-trainings")
def get_public_upcoming_trainings(
    slug: str,
    team_id: int,
    limit: int = Query(default=5, ge=1, le=10),
    db: Session = Depends(get_db),
):
    club = _public_club_or_404(db, slug)
    team = (
        db.query(Team)
        .filter(Team.id == int(team_id), Team.club_id == int(club.id))
        .first()
    )
    if not team or not bool(team.is_active) or not bool(getattr(team, "public_enrollment_open", False)):
        raise HTTPException(status_code=404, detail="Групата не приема публични записвания")
    items = _upcoming_trainings_for_team(
        db, club_id=int(club.id), team_id=int(team.id), limit=int(limit)
    )
    return {"team_id": int(team.id), "team_name": team.name, "items": items}


class PublicEnrollmentCreate(BaseModel):
    child_first_name: str = Field(..., min_length=1, max_length=80)
    child_last_name: str | None = Field(None, max_length=80)
    child_birth_year: int = Field(..., ge=1990, le=2035)
    child_gender: str | None = Field(None, max_length=16)
    parent_name: str = Field(..., min_length=2, max_length=255)
    parent_phone: str = Field(..., min_length=6, max_length=50)
    parent_email: str | None = Field(None, max_length=255)
    preferred_team_id: int = Field(..., ge=1)
    trial_date: str = Field(..., min_length=10, max_length=10)
    trial_time: str = Field(..., min_length=4, max_length=5)
    trial_rule_id: int | None = None
    note: str | None = Field(None, max_length=2000)
    website: str | None = Field(None, max_length=200)  # honeypot


@router.post("/public/clubs/{slug}/enroll")
def create_public_enrollment(slug: str, payload: PublicEnrollmentCreate, db: Session = Depends(get_db)):
    if payload.website:
        raise HTTPException(status_code=400, detail="Invalid submission")
    club = _public_club_or_404(db, slug)

    first = payload.child_first_name.strip()
    last = (payload.child_last_name or "").strip() or None
    parent_name = payload.parent_name.strip()
    parent_phone = payload.parent_phone.strip()
    gender = (payload.child_gender or "").strip().lower() or None
    if gender and gender not in {"male", "female"}:
        raise HTTPException(status_code=422, detail="Невалиден пол")

    team = (
        db.query(Team)
        .filter(Team.id == int(payload.preferred_team_id), Team.club_id == int(club.id))
        .first()
    )
    if not team or not bool(team.is_active) or not bool(getattr(team, "public_enrollment_open", False)):
        raise HTTPException(status_code=422, detail="Тази група не приема записвания за пробна")

    trial_date = payload.trial_date.strip()
    trial_time = payload.trial_time.strip()
    upcoming = _upcoming_trainings_for_team(
        db, club_id=int(club.id), team_id=int(team.id), limit=10
    )
    match = next(
        (
            s
            for s in upcoming
            if s["date"] == trial_date and s["start_time"] == trial_time
        ),
        None,
    )
    if not match:
        raise HTTPException(
            status_code=422,
            detail="Избраната тренировка вече не е налична. Избери друга от списъка.",
        )

    row = ClubEnrollmentRequest(
        club_id=int(club.id),
        child_first_name=first,
        child_last_name=last,
        child_birth_year=int(payload.child_birth_year),
        child_gender=gender,
        parent_name=parent_name,
        parent_phone=parent_phone,
        parent_email=(payload.parent_email or "").strip() or None,
        preferred_team_id=int(team.id),
        note=(payload.note or "").strip() or None,
        status=ClubEnrollmentStatus.trial_scheduled.value,
        trial_date=trial_date,
        trial_time=trial_time,
        trial_location=(match.get("location") or None),
        trial_notes=f"Избрана от родител · правило #{match.get('rule_id')}",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "id": int(row.id),
        "message": (
            f"Записахте пробна тренировка на {trial_date} в {trial_time} "
            f"({team.name}). Треньорът е уведомен."
        ),
        "trial_date": trial_date,
        "trial_time": trial_time,
        "team_name": team.name,
    }


# ---------- Coach ----------


class ClubPublicSettingsUpdate(BaseModel):
    public_page_enabled: bool | None = None
    public_slug: str | None = Field(None, max_length=80)
    public_tagline: str | None = Field(None, max_length=255)
    public_about: str | None = None
    facebook_page_url: str | None = Field(None, max_length=500)
    enrollment_team_ids: list[int] | None = None


def _club_teams_enrollment_payload(db: Session, club: Club) -> list[dict[str, Any]]:
    rows = (
        db.query(Team)
        .filter(Team.club_id == int(club.id))
        .order_by(Team.is_active.desc(), Team.name.asc())
        .all()
    )
    return [
        {
            "id": int(t.id),
            "name": t.name,
            "age_group": t.age_group,
            "gender": t.gender,
            "gender_label": _gender_label(t.gender),
            "season": t.season,
            "is_active": bool(t.is_active),
            "public_enrollment_open": bool(getattr(t, "public_enrollment_open", False)),
        }
        for t in rows
    ]


@router.get("/club/public-page")
def get_club_public_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club = _club_for_coach(db, current_user)
    slug = club.public_slug
    return {
        "public_page_enabled": bool(club.public_page_enabled),
        "public_slug": slug,
        "public_tagline": club.public_tagline,
        "public_about": club.public_about,
        "facebook_page_url": getattr(club, "facebook_page_url", None),
        "public_url_path": f"/c/{slug}" if slug and club.public_page_enabled else None,
        "can_edit": _is_head(current_user),
        "teams": _club_teams_enrollment_payload(db, club),
    }


@router.put("/club/public-page")
def update_club_public_settings(
    payload: ClubPublicSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.club_head_coach, UserRole.platform_admin)),
):
    club = _club_for_coach(db, current_user)
    if payload.public_page_enabled is not None:
        club.public_page_enabled = bool(payload.public_page_enabled)
    if payload.public_tagline is not None:
        club.public_tagline = (payload.public_tagline or "").strip() or None
    if payload.public_about is not None:
        club.public_about = (payload.public_about or "").strip() or None
    if payload.facebook_page_url is not None:
        club.facebook_page_url = _normalize_facebook_url(payload.facebook_page_url)

    if payload.public_slug is not None or (club.public_page_enabled and not club.public_slug):
        desired = (payload.public_slug if payload.public_slug is not None else club.public_slug) or club.name
        base = _slugify(desired, fallback=f"club-{club.id}")
        slug = base
        n = 2
        while True:
            clash = (
                db.query(Club)
                .filter(Club.public_slug == slug, Club.id != int(club.id))
                .first()
            )
            if not clash:
                break
            slug = f"{base}-{n}"[:80]
            n += 1
        club.public_slug = slug

    if club.public_page_enabled and not club.public_slug:
        club.public_slug = _slugify(club.name, fallback=f"club-{club.id}")

    if payload.enrollment_team_ids is not None:
        wanted = {int(x) for x in payload.enrollment_team_ids}
        club_teams = db.query(Team).filter(Team.club_id == int(club.id)).all()
        for t in club_teams:
            t.public_enrollment_open = int(t.id) in wanted and bool(t.is_active)

    db.commit()
    db.refresh(club)
    return {
        "public_page_enabled": bool(club.public_page_enabled),
        "public_slug": club.public_slug,
        "public_tagline": club.public_tagline,
        "public_about": club.public_about,
        "facebook_page_url": getattr(club, "facebook_page_url", None),
        "public_url_path": f"/c/{club.public_slug}" if club.public_slug and club.public_page_enabled else None,
        "teams": _club_teams_enrollment_payload(db, club),
    }


@router.get("/club/enrollments")
def list_enrollments(
    status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club = _club_for_coach(db, current_user)
    q = db.query(ClubEnrollmentRequest).filter(ClubEnrollmentRequest.club_id == int(club.id))
    if status:
        q = q.filter(ClubEnrollmentRequest.status == status.strip().lower())
    rows = q.order_by(ClubEnrollmentRequest.created_at.desc()).limit(200).all()
    return {
        "items": [_serialize_enrollment(r, db) for r in rows],
        "counts": {
            "new": db.query(ClubEnrollmentRequest)
            .filter(
                ClubEnrollmentRequest.club_id == int(club.id),
                ClubEnrollmentRequest.status == ClubEnrollmentStatus.new.value,
            )
            .count(),
            "trial_scheduled": db.query(ClubEnrollmentRequest)
            .filter(
                ClubEnrollmentRequest.club_id == int(club.id),
                ClubEnrollmentRequest.status == ClubEnrollmentStatus.trial_scheduled.value,
            )
            .count(),
        },
    }


class EnrollmentTrialUpdate(BaseModel):
    trial_date: str = Field(..., min_length=10, max_length=10)
    trial_time: str | None = Field(None, max_length=5)
    trial_location: str | None = Field(None, max_length=255)
    trial_notes: str | None = Field(None, max_length=2000)


@router.post("/club/enrollments/{enrollment_id}/schedule-trial")
def schedule_enrollment_trial(
    enrollment_id: int,
    payload: EnrollmentTrialUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club = _club_for_coach(db, current_user)
    row = (
        db.query(ClubEnrollmentRequest)
        .filter(
            ClubEnrollmentRequest.id == int(enrollment_id),
            ClubEnrollmentRequest.club_id == int(club.id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Заявката не е намерена")
    if str(row.status) in {ClubEnrollmentStatus.accepted.value, ClubEnrollmentStatus.declined.value}:
        raise HTTPException(status_code=422, detail="Заявката вече е приключена")

    row.trial_date = payload.trial_date.strip()
    row.trial_time = (payload.trial_time or "").strip() or None
    row.trial_location = (payload.trial_location or "").strip() or None
    row.trial_notes = (payload.trial_notes or "").strip() or None
    row.status = ClubEnrollmentStatus.trial_scheduled.value
    row.handled_by_user_id = int(current_user.id)
    db.commit()
    db.refresh(row)
    return _serialize_enrollment(row, db)


class EnrollmentAcceptIn(BaseModel):
    team_id: int
    child_gender: str | None = None


@router.post("/club/enrollments/{enrollment_id}/accept")
def accept_enrollment(
    enrollment_id: int,
    payload: EnrollmentAcceptIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    from app.routers.fees import _attach_athlete_to_team

    club = _club_for_coach(db, current_user)
    row = (
        db.query(ClubEnrollmentRequest)
        .filter(
            ClubEnrollmentRequest.id == int(enrollment_id),
            ClubEnrollmentRequest.club_id == int(club.id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Заявката не е намерена")
    if str(row.status) == ClubEnrollmentStatus.accepted.value and row.athlete_id:
        return _serialize_enrollment(row, db)
    if str(row.status) == ClubEnrollmentStatus.declined.value:
        raise HTTPException(status_code=422, detail="Заявката е отказана")

    team = db.query(Team).filter(Team.id == int(payload.team_id), Team.club_id == int(club.id)).first()
    if not team:
        raise HTTPException(status_code=422, detail="Невалидна тренировъчна група")

    gender = (payload.child_gender or row.child_gender or team.gender or "").strip().lower() or None
    if gender not in {"male", "female"}:
        raise HTTPException(status_code=422, detail="Избери пол на детето")

    first = row.child_first_name.strip()
    last = (row.child_last_name or "").strip()
    full_name = compose_athlete_name(first, "", last) or first

    athlete = Athlete(
        coach_id=int(current_user.id),
        club_id=int(club.id),
        athlete_name=full_name,
        first_name=first,
        last_name=last or None,
        parent_name=row.parent_name,
        parent_phone=row.parent_phone,
        birth_year=int(row.child_birth_year),
        birth_date=date(int(row.child_birth_year), 1, 1),
        gender=gender,
        notes=(row.note or None),
        is_active=True,
    )
    db.add(athlete)
    db.flush()
    _attach_athlete_to_team(db, athlete, int(team.id), current_user)

    row.status = ClubEnrollmentStatus.accepted.value
    row.accepted_team_id = int(team.id)
    row.athlete_id = int(athlete.id)
    row.handled_by_user_id = int(current_user.id)
    row.handled_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return {
        **_serialize_enrollment(row, db),
        "message": (
            "Детето е прието като активен състезател. "
            "Сподели родителския вход от профила на състезателя (линк / телефон + година)."
        ),
    }


@router.post("/club/enrollments/{enrollment_id}/decline")
def decline_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    club = _club_for_coach(db, current_user)
    row = (
        db.query(ClubEnrollmentRequest)
        .filter(
            ClubEnrollmentRequest.id == int(enrollment_id),
            ClubEnrollmentRequest.club_id == int(club.id),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Заявката не е намерена")
    if str(row.status) == ClubEnrollmentStatus.accepted.value:
        raise HTTPException(status_code=422, detail="Приета заявка не може да се откаже")
    row.status = ClubEnrollmentStatus.declined.value
    row.handled_by_user_id = int(current_user.id)
    row.handled_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _serialize_enrollment(row, db)
