"""Club membership consent (Заявление) — defaults, resolve, PDF, lookups."""

from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteClubConsent, Club
from app.services.athlete_identity import (
    DEFAULT_NATIONALITY,
    apply_birth_date_from_egn,
    default_nationality_from_city,
)

DEFAULT_FEE_AMOUNT = 15
DEFAULT_FEE_DUE_DAY = 10
DEFAULT_FEE_CURRENCY = "€"
# Клубно заявление: валидно 1 година, после родителят попълва отново.
CONSENT_VALIDITY_DAYS = 365


def club_monthly_fees_enabled(club: Club | None) -> bool:
    """True = клубът събира месечна такса (default). False = скриваме таксите навсякъде."""
    if club is None:
        return True
    val = getattr(club, "monthly_fees_enabled", None)
    if val is None:
        return True
    return bool(val)


def resolve_club_fee_settings(club: Club) -> dict[str, Any]:
    return {
        "enabled": club_monthly_fees_enabled(club),
        "fee_amount": int(club.membership_consent_fee_amount or DEFAULT_FEE_AMOUNT),
        "fee_due_day": int(club.membership_consent_fee_due_day or DEFAULT_FEE_DUE_DAY),
        "fee_currency": DEFAULT_FEE_CURRENCY,
    }

DEFAULT_BODY_TEMPLATE = (
    "Желая синът/дъщерята ми да бъде приет/а като състезател във {club_name} "
    "и да участва в тренировъчния процес, организиран от клуба.\n\n"
    "Запознат/а съм с Устава на клуба и приетите в него правила и ще ги спазвам. "
    "Синът/дъщерята ми декларира, че ще изпълнява съвестно и отговорно поставените "
    "задачи и указания в тренировъчния процес, като ще поддържа добър тон и отношение "
    "към останалите състезатели.\n\n"
    "Съгласен/на съм да заплащам месечна такса в размер на {fee_amount} {fee_currency} "
    "до {fee_due_day}-то число на месеца."
)

DEFAULT_GDPR_TEMPLATE = (
    "Подписвайки настоящото заявление, в качеството си на родител/настойник на "
    "непълнолетното лице, декларирам, че съм запознат/а и давам свободно, конкретно, "
    "информирано и недвусмислено съгласие сдружение {club_name} („Администратор“) да "
    "обработва следните категории лични данни:\n\n"
    "• за родителя/настойника: имена, ЕГН, адрес, телефон, електронен подпис;\n"
    "• за детето/състезателя: имена, ЕГН, дата/място на раждане, адрес, телефон, "
    "снимка, спортно-технически и здравни данни, свързани с тренировъчния и "
    "състезателния процес;\n"
    "• данни за членство, присъствия, такси и комуникация чрез родителския портал.\n\n"
    "Цели на обработката: прием и участие в тренировъчния процес; администрация на "
    "членството и таксите; комуникация с родителя; картотекиране и лицензиране пред "
    "Българската федерация по волейбол (БФВ) и свързаните електронни системи "
    "(вкл. СЕК); изпълнение на законови задължения по Закона за физическото "
    "възпитание и спорта и приложимите наредби.\n\n"
    "Получатели: упълномощени лица на клуба (треньори, администрация); БФВ и нейните "
    "информационни системи; при необходимост — органи и организации, на които "
    "предоставянето е задължително по закон.\n\n"
    "Срок на съхранение: за периода на членство/участие и за сроковете, изисквани от "
    "приложимото законодателство и правилата на БФВ, след което данните се "
    "анонимизират или унищожават, освен ако законът изисква по-дълго съхранение.\n\n"
    "Права: имам право на достъп, коригиране, ограничаване, възражение, преносимост и "
    "при определени условия — изтриване, както и право да оттегля съгласието си по "
    "всяко време, без това да засяга законосъобразността на обработката преди "
    "оттеглянето. Оттеглянето може да доведе до прекратяване на участието в "
    "тренировъчния процес и/или невъзможност за картотекиране. Мога да подам жалба "
    "до Комисията за защита на личните данни.\n\n"
    "Потвърждавам, че предоставените данни са верни и актуални."
)


def _documents_root() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "athlete_documents"


def default_addressee(club_name: str) -> str:
    name = (club_name or "Клуб").strip()
    return f"ДО УПРАВИТЕЛНИЯ СЪВЕТ НА СДРУЖЕНИЕ ВОЛЕЙБОЛЕН КЛУБ „{name}“"


