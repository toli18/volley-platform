"""Club membership consent (Заявление) — defaults, resolve, PDF, lookups."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteClubConsent, Club

DEFAULT_FEE_AMOUNT = 30
DEFAULT_FEE_DUE_DAY = 10

DEFAULT_BODY_TEMPLATE = (
    "Желая синът/дъщерята ми да бъде приет/а като състезател във {club_name} "
    "и да участва в тренировъчния процес, организиран от клуба.\n\n"
    "Запознат/а съм с Устава на клуба и приетите в него правила и ще ги спазвам. "
    "Синът/дъщерята ми декларира, че ще изпълнява съвестно и отговорно поставените "
    "задачи и указания в тренировъчния процес, като ще поддържа добър тон и отношение "
    "към останалите състезатели.\n\n"
    "Съгласен/на съм да заплащам месечна такса в размер на {fee_amount} лв. "
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


def _fill(template: str, club_name: str, fee_amount: int, fee_due_day: int) -> str:
    return (
        (template or "")
        .replace("{club_name}", club_name)
        .replace("{fee_amount}", str(fee_amount))
        .replace("{fee_due_day}", str(fee_due_day))
    )


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
        "fee_amount": fee_amount,
        "fee_due_day": fee_due_day,
        "addressee": _fill(addressee_raw, club_name, fee_amount, fee_due_day),
        "body_text": _fill(body_raw, club_name, fee_amount, fee_due_day),
        "gdpr_text": _fill(gdpr_raw, club_name, fee_amount, fee_due_day),
        "addressee_template": club.membership_consent_addressee,
        "body_template": club.membership_consent_body,
        "gdpr_template": club.membership_consent_gdpr,
    }


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
    return q.first()


def athlete_needs_membership_consent(db: Session, athlete: Athlete) -> bool:
    if not athlete.club_id:
        return False
    return get_active_consent(db, athlete.id, athlete.club_id) is None


def build_consent_pdf(consent: AthleteClubConsent) -> bytes:
    """Generate a simple Cyrillic PDF snapshot of the signed application."""
    from io import BytesIO

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font

    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    left = 45
    max_width = width - 90
    y = height - 50

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


def persist_consent_pdf(consent: AthleteClubConsent) -> str:
    pdf_bytes = build_consent_pdf(consent)
    rel = f"{consent.athlete_id}/membership_consent_{consent.id}.pdf"
    path = _documents_root() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pdf_bytes)
    return rel


def read_consent_pdf(consent: AthleteClubConsent) -> bytes | None:
    if consent.pdf_rel_path:
        path = _documents_root() / consent.pdf_rel_path
        if path.is_file():
            return path.read_bytes()
    try:
        return build_consent_pdf(consent)
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
