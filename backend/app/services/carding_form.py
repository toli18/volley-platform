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


def athlete_needs_carding_form(db: Session, athlete: Athlete) -> bool:
    """Gate: само бутон „Отвори сезон“ активира формата; нужен е подпис за годината."""
    if not athlete.club_id or not getattr(athlete, "is_active", True):
        return False
    year = open_carding_season_year(db, int(athlete.club_id))
    if not year:
        return False
    if get_signed_carding_form(db, athlete.id, year, athlete.club_id) is not None:
        return False
    return True


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
    """PDF близо до официалната бланка Форма 0-3 / 0-3 А (рамка, кутии, лога)."""
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font
    from app.services.club_membership_consent import _club_logo_filesystem_path

    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 14 * mm
    inner_l = margin + 4 * mm
    inner_r = width - margin - 4 * mm
    content_w = inner_r - inner_l

    # Outer border like official blank
    c.setStrokeColorRGB(0.05, 0.05, 0.05)
    c.setLineWidth(1.2)
    c.rect(margin, margin, width - 2 * margin, height - 2 * margin)

    logo_h = 16 * mm
    top = height - margin - 4 * mm
    fed = bvf_logo_path()
    if fed:
        try:
            c.drawImage(
                str(fed),
                inner_l,
                top - logo_h,
                width=16 * mm,
                height=logo_h,
                mask="auto",
                preserveAspectRatio=True,
            )
        except Exception:
            pass

    club_logo = _club_logo_filesystem_path(club.logo_url if club else None, club=club)
    if club_logo:
        try:
            c.drawImage(
                str(club_logo),
                inner_r - 16 * mm,
                top - logo_h,
                width=16 * mm,
                height=logo_h,
                mask="auto",
                preserveAspectRatio=True,
            )
        except Exception:
            pass

    title_kind = "Форма 0-3 А" if form.form_kind == FORM_KIND_03A else "Форма 0-3"
    c.setFont(font_name, 11)
    c.drawCentredString(width / 2, top - 6 * mm, "Българска федерация по Волейбол")
    c.setFont(font_name, 10)
    c.drawRightString(inner_r, top - 18 * mm, title_kind)

    # Header rule
    y = top - logo_h - 3 * mm
    c.setLineWidth(0.8)
    c.line(inner_l, y, inner_r, y)
    y -= 10 * mm

    c.setFont(font_name, 16)
    c.drawCentredString(width / 2, y, "ЗАЯВЛЕНИЕ")
    y -= 10 * mm

    club_name = form.club_name_snapshot or (club.name if club else "") or ""
    season = form.season_label_snapshot or season_label(form.season_year)

    def text(msg: str, size: int = 10, gap: float = 5 * mm):
        nonlocal y
        c.setFont(font_name, size)
        c.drawString(inner_l, y, msg)
        y -= gap

    def draw_name_egn_box(full_name: str, egn: str, label: str = "(три имена)", optional: bool = False):
        nonlocal y
        box_h = 11 * mm
        egn_w = 38 * mm
        name_w = content_w - egn_w - 2 * mm
        if optional:
            c.setStrokeColorRGB(0.7, 0.75, 0.8)
        else:
            c.setStrokeColorRGB(0.25, 0.3, 0.35)
        c.setLineWidth(0.9)
        c.rect(inner_l, y - box_h + 2 * mm, name_w, box_h)
        c.rect(inner_l + name_w + 2 * mm, y - box_h + 2 * mm, egn_w, box_h)
        c.setFillColorRGB(0.1, 0.1, 0.1)
        c.setFont(font_name, 10)
        c.drawString(inner_l + 2 * mm, y - 4 * mm, (full_name or "")[:48])
        c.drawString(inner_l + name_w + 4 * mm, y - 4 * mm, f"ЕГН: {egn or ''}")
        c.setFont(font_name, 7)
        c.setFillColorRGB(0.45, 0.5, 0.55)
        c.drawString(inner_l + 2 * mm, y - box_h + 3.5 * mm, label)
        c.drawString(inner_l + name_w + 4 * mm, y - box_h + 3.5 * mm, "ЕГН:")
        c.setFillColorRGB(0, 0, 0)
        y -= box_h + 4 * mm

    if form.form_kind == FORM_KIND_03A:
        text("Долуподписаният/ата:")
        draw_name_egn_box(form.athlete_full_name, form.athlete_egn, "(три имена — състезател)")
        text("със съгласието на родителите/попечителите си:")
        draw_name_egn_box(form.parent1_full_name, form.parent1_egn)
        if form.parent2_full_name:
            draw_name_egn_box(form.parent2_full_name, form.parent2_egn or "")
        else:
            draw_name_egn_box("", "", "(три имена — родител 2)")
        text("с настоящото заявявам, че желая да бъда картотекиран/а в", gap=4 * mm)
    else:
        text("Долуподписаните:")
        draw_name_egn_box(form.parent1_full_name, form.parent1_egn)
        c.setFont(font_name, 10)
        c.drawCentredString(width / 2, y, "и")
        y -= 5 * mm
        if form.parent2_full_name:
            draw_name_egn_box(form.parent2_full_name, form.parent2_egn or "")
        else:
            draw_name_egn_box("", "", "(три имена — родител 2)")
        text("родители/настойници на:")
        draw_name_egn_box(form.athlete_full_name, form.athlete_egn, "(три имена — дете)")
        text("с настоящото заявяваме, че желаем детето ни да бъде картотекирано в", gap=4 * mm)

    # Club box + season
    club_box_h = 10 * mm
    c.setStrokeColorRGB(0.25, 0.3, 0.35)
    c.setLineWidth(0.9)
    c.rect(inner_l, y - club_box_h + 2 * mm, content_w * 0.62, club_box_h)
    c.setFont(font_name, 10)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(inner_l + 2 * mm, y - 4 * mm, club_name[:42])
    c.setFont(font_name, 7)
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.drawString(inner_l + 2 * mm, y - club_box_h + 3.5 * mm, "(наименование на клуба)")
    c.setFillColorRGB(0, 0, 0)
    c.setFont(font_name, 10)
    c.drawString(inner_l + content_w * 0.62 + 3 * mm, y - 4 * mm, f"за сезон {season} г.")
    y -= club_box_h + 7 * mm

    legal = (
        "С подписване на настоящата форма /заявление декларирам, че съм запознат/а и се задължавам "
        "да спазвам устава, правилниците и наредбите на БФВ и международните организации."
    )
    c.setFont(font_name, 8)
    # simple wrap
    words = legal.split()
    line = ""
    for w in words:
        trial = f"{line} {w}".strip()
        if c.stringWidth(trial, font_name, 8) <= content_w:
            line = trial
        else:
            c.drawString(inner_l, y, line)
            y -= 3.5 * mm
            line = w
    if line:
        c.drawString(inner_l, y, line)
        y -= 8 * mm

    city = form.city or ""
    signed = form.signed_at.strftime("%d.%m.%Y") if form.signed_at else ""
    meta_h = 10 * mm
    half = (content_w - 3 * mm) / 2
    c.setStrokeColorRGB(0.25, 0.3, 0.35)
    c.rect(inner_l, y - meta_h + 2 * mm, half, meta_h)
    c.rect(inner_l + half + 3 * mm, y - meta_h + 2 * mm, half, meta_h)
    c.setFont(font_name, 10)
    c.drawString(inner_l + 2 * mm, y - 4 * mm, f"Дата: {signed}")
    c.drawString(inner_l + half + 5 * mm, y - 4 * mm, f"Град: {city}")
    y -= meta_h + 8 * mm

    if form.form_kind == FORM_KIND_03A:
        text(f"Състезател: {form.signature_athlete or '_______________'}", gap=6 * mm)
        text("Родители/попечители:", gap=5 * mm)
    else:
        text("Родители/настойници:", gap=5 * mm)

    c.setFont(font_name, 10)
    c.drawString(inner_l, y, f"1. {form.signature_parent1 or '_______________'}")
    c.drawString(inner_l + content_w / 2, y, f"2. {form.signature_parent2 or '_______________'}")
    y -= 4 * mm
    c.setFont(font_name, 7)
    c.setFillColorRGB(0.45, 0.5, 0.55)
    c.drawCentredString(inner_l + content_w / 4, y, "(подпис)")
    c.drawCentredString(inner_l + 3 * content_w / 4, y, "(подпис)")

    c.showPage()
    c.save()
    return buffer.getvalue()


def persist_carding_form_pdf(form: AthleteCardingForm, club: Club | None = None) -> str:
    data = build_carding_form_pdf(form, club=club)
    rel = f"{form.athlete_id}_{form.season_year}_{form.id}.pdf"
    path = carding_form_pdf_dir() / rel
    path.write_bytes(data)
    return f"carding_forms/{rel}"


def read_carding_form_pdf(form: AthleteCardingForm, club: Club | None = None) -> bytes | None:
    """Винаги генерира актуалния layout (не разчита на стар кеширан PDF)."""
    try:
        if club is None:
            club = getattr(form, "club", None)
        return build_carding_form_pdf(form, club=club)
    except Exception:
        return None


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