def _static_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "static"


def _branding_dir() -> Path:
    return _static_dir() / "branding"


def bvf_logo_path() -> Path | None:
    path = _branding_dir() / "bfvb-logo.png"
    return path if path.is_file() else None


def _club_logo_filesystem_path(logo_url: str | None, club: Club | None = None) -> Path | None:
    raw = (logo_url or (club.logo_url if club else None) or "").strip()
    if raw:
        if raw.startswith("http://") or raw.startswith("https://"):
            marker = "/static/"
            if marker in raw:
                rel = raw.split(marker, 1)[1]
                path = _static_dir() / rel
                if path.is_file():
                    return path
        elif raw.startswith("/static/"):
            path = _static_dir() / raw[len("/static/") :]
            if path.is_file():
                return path
        elif raw.startswith("static/"):
            path = _static_dir() / raw[len("static/") :]
            if path.is_file():
                return path
        else:
            path = _static_dir() / "club-logos" / raw
            if path.is_file():
                return path

    if club is not None:
        for key in (getattr(club, "bvf_club_id", None), club.id):
            if not key:
                continue
            for ext in (".png", ".webp", ".jpg", ".jpeg"):
                path = _static_dir() / "club-logos" / f"{int(key)}{ext}"
                if path.is_file():
                    return path
    return None


def _fill(
    template: str,
    club_name: str,
    fee_amount: int,
    fee_due_day: int,
    fee_currency: str = DEFAULT_FEE_CURRENCY,
) -> str:
    text = (
        (template or "")
        .replace("{club_name}", club_name)
        .replace("{fee_amount}", str(fee_amount))
        .replace("{fee_due_day}", str(fee_due_day))
        .replace("{fee_currency}", fee_currency)
    )
    # Soft migrate older saved templates that still say лв.
    return text.replace(" лв.", f" {fee_currency}").replace("лв.", fee_currency)


def resolve_club_consent_template(club: Club) -> dict[str, Any]:
    club_name = (club.name or "Клуб").strip()
    fee_amount = int(club.membership_consent_fee_amount or DEFAULT_FEE_AMOUNT)
    fee_due_day = int(club.membership_consent_fee_due_day or DEFAULT_FEE_DUE_DAY)
    addressee_raw = (club.membership_consent_addressee or "").strip() or default_addressee("{club_name}")
    body_raw = (club.membership_consent_body or "").strip() or DEFAULT_BODY_TEMPLATE
    gdpr_raw = (club.membership_consent_gdpr or "").strip() or DEFAULT_GDPR_TEMPLATE
    return {
        "club_id": club.id,
        "club_name": club_name,
        "club_logo_url": club.logo_url,
        "bvf_logo_url": "/static/branding/bfvb-logo.png",
        "enabled": bool(getattr(club, "membership_consent_enabled", False)),
        "fee_amount": fee_amount,
        "fee_due_day": fee_due_day,
        "fee_currency": DEFAULT_FEE_CURRENCY,
        "addressee": _fill(addressee_raw, club_name, fee_amount, fee_due_day),
        "body_text": _fill(body_raw, club_name, fee_amount, fee_due_day),
        "gdpr_text": _fill(gdpr_raw, club_name, fee_amount, fee_due_day),
        "addressee_template": club.membership_consent_addressee,
        "body_template": club.membership_consent_body,
        "gdpr_template": club.membership_consent_gdpr,
    }


def club_consent_feature_enabled(club: Club | None) -> bool:
    if not club:
        return False
    return bool(getattr(club, "membership_consent_enabled", False))


def consent_still_valid(consent: AthleteClubConsent | None) -> bool:
    if not consent or not consent.is_active or not consent.signed_at:
        return False
    age = datetime.utcnow() - consent.signed_at
    return age <= timedelta(days=CONSENT_VALIDITY_DAYS)


def get_active_consent(db: Session, athlete_id: int, club_id: int | None = None) -> AthleteClubConsent | None:
    q = (
        db.query(AthleteClubConsent)
        .filter(
            AthleteClubConsent.athlete_id == int(athlete_id),
            AthleteClubConsent.is_active.is_(True),
        )
        .order_by(AthleteClubConsent.signed_at.desc())
    )
    if club_id is not None:
        q = q.filter(AthleteClubConsent.club_id == int(club_id))
    consent = q.first()
    if consent and not consent_still_valid(consent):
        return None
    return consent


