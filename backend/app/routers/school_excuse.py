"""Извинителни бележки — настройки на клуб + родителски портал."""

from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.competition_kinds import competition_kind_label
from app.database import get_db
from app.dependencies.parent_auth import get_current_parent_athlete
from app.dependencies.roles import require_role
from app.models import (
    Athlete,
    Club,
    ClubCompetitionEvent,
    CompetitionRosterAthlete,
    User,
    UserRole,
)
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club
from app.services.email_send import send_email_with_attachment, smtp_configured
from app.services.school_excuse_note import (
    DEFAULT_BODY_TEMPLATE,
    athlete_school_missing,
    backfill_school_excuse_assets_to_db,
    build_school_excuse_pdf,
    club_school_excuse_enabled,
    extract_event_city,
    format_date_bg,
    is_weekend_date,
    resolve_school_excuse_template,
    save_school_excuse_signature_png,
    save_school_excuse_stamp_file,
)


def _club_with_persisted_assets(db: Session, club: Club) -> Club:
    if backfill_school_excuse_assets_to_db(club):
        db.commit()
        db.refresh(club)
    return club


def _resolve_parent_token_athlete(db: Session, token: str) -> Athlete:
    from app.routers.parent_portal import _resolve_parent_portal_athlete

    return _resolve_parent_portal_athlete(db, token)

club_router = APIRouter(prefix="/api/club", tags=["Club — School Excuse"])
parent_router = APIRouter(prefix="/api", tags=["Parent Portal — School Excuse"])


class SchoolExcuseSettingsOut(BaseModel):
    club_id: int
    club_name: str
    enabled: bool = False
    chairman_name: Optional[str] = None
    body_template: str
    has_signature: bool = False
    has_stamp: bool = False
    smtp_configured: bool = False
    defaults: dict = Field(default_factory=dict)


class SchoolExcuseSettingsUpdate(BaseModel):
    club_id: Optional[int] = None
    enabled: Optional[bool] = None
    chairman_name: Optional[str] = Field(None, max_length=255)
    body_template: Optional[str] = None
    reset_to_defaults: bool = False


class SchoolExcuseSignatureIn(BaseModel):
    signature_image: str = Field(..., min_length=32)


class ParentSchoolInfoUpdate(BaseModel):
    school_name: str = Field(..., min_length=2, max_length=255)
    school_class: str = Field(..., min_length=1, max_length=32)
    school_city: Optional[str] = Field(None, max_length=120)
    school_email: Optional[str] = Field(None, max_length=255)


class ParentSchoolExcuseNoteItem(BaseModel):
    competition_id: int
    date: str
    period_from: str
    period_to: str
    event_label: str
    location: str
    event_city: str
    can_download: bool = False
    missing_fields: list[str] = Field(default_factory=list)
    weekend_hint: bool = False


class ParentSchoolExcuseListOut(BaseModel):
    enabled: bool = False
    school_name: Optional[str] = None
    school_class: Optional[str] = None
    school_city: Optional[str] = None
    school_email: Optional[str] = None
    smtp_configured: bool = False
    items: list[ParentSchoolExcuseNoteItem] = Field(default_factory=list)


class ParentSchoolExcuseSendIn(BaseModel):
    school_email: EmailStr


def _settings_out(club: Club) -> SchoolExcuseSettingsOut:
    resolved = resolve_school_excuse_template(club)
    return SchoolExcuseSettingsOut(
        club_id=club.id,
        club_name=club.name,
        enabled=resolved["enabled"],
        chairman_name=resolved["chairman_name"] or None,
        body_template=resolved["body_template"],
        has_signature=resolved["has_signature"],
        has_stamp=resolved["has_stamp"],
        smtp_configured=smtp_configured(),
        defaults={"body": DEFAULT_BODY_TEMPLATE},
    )


@club_router.get("/school-excuse-settings", response_model=SchoolExcuseSettingsOut)
def get_school_excuse_settings(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_with_persisted_assets(db, _club_for_user(db, current_user, club_id))
    return _settings_out(club)


@club_router.put("/school-excuse-settings", response_model=SchoolExcuseSettingsOut)
def update_school_excuse_settings(
    payload: SchoolExcuseSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    if payload.reset_to_defaults:
        club.school_excuse_body = None
    else:
        if payload.enabled is not None:
            club.school_excuse_enabled = bool(payload.enabled)
        if payload.chairman_name is not None:
            club.school_excuse_chairman_name = payload.chairman_name.strip() or None
        if payload.body_template is not None:
            club.school_excuse_body = payload.body_template.strip() or None

    db.commit()
    db.refresh(club)
    return _settings_out(club)


@club_router.put("/school-excuse-settings/signature", response_model=SchoolExcuseSettingsOut)
def save_school_excuse_signature(
    payload: SchoolExcuseSignatureIn,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    try:
        rel, blob = save_school_excuse_signature_png(club.id, payload.signature_image)
        club.school_excuse_signature_rel = rel
        club.school_excuse_signature_data = blob
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    db.refresh(club)
    return _settings_out(club)


@club_router.post("/school-excuse-settings/stamp", response_model=SchoolExcuseSettingsOut)
async def upload_school_excuse_stamp(
    file: UploadFile = File(...),
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    content = await file.read()
    if len(content) < 100:
        raise HTTPException(status_code=422, detail="Файлът е твърде малък.")
    if len(content) > 5_000_000:
        raise HTTPException(status_code=422, detail="Файлът е твърде голям (макс. 5 MB).")
    club.school_excuse_stamp_rel = save_school_excuse_stamp_file(club.id, content, file.filename or "stamp.png")
    club.school_excuse_stamp_data = content
    db.commit()
    db.refresh(club)
    return _settings_out(club)


@club_router.get("/school-excuse-settings/preview.pdf")
def preview_school_excuse_pdf(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_with_persisted_assets(db, _club_for_user(db, current_user, club_id))
    sample_athlete = Athlete(
        athlete_name="Иван Петров Иванов",
        school_name='СУ "Пример"',
        school_class="7а",
        school_city="гр. Троян",
    )
    sample_comp = ClubCompetitionEvent(
        date="2026-06-02",
        location="гр. Плевен",
        competition_kind="tournament",
        opponent_name="—",
        notes="предквалификационни турнири от националния календар на БФВ",
    )
    pdf = build_school_excuse_pdf(athlete=sample_athlete, comp=sample_comp, club=club)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'inline; filename="izvinitelna-belejka-preview.pdf"'},
    )


def _get_club_for_athlete(db: Session, athlete: Athlete) -> Club | None:
    if not athlete.club_id:
        return None
    return db.query(Club).filter(Club.id == int(athlete.club_id)).first()


def _competition_for_athlete(
    db: Session, athlete: Athlete, competition_id: int
) -> ClubCompetitionEvent:
    club = _get_club_for_athlete(db, athlete)
    if not club or not club_school_excuse_enabled(club):
        raise HTTPException(status_code=404, detail="Извинителните бележки не са активирани от клуба.")

    comp = (
        db.query(ClubCompetitionEvent)
        .filter(
            ClubCompetitionEvent.id == int(competition_id),
            ClubCompetitionEvent.club_id == int(club.id),
            ClubCompetitionEvent.is_cancelled.is_(False),
        )
        .first()
    )
    if not comp:
        raise HTTPException(status_code=404, detail="Състезанието не е намерено.")

    roster = (
        db.query(CompetitionRosterAthlete)
        .filter(
            CompetitionRosterAthlete.competition_id == comp.id,
            CompetitionRosterAthlete.athlete_id == athlete.id,
        )
        .first()
    )
    if not roster:
        raise HTTPException(status_code=403, detail="Състезателят не е в пътуващия състав.")
    status = str(comp.roster_status or "pending").strip().lower()
    if status not in {"confirmed", "locked"}:
        raise HTTPException(status_code=403, detail="Съставът още не е потвърден от треньора.")

    missing = athlete_school_missing(athlete)
    if missing:
        raise HTTPException(
            status_code=422,
            detail="Попълнете училище и клас в профила на детето преди да генерирате бележка.",
        )
    if not (club.school_excuse_chairman_name or "").strip():
        raise HTTPException(status_code=422, detail="Клубът още не е настроил председателя за бележките.")

    return comp


def _list_school_excuse_items(db: Session, athlete: Athlete) -> ParentSchoolExcuseListOut:
    club = _get_club_for_athlete(db, athlete)
    enabled = club_school_excuse_enabled(club)
    out = ParentSchoolExcuseListOut(
        enabled=enabled,
        school_name=(athlete.school_name or "").strip() or None,
        school_class=(athlete.school_class or "").strip() or None,
        school_city=(athlete.school_city or "").strip() or None,
        school_email=(athlete.school_email or "").strip() or None,
        smtp_configured=smtp_configured(),
    )
    if not enabled or not club:
        return out

    rows = (
        db.query(ClubCompetitionEvent, CompetitionRosterAthlete)
        .join(CompetitionRosterAthlete, CompetitionRosterAthlete.competition_id == ClubCompetitionEvent.id)
        .filter(
            CompetitionRosterAthlete.athlete_id == athlete.id,
            ClubCompetitionEvent.club_id == club.id,
            ClubCompetitionEvent.is_cancelled.is_(False),
            ClubCompetitionEvent.roster_status.in_(["confirmed", "locked"]),
        )
        .order_by(ClubCompetitionEvent.date.desc())
        .all()
    )

    missing = athlete_school_missing(athlete)
    club_ready = bool((club.school_excuse_chairman_name or "").strip())
    for comp, _roster in rows:
        kind = competition_kind_label(comp.competition_kind)
        opp = (comp.opponent_name or "").strip()
        label = f"{kind}" + (f" · {opp}" if opp else "")
        out.items.append(
            ParentSchoolExcuseNoteItem(
                competition_id=comp.id,
                date=comp.date,
                period_from=comp.date,
                period_to=comp.date,
                event_label=label,
                location=comp.location or "",
                event_city=extract_event_city(comp, club),
                can_download=not missing and club_ready,
                missing_fields=missing if missing else ([] if club_ready else ["club_config"]),
                weekend_hint=is_weekend_date(comp.date),
            )
        )
    return out


@parent_router.get("/parent-portal/me/school-excuse-notes", response_model=ParentSchoolExcuseListOut)
def parent_list_school_excuse_me(
    athlete: Athlete = Depends(get_current_parent_athlete),
    db: Session = Depends(get_db),
):
    return _list_school_excuse_items(db, athlete)


@parent_router.get("/parent-portal/{token}/school-excuse-notes", response_model=ParentSchoolExcuseListOut)
def parent_list_school_excuse_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_token_athlete(db, token)
    return _list_school_excuse_items(db, athlete)


@parent_router.patch("/parent-portal/me/school-info")
def parent_update_school_info_me(
    body: ParentSchoolInfoUpdate,
    athlete: Athlete = Depends(get_current_parent_athlete),
    db: Session = Depends(get_db),
):
    athlete.school_name = body.school_name.strip()
    athlete.school_class = body.school_class.strip()
    athlete.school_city = (body.school_city or "").strip() or None
    athlete.school_email = (body.school_email or "").strip() or None
    db.commit()
    return {"ok": True}


@parent_router.patch("/parent-portal/{token}/school-info")
def parent_update_school_info_token(token: str, body: ParentSchoolInfoUpdate, db: Session = Depends(get_db)):
    athlete = _resolve_parent_token_athlete(db, token)
    athlete.school_name = body.school_name.strip()
    athlete.school_class = body.school_class.strip()
    athlete.school_city = (body.school_city or "").strip() or None
    athlete.school_email = (body.school_email or "").strip() or None
    db.commit()
    return {"ok": True}


def _pdf_filename(athlete: Athlete, comp: ClubCompetitionEvent) -> str:
    safe_name = re.sub(r"[^\w\-]+", "_", (athlete.athlete_name or "belejka"), flags=re.UNICODE).strip("_")
    return f"izvinitelna_{safe_name}_{comp.date}.pdf"


def _generate_pdf_response(db: Session, athlete: Athlete, competition_id: int) -> Response:
    try:
        comp = _competition_for_athlete(db, athlete, competition_id)
        club = _get_club_for_athlete(db, athlete)
        if club:
            club = _club_with_persisted_assets(db, club)
        if not club:
            raise HTTPException(status_code=404, detail="Клубът не е намерен.")
        pdf = build_school_excuse_pdf(athlete=athlete, comp=comp, club=club)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(
            "school_excuse_pdf_failed athlete_id=%s competition_id=%s",
            getattr(athlete, "id", None),
            competition_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Грешка при генериране на PDF. Опитайте отново или свържете се с клуба.",
        ) from exc
    fname = _pdf_filename(athlete, comp)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@parent_router.get("/parent-portal/me/school-excuse-notes/{competition_id}/pdf")
def parent_download_school_excuse_me(
    competition_id: int,
    athlete: Athlete = Depends(get_current_parent_athlete),
    db: Session = Depends(get_db),
):
    return _generate_pdf_response(db, athlete, competition_id)


@parent_router.get("/parent-portal/{token}/school-excuse-notes/{competition_id}/pdf")
def parent_download_school_excuse_token(competition_id: int, token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_token_athlete(db, token)
    return _generate_pdf_response(db, athlete, competition_id)


def _send_school_excuse_email(
    db: Session, athlete: Athlete, competition_id: int, school_email: str
) -> dict:
    comp = _competition_for_athlete(db, athlete, competition_id)
    club = _get_club_for_athlete(db, athlete)
    if club:
        club = _club_with_persisted_assets(db, club)
    pdf = build_school_excuse_pdf(athlete=athlete, comp=comp, club=club)
    fname = _pdf_filename(athlete, comp)
    subject = f"Молба за извинение — {(athlete.athlete_name or '').strip()} — {format_date_bg(comp.date)}"
    text = (
        f"Здравейте,\n\n"
        f"Изпращаме молба за извинение на отсъствие на ученик/ученичка "
        f"{(athlete.athlete_name or '').strip()} ({(athlete.school_class or '').strip()} клас) "
        f"поради участие в спортно състезание на {format_date_bg(comp.date)}.\n\n"
        f"С уважение,\n{(club.name if club else '')}\n"
    )
    try:
        send_email_with_attachment(
            to_email=school_email,
            subject=subject,
            body_text=text,
            attachment_bytes=pdf,
            attachment_filename=fname,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Неуспешно изпращане на имейл.") from exc
    if not (athlete.school_email or "").strip():
        athlete.school_email = school_email
        db.commit()
    return {"ok": True}


@parent_router.post("/parent-portal/me/school-excuse-notes/{competition_id}/send-email")
def parent_send_school_excuse_me(
    competition_id: int,
    body: ParentSchoolExcuseSendIn,
    athlete: Athlete = Depends(get_current_parent_athlete),
    db: Session = Depends(get_db),
):
    return _send_school_excuse_email(db, athlete, competition_id, str(body.school_email))


@parent_router.post("/parent-portal/{token}/school-excuse-notes/{competition_id}/send-email")
def parent_send_school_excuse_token(
    competition_id: int,
    token: str,
    body: ParentSchoolExcuseSendIn,
    db: Session = Depends(get_db),
):
    athlete = _resolve_parent_token_athlete(db, token)
    return _send_school_excuse_email(db, athlete, competition_id, str(body.school_email))
