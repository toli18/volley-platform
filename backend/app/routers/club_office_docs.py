"""Club office documents — service notes and invoices."""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, ClubInvoice, ClubServiceNote, User, UserRole
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club
from app.services.club_office_docs import (
    DEFAULT_REP_TITLE,
    NOTE_KIND_NO_CLAIMS,
    build_invoice_pdf,
    build_service_note_pdf,
    club_address_line,
    club_display_name,
    invoice_to_dict,
    next_invoice_number,
    next_note_number,
    normalize_invoice_items,
    note_to_dict,
)

router = APIRouter(prefix="/api/club-documents", tags=["Club Documents"])

_HEAD_ROLES = (UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)


def _head(user: User = Depends(require_role(*_HEAD_ROLES))) -> User:
    _ensure_head_with_club(user)
    return user


class NoteIn(BaseModel):
    athlete_id: Optional[int] = None
    kind: str = NOTE_KIND_NO_CLAIMS
    issued_at: Optional[date] = None
    city: Optional[str] = Field(None, max_length=120)
    recipient_name: str = Field(..., min_length=2, max_length=255)
    recipient_egn: str = Field(..., min_length=6, max_length=16)
    representative_name: Optional[str] = Field(None, max_length=255)
    representative_title: Optional[str] = Field(None, max_length=120)
    custom_body: Optional[str] = None


class InvoiceItemIn(BaseModel):
    description: str = Field(..., min_length=1, max_length=240)
    qty: float = 1
    unit: str = "бр."
    unit_price: float = 0


class InvoiceIn(BaseModel):
    athlete_id: Optional[int] = None
    issued_at: Optional[date] = None
    place_of_issue: Optional[str] = Field(None, max_length=120)
    buyer_name: str = Field(..., min_length=2, max_length=255)
    buyer_id_number: Optional[str] = Field(None, max_length=32)
    buyer_address: Optional[str] = Field(None, max_length=500)
    vat_registered: bool = False
    vat_rate: int = Field(20, ge=0, le=30)
    payment_method: str = Field("cash", max_length=32)
    bank_iban: Optional[str] = Field(None, max_length=34)
    bank_name: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = None
    items: list[InvoiceItemIn] = Field(default_factory=list)
    supplier_name: Optional[str] = Field(None, max_length=255)
    supplier_address: Optional[str] = Field(None, max_length=500)
    supplier_bulstat: Optional[str] = Field(None, max_length=32)
    supplier_vat_id: Optional[str] = Field(None, max_length=32)