def deactivate_expired_or_prior_consents(db: Session, athlete_id: int, club_id: int) -> None:
    """Деактивира стари/изтекли активни заявления преди нов подпис."""
    now = datetime.utcnow()
    rows = (
        db.query(AthleteClubConsent)
        .filter(
            AthleteClubConsent.athlete_id == int(athlete_id),
            AthleteClubConsent.club_id == int(club_id),
            AthleteClubConsent.is_active.is_(True),
        )
        .all()
    )
    for row in rows:
        row.is_active = False
        row.revoked_at = now
        if not row.revoke_note:
            row.revoke_note = "Годишно подновяване"


def athlete_needs_membership_consent(db: Session, athlete: Athlete) -> bool:
    """Gate когато функцията е включена и няма валидно (до 1 г.) активно заявление."""
    if not athlete.club_id:
        return False
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club_consent_feature_enabled(club):
        return False
    return get_active_consent(db, athlete.id, athlete.club_id) is None


def _split_child_full_name(full: str | None) -> tuple[str, str, str] | None:
    parts = [p for p in str(full or "").split() if p]
    if len(parts) < 3:
        return None
    return parts[0], parts[1], " ".join(parts[2:])


def apply_athlete_identity_from_consent(db: Session, athlete: Athlete) -> bool:
    """
    Попълва липсващи полета в профила от активното клубно заявление.
    Покрива стари подписи, които са записали само child_full_name / child_egn в consent,
    без first_name / middle_name / last_name на атлета.
    Не пипа идентичност след връзка с БФВ.
    При град на раждане → националност България (ако липсва/празна).
    """
    if getattr(athlete, "bvf_player_id", None):
        return False
    consent = get_active_consent(db, athlete.id, athlete.club_id)
    if not consent:
        return False

    changed = False

    need_names = not (
        (athlete.first_name or "").strip()
        and (athlete.middle_name or "").strip()
        and (athlete.last_name or "").strip()
    )
    if need_names:
        split = _split_child_full_name(consent.child_full_name) or _split_child_full_name(
            athlete.athlete_name
        )
        if split:
            first, middle, last = split
            athlete.first_name = first
            athlete.middle_name = middle
            athlete.last_name = last
            athlete.athlete_name = f"{first} {middle} {last}".strip()
            changed = True
        elif (consent.child_full_name or "").strip() and not (athlete.athlete_name or "").strip():
            athlete.athlete_name = consent.child_full_name.strip()
            changed = True

    consent_egn = "".join(ch for ch in str(consent.child_egn or "") if ch.isdigit())
    athlete_egn = "".join(ch for ch in str(athlete.egn or "") if ch.isdigit())
    if len(consent_egn) == 10 and athlete_egn != consent_egn:
        athlete.egn = consent_egn
        changed = True

    # Пълна дата от ЕГН (винаги коригира при валидно ЕГН)
    if len("".join(ch for ch in str(athlete.egn or "") if ch.isdigit())) == 10:
        try:
            if apply_birth_date_from_egn(athlete):
                changed = True
        except Exception:
            pass

    # Място на раждане е записано при подпис; националност — автоматично от града.
    place = (athlete.place_of_birth or "").strip()
    if place:
        nat = default_nationality_from_city(place, athlete.nationality)
        if (athlete.nationality or "").strip() != nat:
            athlete.nationality = nat
            changed = True
    elif not (athlete.nationality or "").strip():
        athlete.nationality = DEFAULT_NATIONALITY
        changed = True
    if not (athlete.parent_name or "").strip() and (consent.parent_full_name or "").strip():
        athlete.parent_name = consent.parent_full_name.strip()
        changed = True
    if not (athlete.parent_phone or "").strip() and (consent.parent_phone or "").strip():
        athlete.parent_phone = consent.parent_phone.strip()
        changed = True

    return changed


def build_consent_pdf(consent: AthleteClubConsent, club: Club | None = None) -> bytes:
    """Generate a Cyrillic PDF snapshot of the signed application with club + BVF logos."""
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font

    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 45
    max_width = width - 90
    y = height - 42

    # Header logos: BVF left, club right
    logo_h = 16 * mm
    fed = bvf_logo_path()
    if fed:
        try:
            c.drawImage(
                str(fed),
                left,
                height - 18 * mm,
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
                width - left - 16 * mm,
                height - 18 * mm,
                width=16 * mm,
                height=logo_h,
                mask="auto",
                preserveAspectRatio=True,
            )
        except Exception:
            pass
    y = height - 28 * mm

    def draw_wrapped(text: str, size: int = 10, gap: int = 14) -> None:
        nonlocal y
        c.setFont(font_name, size)
        for paragraph in (text or "").split("\n"):
            words = paragraph.split(" ") if paragraph else [""]
            line = ""
            for word in words:
                trial = f"{line} {word}".strip() if line else word
                if stringWidth(trial, font_name, size) <= max_width:
                    line = trial
                else:
                    if y < 60:
                        c.showPage()
                        c.setFont(font_name, size)
                        y = height - 50
                    c.drawString(left, y, line)
                    y -= gap
                    line = word
            if y < 60:
                c.showPage()
                c.setFont(font_name, size)
                y = height - 50
            c.drawString(left, y, line)
            y -= gap
        y -= 4

    c.setFont(font_name, 16)
    c.drawCentredString(width / 2, y, "ЗАЯВЛЕНИЕ")
    y -= 28
    draw_wrapped(consent.addressee_snapshot or "", size=10, gap=13)
    y -= 6
    draw_wrapped(f"От: {consent.parent_full_name}", size=11, gap=14)
    draw_wrapped(f"ЕГН: {consent.parent_egn}", size=11, gap=14)
    draw_wrapped(f"Адрес: {consent.parent_address}", size=11, gap=14)
    draw_wrapped(f"тел.: {consent.parent_phone}", size=11, gap=14)
    y -= 4
    draw_wrapped(
        "в качеството си на родител /настойник/ на сина/дъщеря ми",
        size=10,
        gap=13,
    )
    draw_wrapped(consent.child_full_name or "", size=11, gap=14)
    draw_wrapped(f"ЕГН: {consent.child_egn}", size=11, gap=14)
    if consent.child_address:
        draw_wrapped(f"Адрес: {consent.child_address}", size=11, gap=14)
    if consent.child_phone:
        draw_wrapped(f"тел.: {consent.child_phone}", size=11, gap=14)
    y -= 8
    draw_wrapped(consent.body_text_snapshot or "", size=10, gap=13)
    y -= 8
    c.setFont(font_name, 11)
    c.drawString(left, y, "Съгласие за обработка на лични данни")
    y -= 16
    draw_wrapped(consent.gdpr_text_snapshot or "", size=9, gap=12)
    y -= 10
    signed = consent.signed_at.strftime("%d.%m.%Y") if consent.signed_at else "—"
    draw_wrapped(f"Дата: {signed}", size=11, gap=14)
    draw_wrapped(f"Подпис: {consent.signature_name}", size=11, gap=14)
    if consent.gdpr_accepted:
        draw_wrapped("✓ Съгласен/на съм с обработката на личните данни.", size=10, gap=13)

    c.save()
    return buffer.getvalue()


def persist_consent_pdf(consent: AthleteClubConsent, club: Club | None = None) -> str:
    if club is None and consent.club_id:
        # Club may already be loaded via relationship
        club = getattr(consent, "club", None)
    pdf_bytes = build_consent_pdf(consent, club=club)
    rel = f"{consent.athlete_id}/membership_consent_{consent.id}.pdf"
    path = _documents_root() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pdf_bytes)
    return rel


def read_consent_pdf(consent: AthleteClubConsent, club: Club | None = None) -> bytes | None:
    if consent.pdf_rel_path:
        path = _documents_root() / consent.pdf_rel_path
        if path.is_file():
            return path.read_bytes()
    try:
        if club is None:
            club = getattr(consent, "club", None)
        return build_consent_pdf(consent, club=club)
    except Exception:
        return None


def consent_to_document_dict(consent: AthleteClubConsent) -> dict[str, Any]:
    return {
        "id": consent.id,
        "doc_type": "membership_consent",
        "title": "Заявление за съгласие",
        "status": "active" if consent.is_active else "revoked",
        "signed_at": consent.signed_at.isoformat() if consent.signed_at else None,
        "revoked_at": consent.revoked_at.isoformat() if consent.revoked_at else None,
        "club_name": consent.club_name_snapshot,
        "parent_full_name": consent.parent_full_name,
        "child_full_name": consent.child_full_name,
        "has_preview": True,
    }
