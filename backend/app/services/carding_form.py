"""Форма 0-3 / 0-3 А — сезонна родителска бланка за картотекиране."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteCardingForm, AthleteClubConsent, BvfSeasonApplication, Club
from app.services.club_membership_consent import bvf_logo_path, get_active_consent

FORM_KIND_03 = "03"
FORM_KIND_03A = "03a"


def season_label(year: int) -> str:
    y = int(year)
    return f"{y} / {y + 1}"


def open_carding_season_year(db: Session, club_id: int) -> int | None:
    """Активна (open) сезонна заявка на клуба — активира Форма 03 за родителите."""
    app = (
        db.query(BvfSeasonApplication)
        .filter(
            BvfSeasonApplication.club_id == int(club_id),
            BvfSeasonApplication.status == "open",
        )
        .order_by(BvfSeasonApplication.year.desc())
        .first()
    )
    return int(app.year) if app else None


def athlete_age_in_season(athlete: Athlete, season_year: int) -> int | None:
    by = getattr(athlete, "birth_year", None)
    bd = getattr(athlete, "birth_date", None)
    if not by and bd is not None:
        by = getattr(bd, "year", None)
    if not by:
        egn = "".join(ch for ch in str(getattr(athlete, "egn", None) or "") if ch.isdigit())
        if len(egn) == 10:
            yy = int(egn[0:2])
            mm = int(egn[2:4])
            # century from month encoding
            if mm > 40:
                by = 2000 + yy
            elif mm > 20:
                by = 1800 + yy
            else:
                by = 1900 + yy
                if by < 1950 and yy < 30:
                    by = 2000 + yy
    if not by:
        return None
    return int(season_year) - int(by)


def form_kind_for_athlete(athlete: Athlete, season_year: int) -> str:
    age = athlete_age_in_season(athlete, season_year)
    if age is not None and age >= 14:
        return FORM_KIND_03A
    return FORM_KIND_03


def get_signed_carding_form(
    db: Session, athlete_id: int, season_year: int, club_id: int | None = None
) -> AthleteCardingForm | None:
    q = (
        db.query(AthleteCardingForm)
        .filter(
            AthleteCardingForm.athlete_id == int(athlete_id),
            AthleteCardingForm.season_year == int(season_year),
            AthleteCardingForm.is_active.is_(True),
        )
        .order_by(AthleteCardingForm.signed_at.desc())
    )
    if club_id is not None:
        q = q.filter(AthleteCardingForm.club_id == int(club_id))
    return q.first()


def athlete_needs_carding_form(db: Session, athlete: Athlete) -> bool:
    """Gate: сезонът е отворен от главния и няма подписана форма за годината."""
    if not athlete.club_id or not getattr(athlete, "is_active", True):
        return False
    year = open_carding_season_year(db, int(athlete.club_id))
    if not year:
        return False
    return get_signed_carding_form(db, athlete.id, year, athlete.club_id) is None


def athlete_has_signed_carding_form(db: Session, athlete: Athlete, season_year: int) -> bool:
    return get_signed_carding_form(db, athlete.id, int(season_year), athlete.club_id) is not None


def _split_full_name(full: str | None) -> tuple[str, str, str]:
    parts = [p for p in str(full or "").split() if p]
    if len(parts) >= 3:
        return parts[0], parts[1], " ".join(parts[2:])
    if len(parts) == 2:
        return parts[0], "", parts[1]
    if len(parts) == 1:
        return parts[0], "", ""
    return "", "", ""


def prefill_carding_form(db: Session, athlete: Athlete, season_year: int) -> dict[str, Any]:
    consent = get_active_consent(db, athlete.id, athlete.club_id)
    first = (athlete.first_name or "").strip()
    middle = (athlete.middle_name or "").strip()
    last = (athlete.last_name or "").strip()
    if not (first and middle and last):
        if consent and consent.child_full_name:
            first, middle, last = _split_full_name(consent.child_full_name)
        else:
            first, middle, last = _split_full_name(athlete.athlete_name)

    parent1 = ""
    parent1_egn = ""
    if consent:
        parent1 = (consent.parent_full_name or "").strip()
        parent1_egn = (consent.parent_egn or "").strip()
    if not parent1:
        parent1 = (athlete.parent_name or "").strip()

    egn = "".join(ch for ch in str(athlete.egn or (consent.child_egn if consent else "") or "") if ch.isdigit())
    kind = form_kind_for_athlete(athlete, season_year)
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first() if athlete.club_id else None

    return {
        "form_kind": kind,
        "season_year": int(season_year),
        "season_label": season_label(season_year),
        "club_name": (club.name if club else "") or "",
        "parent1_full_name": parent1,
        "parent1_egn": parent1_egn,
        "parent2_full_name": "",
        "parent2_egn": "",
        "athlete_first_name": first,
        "athlete_middle_name": middle,
        "athlete_last_name": last,
        "athlete_egn": egn,
        "city": (athlete.place_of_birth or "").strip(),
    }


def deactivate_prior_carding_forms(db: Session, athlete_id: int, season_year: int) -> None:
    now = datetime.utcnow()
    rows = (
        db.query(AthleteCardingForm)
        .filter(
            AthleteCardingForm.athlete_id == int(athlete_id),
            AthleteCardingForm.season_year == int(season_year),
            AthleteCardingForm.is_active.is_(True),
        )
        .all()
    )
    for row in rows:
        row.is_active = False
        row.revoked_at = now


def carding_form_pdf_dir() -> Path:
    base = Path(__file__).resolve().parents[1] / "uploads" / "carding_forms"
    base.mkdir(parents=True, exist_ok=True)
    return base


def build_carding_form_pdf(form: AthleteCardingForm, club: Club | None = None) -> bytes:
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font

    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 45
    y = height - 42

    fed = bvf_logo_path()
    if fed:
        try:
            c.drawImage(str(fed), left, height - 18 * mm, width=16 * mm, height=16 * mm, mask="auto")
        except Exception:
            pass

    title_kind = "Форма 0-3 А" if form.form_kind == FORM_KIND_03A else "Форма 0-3"
    c.setFont(font_name, 11)
    c.drawRightString(width - 45, height - 30, title_kind)
    c.setFont(font_name, 9)
    c.drawCentredString(width / 2, height - 28, "Българска федерация по Волейбол")

    y = height - 70
    c.setFont(font_name, 16)
    c.drawCentredString(width / 2, y, "ЗАЯВЛЕНИЕ")
    y -= 28
    c.setFont(font_name, 11)

    def line(text: str, gap: float = 16):
        nonlocal y
        c.drawString(left, y, text[:110])
        y -= gap

    club_name = form.club_name_snapshot or (club.name if club else "")
    season = form.season_label_snapshot or season_label(form.season_year)

    if form.form_kind == FORM_KIND_03A:
        line("Долуподписаният/ата:")
        line(f"{form.athlete_full_name}    ЕГН: {form.athlete_egn}")
        line("със съгласието на родителите/попечителите си:")
        line(f"{form.parent1_full_name}    ЕГН: {form.parent1_egn}")
        if form.parent2_full_name:
            line(f"{form.parent2_full_name}    ЕГН: {form.parent2_egn or '—'}")
        line(f"заявявам, че желая да бъда картотекиран/а в {club_name}")
    else:
        line("Долуподписаните:")
        line(f"{form.parent1_full_name}    ЕГН: {form.parent1_egn}")
        if form.parent2_full_name:
            line("и")
            line(f"{form.parent2_full_name}    ЕГН: {form.parent2_egn or '—'}")
        line("родители/настойници на:")
        line(f"{form.athlete_full_name}    ЕГН: {form.athlete_egn}")
        line(f"заявяваме, че желаем детето ни да бъде картотекирано в {club_name}")

    line(f"за сезон {season} г.")
    y -= 8
    line("Декларирам, че съм запознат/а и ще спазвам устава, правилниците и наредбите на БФВ.", 14)
    y -= 6
    city = form.city or "—"
    signed = form.signed_at.strftime("%d.%m.%Y") if form.signed_at else "—"
    line(f"Дата: {signed}    Град: {city}")
    y -= 10
    if form.form_kind == FORM_KIND_03A and form.signature_athlete:
        line(f"Състезател: {form.signature_athlete}")
    line(f"Родител 1: {form.signature_parent1}")
    if form.signature_parent2:
        line(f"Родител 2: {form.signature_parent2}")

    c.showPage()
    c.save()
    return buffer.getvalue()


def persist_carding_form_pdf(form: AthleteCardingForm, club: Club | None = None) -> str:
    data = build_carding_form_pdf(form, club=club)
    rel = f"{form.athlete_id}_{form.season_year}_{form.id}.pdf"
    path = carding_form_pdf_dir() / rel
    path.write_bytes(data)
    return f"carding_forms/{rel}"


def read_carding_form_pdf(form: AthleteCardingForm) -> bytes | None:
    if not form.pdf_rel_path:
        return None
    path = Path(__file__).resolve().parents[1] / "uploads" / form.pdf_rel_path
    if not path.is_file():
        # try rebuild
        try:
            return build_carding_form_pdf(form)
        except Exception:
            return None
    return path.read_bytes()


def carding_form_to_document_dict(form: AthleteCardingForm) -> dict[str, Any]:
    kind_label = "Форма 0-3 А" if form.form_kind == FORM_KIND_03A else "Форма 0-3"
    return {
        "id": form.id,
        "doc_type": "carding_form",
        "title": f"{kind_label} — сезон {form.season_label_snapshot or form.season_year}",
        "status": "active" if form.is_active else "revoked",
        "signed_at": form.signed_at.isoformat() if form.signed_at else None,
        "season_year": form.season_year,
        "form_kind": form.form_kind,
        "has_preview": True,
    }


# silence unused import warning for AthleteClubConsent type hints if needed
_ = AthleteClubConsent
