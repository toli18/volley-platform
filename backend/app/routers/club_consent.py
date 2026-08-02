"""Club membership consent config (head coach) + athlete documents."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, AthleteClubConsent, Club, User, UserRole
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club
from app.services.club_membership_consent import (
    DEFAULT_BODY_TEMPLATE,
    DEFAULT_FEE_AMOUNT,
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
    fee_amount: int
    fee_due_day: int
    addressee: str
    body_text: str
    gdpr_text: str
    addressee_template: Optional[str] = None
    body_template: Optional[str] = None
    gdpr_template: Optional[str] = None
    defaults: dict = Field(default_factory=dict)


class MembershipConsentTemplateUpdate(BaseModel):
    club_id: Optional[int] = None
    addressee_template: Optional[str] = None
    body_template: Optional[str] = None
    gdpr_template: Optional[str] = None
    fee_amount: Optional[int] = Field(None, ge=0, le=10000)
    fee_due_day: Optional[int] = Field(None, ge=1, le=28)
    reset_to_defaults: bool = False


class RevokeConsentIn(BaseModel):
    note: Optional[str] = Field(None, max_length=500)


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
    active = get_active_consent(db, athlete.id, athlete.club_id)
    return {
        "athlete_id": athlete.id,
        "membership_consent_active": active is not None,
        "documents": [consent_to_document_dict(r) for r in rows],
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
    pdf = read_consent_pdf(consent)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="zayavlenie_{consent.id}.pdf"'},
    )


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
