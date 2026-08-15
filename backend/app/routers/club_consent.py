"""Club membership consent config (head coach) + athlete documents."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, AthleteCardingForm, AthleteClubConsent, Club, User, UserRole
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club
from app.services.carding_form import (
    athlete_needs_adult_carding_form,
    carding_form_to_document_dict,
    create_signed_carding_form_03b,
    form_kind_for_athlete,
    open_carding_season_year,
    prefill_carding_form,
    read_carding_form_pdf,
    season_label,
)
from app.services.club_membership_consent import (
    DEFAULT_BODY_TEMPLATE,
    DEFAULT_FEE_AMOUNT,
    DEFAULT_FEE_CURRENCY,
    DEFAULT_FEE_DUE_DAY,
    DEFAULT_GDPR_TEMPLATE,
    consent_to_document_dict,
    default_addressee,
    get_active_consent,
    read_consent_pdf,
    resolve_club_consent_template,
)

router = APIRouter(prefix="/api/bvf-admin", tags=["BVF Admin — Consent"])


class MembershipConsentTemplateOut(BaseModel):
    club_id: int
    club_name: str
    enabled: bool = False
    fee_amount: int
    fee_due_day: int
    fee_currency: str = "€"
    club_logo_url: Optional[str] = None
    bvf_logo_url: Optional[str] = None
    addressee: str
    body_text: str
    gdpr_text: str
    addressee_template: Optional[str] = None
    body_template: Optional[str] = None
    gdpr_template: Optional[str] = None
    defaults: dict = Field(default_factory=dict)


class MembershipConsentTemplateUpdate(BaseModel):
    club_id: Optional[int] = None
    enabled: Optional[bool] = None
    addressee_template: Optional[str] = None
    body_template: Optional[str] = None
    gdpr_template: Optional[str] = None
    fee_amount: Optional[int] = Field(None, ge=0, le=10000)
    fee_due_day: Optional[int] = Field(None, ge=1, le=28)
    reset_to_defaults: bool = False


class RevokeConsentIn(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


class AdultCardingSignIn(BaseModel):
    city: Optional[str] = Field(None, max_length=120)
    rules_accepted: bool = False
    signature_athlete_image: str = Field(..., min_length=32)
    athlete_full_name: Optional[str] = Field(None, max_length=255)
    athlete_egn: Optional[str] = Field(None, max_length=16)


def _athlete_for_coach(db: Session, athlete_id: int, user: User) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == int(athlete_id)).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Състезателят не е намерен")
    if user.role == UserRole.coach:
        if int(athlete.coach_id) != int(user.id):
            raise HTTPException(status_code=403, detail="Нямаш достъп до този състезател")
    elif user.role == UserRole.club_head_coach:
        if not user.club_id or int(athlete.club_id or 0) != int(user.club_id):
            raise HTTPException(status_code=403, detail="Нямаш достъп до този състезател")
    return athlete


@router.get("/membership-consent-template", response_model=MembershipConsentTemplateOut)
def get_membership_consent_template(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    resolved = resolve_club_consent_template(club)
    return MembershipConsentTemplateOut(
        **resolved,
        defaults={
            "addressee": default_addressee("{club_name}"),
            "body": DEFAULT_BODY_TEMPLATE,
            "gdpr": DEFAULT_GDPR_TEMPLATE,
            "fee_amount": DEFAULT_FEE_AMOUNT,
            "fee_due_day": DEFAULT_FEE_DUE_DAY,
            "fee_currency": DEFAULT_FEE_CURRENCY,
        },
    )


@router.put("/membership-consent-template", response_model=MembershipConsentTemplateOut)
def update_membership_consent_template(
    payload: MembershipConsentTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    if payload.reset_to_defaults:
        club.membership_consent_addressee = None
        club.membership_consent_body = None
        club.membership_consent_gdpr = None
        club.membership_consent_fee_amount = None
        club.membership_consent_fee_due_day = None
    else:
        if payload.enabled is not None:
            club.membership_consent_enabled = bool(payload.enabled)
        if payload.addressee_template is not None:
            club.membership_consent_addressee = payload.addressee_template.strip() or None
        if payload.body_template is not None:
            club.membership_consent_body = payload.body_template.strip() or None
        if payload.gdpr_template is not None:
            club.membership_consent_gdpr = payload.gdpr_template.strip() or None
        if payload.fee_amount is not None:
            club.membership_consent_fee_amount = int(payload.fee_amount)
        if payload.fee_due_day is not None:
            club.membership_consent_fee_due_day = int(payload.fee_due_day)

    db.commit()
    db.refresh(club)
    resolved = resolve_club_consent_template(club)
    return MembershipConsentTemplateOut(
        **resolved,
        defaults={
            "addressee": default_addressee("{club_name}"),
            "body": DEFAULT_BODY_TEMPLATE,
            "gdpr": DEFAULT_GDPR_TEMPLATE,
            "fee_amount": DEFAULT_FEE_AMOUNT,
            "fee_due_day": DEFAULT_FEE_DUE_DAY,
            "fee_currency": DEFAULT_FEE_CURRENCY,
        },
    )


docs_router = APIRouter(prefix="/api/athletes", tags=["Athlete Documents"])


@docs_router.get("/{athlete_id}/documents")
def list_athlete_documents(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    rows = (
        db.query(AthleteClubConsent)
        .filter(AthleteClubConsent.athlete_id == athlete.id)
        .order_by(AthleteClubConsent.signed_at.desc())
        .all()
    )
    carding_rows = (
        db.query(AthleteCardingForm)
        .filter(AthleteCardingForm.athlete_id == athlete.id)
        .order_by(AthleteCardingForm.signed_at.desc())
        .all()
    )
    active = get_active_consent(db, athlete.id, athlete.club_id)
    docs = [consent_to_document_dict(r) for r in rows] + [
        carding_form_to_document_dict(r) for r in carding_rows
    ]
    docs.sort(key=lambda d: d.get("signed_at") or "", reverse=True)

    year = open_carding_season_year(db, int(athlete.club_id)) if athlete.club_id else None
    adult = {
        "needs_sign": False,
        "form_kind": None,
        "season_year": year,
        "season_label": season_label(year) if year else None,
        "club_name": None,
        "prefill": None,
    }
    if year and athlete.club_id:
        club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
        kind = form_kind_for_athlete(athlete, year)
        adult["form_kind"] = kind
        adult["club_name"] = (club.name if club else "") or ""
        if athlete_needs_adult_carding_form(db, athlete):
            adult["needs_sign"] = True
            adult["prefill"] = prefill_carding_form(db, athlete, year)

    return {
        "athlete_id": athlete.id,
        "membership_consent_active": active is not None,
        "documents": docs,
        "carding_03b": adult,
    }


@docs_router.get("/{athlete_id}/documents/membership-consent/{consent_id}/preview")
def preview_membership_consent(
    athlete_id: int,
    consent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    consent = (
        db.query(AthleteClubConsent)
        .filter(
            AthleteClubConsent.id == int(consent_id),
            AthleteClubConsent.athlete_id == athlete.id,
        )
        .first()
    )
    if not consent:
        raise HTTPException(status_code=404, detail="Документът не е намерен")
    club = db.query(Club).filter(Club.id == int(consent.club_id)).first() if consent.club_id else None
    pdf = read_consent_pdf(consent, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="zayavlenie_{consent.id}.pdf"'},
    )


@docs_router.get("/{athlete_id}/documents/carding-form/{form_id}/preview")
def preview_carding_form(
    athlete_id: int,
    form_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    form = (
        db.query(AthleteCardingForm)
        .filter(AthleteCardingForm.id == int(form_id), AthleteCardingForm.athlete_id == athlete.id)
        .first()
    )
    if not form:
        raise HTTPException(status_code=404, detail="Формата не е намерена")
    club = db.query(Club).filter(Club.id == int(form.club_id)).first() if form.club_id else None
    pdf = read_carding_form_pdf(form, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="forma03_{form.id}.pdf"'},
    )


@docs_router.post("/{athlete_id}/documents/carding-form-03b/sign")
def sign_carding_form_03b_in_person(
    athlete_id: int,
    payload: AdultCardingSignIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    """Подпис на Форма 0-3 B пред треньора (canvas на устройството)."""
    if not payload.rules_accepted:
        raise HTTPException(status_code=422, detail="Необходимо е приемане на правилата на БФВ")
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма клуб")
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    year = open_carding_season_year(db, club.id)
    if not year:
        raise HTTPException(status_code=409, detail="Няма отворена сезонна заявка с активна Форма 03")
    if not athlete_needs_adult_carding_form(db, athlete):
        raise HTTPException(
            status_code=409,
            detail="Няма нужда от Форма 0-3 B (вече е подписана или състезателят не е пълнолетен)",
        )
    pre = prefill_carding_form(db, athlete, year)
    full = (payload.athlete_full_name or "").strip() or " ".join(
        p for p in [pre.get("athlete_first_name"), pre.get("athlete_middle_name"), pre.get("athlete_last_name")] if p
    ).strip()
    egn = (payload.athlete_egn or "").strip() or pre.get("athlete_egn") or ""
    try:
        form = create_signed_carding_form_03b(
            db,
            athlete=athlete,
            club=club,
            season_year=year,
            athlete_full_name=full,
            athlete_egn=egn,
            city=payload.city or pre.get("city"),
            signature_image_data_url=payload.signature_athlete_image,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "ok": True,
        "form_id": form.id,
        "form_kind": form.form_kind,
        "signed_at": form.signed_at,
        "season_year": form.season_year,
    }


@docs_router.post("/{athlete_id}/documents/carding-form-03b/invite-link")
def create_carding_form_03b_invite_link(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    """Еднократен линк (72 ч) за подпис от разстояние — праща се по Viber/WhatsApp."""
    from datetime import timedelta

    from app.auth import create_access_token
    from app.settings import settings

    athlete = _athlete_for_coach(db, athlete_id, current_user)
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма клуб")
    year = open_carding_season_year(db, int(athlete.club_id))
    if not year:
        raise HTTPException(status_code=409, detail="Няма отворена сезонна заявка с активна Форма 03")
    if not athlete_needs_adult_carding_form(db, athlete):
        raise HTTPException(status_code=409, detail="Няма нужда от Форма 0-3 B в момента")
    token = create_access_token(
        {
            "sub": f"carding_03b:{int(athlete.id)}",
            "typ": "carding_03b",
            "athlete_id": int(athlete.id),
            "season_year": int(year),
            "club_id": int(athlete.club_id),
        },
        expires_delta=timedelta(hours=72),
    )
    base = (settings.parent_portal_public_url or "").rstrip("/") or "https://volley-platform-bul.vercel.app"
    path = f"/sign/form-03b/{token}"
    return {
        "ok": True,
        "token": token,
        "path": path,
        "url": f"{base}{path}",
        "expires_hours": 72,
        "athlete_name": athlete.athlete_name,
        "season_label": season_label(year),
    }


@docs_router.post("/{athlete_id}/documents/carding-form/{form_id}/revoke")
def revoke_carding_form(
    athlete_id: int,
    form_id: int,
    payload: RevokeConsentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    """Връща Форма 03 — родителят трябва да я попълни и подпише отново."""
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    form = (
        db.query(AthleteCardingForm)
        .filter(
            AthleteCardingForm.id == int(form_id),
            AthleteCardingForm.athlete_id == athlete.id,
            AthleteCardingForm.is_active.is_(True),
        )
        .first()
    )
    if not form:
        raise HTTPException(status_code=404, detail="Активна Форма 03 не е намерена")
    form.is_active = False
    form.revoked_at = datetime.utcnow()
    db.commit()
    return {
        "ok": True,
        "form_id": form.id,
        "needs_form": True,
        "season_year": form.season_year,
    }


@docs_router.post("/{athlete_id}/documents/membership-consent/{consent_id}/revoke")
def revoke_membership_consent(
    athlete_id: int,
    consent_id: int,
    payload: RevokeConsentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    athlete = _athlete_for_coach(db, athlete_id, current_user)
    consent = (
        db.query(AthleteClubConsent)
        .filter(
            AthleteClubConsent.id == int(consent_id),
            AthleteClubConsent.athlete_id == athlete.id,
            AthleteClubConsent.is_active.is_(True),
        )
        .first()
    )
    if not consent:
        raise HTTPException(status_code=404, detail="Активно заявление не е намерено")
    consent.is_active = False
    consent.revoked_at = datetime.utcnow()
    consent.revoked_by_user_id = current_user.id
    consent.revoke_note = (payload.note or "").strip() or None
    db.commit()
    return {"ok": True, "membership_consent_active": False}