def _athlete_for_club(db: Session, club_id: int, athlete_id: int | None) -> Athlete | None:
    if not athlete_id:
        return None
    row = db.query(Athlete).filter(Athlete.id == int(athlete_id), Athlete.club_id == int(club_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Състезателят не е от този клуб")
    return row


@router.get("/defaults")
def document_defaults(
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    today = date.today()
    athletes = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    return {
        "club_id": club.id,
        "club_name": club.name,
        "club_full_name": club_display_name(club),
        "city": club.city,
        "address": club_address_line(club),
        "bulstat": club.bulstat,
        "contact_name": club.contact_name,
        "logo_url": club.logo_url,
        "representative_title": DEFAULT_REP_TITLE,
        "today": today.isoformat(),
        "next_note_number": next_note_number(db, club.id, today.year),
        "next_invoice_number": next_invoice_number(db, club.id, today.year),
        "athletes": [
            {"id": a.id, "athlete_name": a.athlete_name, "egn": a.egn, "parent_name": a.parent_name}
            for a in athletes
        ],
    }


@router.get("/notes")
def list_notes(
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    rows = (
        db.query(ClubServiceNote)
        .options(joinedload(ClubServiceNote.athlete))
        .filter(ClubServiceNote.club_id == club.id)
        .order_by(ClubServiceNote.issued_at.desc(), ClubServiceNote.id.desc())
        .limit(200)
        .all()
    )
    return {"items": [note_to_dict(r) for r in rows]}


@router.post("/notes")
def create_note(
    body: NoteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    athlete = _athlete_for_club(db, club.id, body.athlete_id)
    issued = body.issued_at or date.today()
    egn = "".join(ch for ch in (body.recipient_egn or "") if ch.isdigit())
    if len(egn) != 10:
        raise HTTPException(status_code=422, detail="ЕГН трябва да е 10 цифри")
    note = ClubServiceNote(
        club_id=club.id,
        athlete_id=athlete.id if athlete else None,
        created_by_user_id=current_user.id,
        kind=(body.kind or NOTE_KIND_NO_CLAIMS).strip() or NOTE_KIND_NO_CLAIMS,
        number=next_note_number(db, club.id, issued.year),
        issued_at=issued,
        city=(body.city or club.city or "").strip() or None,
        recipient_name=body.recipient_name.strip(),
        recipient_egn=egn,
        representative_name=(body.representative_name or club.contact_name or current_user.name or "").strip(),
        representative_title=(body.representative_title or DEFAULT_REP_TITLE).strip() or DEFAULT_REP_TITLE,
        club_name_snapshot=club_display_name(club),
        club_address_snapshot=club_address_line(club) or None,
        custom_body=(body.custom_body or "").strip() or None,
    )
    if not note.representative_name:
        raise HTTPException(status_code=422, detail="Попълни името на представляващия (председател)")
    db.add(note)
    db.commit()
    db.refresh(note)
    return note_to_dict(note)


@router.get("/notes/{note_id}")
def get_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    note = (
        db.query(ClubServiceNote)
        .options(joinedload(ClubServiceNote.athlete))
        .filter(ClubServiceNote.id == note_id, ClubServiceNote.club_id == club.id)
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Бележката не е намерена")
    return note_to_dict(note)


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    note = db.query(ClubServiceNote).filter(ClubServiceNote.id == note_id, ClubServiceNote.club_id == club.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Бележката не е намерена")
    db.delete(note)
    db.commit()
    return Response(status_code=204)


@router.get("/notes/{note_id}/pdf")
def note_pdf(
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    note = db.query(ClubServiceNote).filter(ClubServiceNote.id == note_id, ClubServiceNote.club_id == club.id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Бележката не е намерена")
    data = build_service_note_pdf(note, club=club)
    filename = f"sluzhebna-belezhka-{note.number or note.id}.pdf".replace("/", "-")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/invoices")
def list_invoices(
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    rows = (
        db.query(ClubInvoice)
        .options(joinedload(ClubInvoice.athlete))
        .filter(ClubInvoice.club_id == club.id)
        .order_by(ClubInvoice.issued_at.desc(), ClubInvoice.id.desc())
        .limit(200)
        .all()
    )
    return {"items": [invoice_to_dict(r) for r in rows]}


@router.post("/invoices")
def create_invoice(
    body: InvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    athlete = _athlete_for_club(db, club.id, body.athlete_id)
    issued = body.issued_at or date.today()
    items = normalize_invoice_items([i.model_dump() for i in body.items])
    if not items:
        raise HTTPException(status_code=422, detail="Добави поне един ред във фактурата")
    pay = (body.payment_method or "cash").strip().lower()
    if pay not in ("cash", "bank", "card"):
        raise HTTPException(status_code=422, detail="Невалиден начин на плащане")
    inv = ClubInvoice(
        club_id=club.id,
        athlete_id=athlete.id if athlete else None,
        created_by_user_id=current_user.id,
        number=next_invoice_number(db, club.id, issued.year),
        issued_at=issued,
        place_of_issue=(body.place_of_issue or club.city or "").strip() or None,
        status="issued",
        supplier_name=(body.supplier_name or club_display_name(club)).strip(),
        supplier_address=(body.supplier_address or club_address_line(club) or None),
        supplier_bulstat=(body.supplier_bulstat or club.bulstat or None),
        supplier_vat_id=(body.supplier_vat_id or None),
        buyer_name=body.buyer_name.strip(),
        buyer_id_number=(body.buyer_id_number or "").strip() or None,
        buyer_address=(body.buyer_address or "").strip() or None,
        vat_registered=bool(body.vat_registered),
        vat_rate=int(body.vat_rate or 20),
        currency="BGN",
        payment_method=pay,
        bank_iban=(body.bank_iban or "").strip() or None,
        bank_name=(body.bank_name or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        items=items,
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return invoice_to_dict(inv)


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    inv = (
        db.query(ClubInvoice)
        .options(joinedload(ClubInvoice.athlete))
        .filter(ClubInvoice.id == invoice_id, ClubInvoice.club_id == club.id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Фактурата не е намерена")
    return invoice_to_dict(inv)


@router.post("/invoices/{invoice_id}/cancel")
def cancel_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    inv = db.query(ClubInvoice).filter(ClubInvoice.id == invoice_id, ClubInvoice.club_id == club.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Фактурата не е намерена")
    inv.status = "cancelled"
    db.commit()
    db.refresh(inv)
    return invoice_to_dict(inv)


@router.delete("/invoices/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    inv = db.query(ClubInvoice).filter(ClubInvoice.id == invoice_id, ClubInvoice.club_id == club.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Фактурата не е намерена")
    db.delete(inv)
    db.commit()
    return Response(status_code=204)


@router.get("/invoices/{invoice_id}/pdf")
def invoice_pdf(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_head),
):
    club = _club_for_user(db, current_user)
    inv = db.query(ClubInvoice).filter(ClubInvoice.id == invoice_id, ClubInvoice.club_id == club.id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Фактурата не е намерена")
    data = build_invoice_pdf(inv, club=club)
    filename = f"faktura-{inv.number}.pdf".replace("/", "-")
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )
