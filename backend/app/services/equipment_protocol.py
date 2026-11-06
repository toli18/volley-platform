"""Приемо-предавателен протокол за състезателна екипировка."""

from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, AthleteEquipmentProtocol, Club

STATUS_ISSUED = "issued"
STATUS_RETURNED = "returned"

DEFAULT_ITEM_LABELS = {
    "kit": "Състезателен екип",
}


def current_sport_season(today: date | None = None) -> str:
    d = today or date.today()
    if d.month >= 8:
        return f"{d.year}/{d.year + 1}"
    return f"{d.year - 1}/{d.year}"


def normalize_items(raw: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in raw or []:
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "").strip()[:32]
        label = str(row.get("label") or DEFAULT_ITEM_LABELS.get(key) or "").strip()
        if not label:
            continue
        try:
            qty = int(row.get("qty") or 1)
        except (TypeError, ValueError):
            qty = 1
        if qty < 1:
            qty = 1
        if qty > 99:
            qty = 99
        unit = str(row.get("unit") or "бр.").strip()[:16] or "бр."
        note = str(row.get("note") or "").strip()[:120]
        item = {
            "key": key or f"item_{len(out) + 1}",
            "label": label[:120],
            "qty": qty,
            "unit": unit,
        }
        if note:
            item["note"] = note
        out.append(item)
    return out


def next_protocol_number(db: Session, club_id: int, year: int) -> str:
    rows = (
        db.query(AthleteEquipmentProtocol.number)
        .filter(
            AthleteEquipmentProtocol.club_id == int(club_id),
            AthleteEquipmentProtocol.number.like(f"%/{year}"),
        )
        .all()
    )
    max_n = 0
    suffix = f"/{year}"
    for (num,) in rows:
        raw = str(num or "")
        if not raw.endswith(suffix):
            continue
        head = raw[: -len(suffix)].lstrip("0") or "0"
        if head.isdigit():
            max_n = max(max_n, int(head))
    return f"{max_n + 1:04d}/{year}"


def protocol_to_dict(row: AthleteEquipmentProtocol, *, include_signatures: bool = False) -> dict[str, Any]:
    data = {
        "id": row.id,
        "club_id": row.club_id,
        "athlete_id": row.athlete_id,
        "coach_user_id": row.coach_user_id,
        "return_coach_user_id": row.return_coach_user_id,
        "number": row.number,
        "season": row.season,
        "status": row.status,
        "issued_at": row.issued_at.isoformat() if row.issued_at else None,
        "returned_at": row.returned_at.isoformat() if row.returned_at else None,
        "city": row.city,
        "notes": row.notes,
        "items": normalize_items(row.items),
        "athlete_name_snapshot": row.athlete_name_snapshot,
        "club_name_snapshot": row.club_name_snapshot,
        "coach_name_snapshot": row.coach_name_snapshot,
        "return_coach_name_snapshot": row.return_coach_name_snapshot,
        "recipient_signer_role": row.recipient_signer_role,
        "recipient_signer_name": row.recipient_signer_name,
        "has_recipient_signature": bool(row.signature_recipient_data),
        "has_coach_signature": bool(row.signature_coach_data),
        "has_return_recipient_signature": bool(row.signature_return_recipient_data),
        "has_return_coach_signature": bool(row.signature_return_coach_data),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
    if include_signatures:
        data["signature_flags_only"] = True
    return data


def items_summary(items: list[dict[str, Any]] | None) -> str:
    parts = []
    for row in normalize_items(items):
        bit = f"{row['label']} ×{row['qty']}"
        if row.get("note"):
            bit = f"{bit} ({row['note']})"
        parts.append(bit)
    return "; ".join(parts)


def _format_bg_date(value: date | datetime | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d.%m.%Y")


def _draw_sig(c, blob: bytes | None, x: float, y: float, w: float, h: float) -> None:
    if not blob:
        return
    try:
        from reportlab.lib.utils import ImageReader

        img = ImageReader(BytesIO(blob))
        c.drawImage(img, x, y, width=w, height=h, mask="auto", preserveAspectRatio=True, anchor="sw")
    except Exception:
        pass


def build_equipment_protocol_pdf(row: AthleteEquipmentProtocol, club: Club | None = None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font
    from app.services.club_membership_consent import _club_logo_filesystem_path
    from app.services.club_office_docs import _draw_logo, club_display_name

    font = _ensure_pdf_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    y = height - margin

    club_logo = _club_logo_filesystem_path(club.logo_url if club else None, club=club)
    _draw_logo(c, club_logo, margin, y - 24 * mm, 22 * mm)

    club_name = (row.club_name_snapshot or "").strip() or club_display_name(club)
    c.setFont(font, 12)
    c.drawString(margin + 28 * mm, y - 8 * mm, club_name)
    c.setFont(font, 9)
    c.drawString(margin + 28 * mm, y - 13 * mm, "Приемо-предавателен протокол за състезателна екипировка")
    if row.number:
        c.drawRightString(width - margin, y - 8 * mm, f"№ {row.number}")
    c.drawRightString(width - margin, y - 13 * mm, f"Сезон {row.season}")

    y -= 32 * mm
    c.setStrokeColorRGB(0.75, 0.78, 0.82)
    c.setLineWidth(0.6)
    c.line(margin, y, width - margin, y)
    y -= 10 * mm

    c.setFillColorRGB(0.1, 0.12, 0.16)
    c.setFont(font, 10)
    lines = [
        f"Дата на предаване: {_format_bg_date(row.issued_at)}"
        + (f" · {row.city}" if (row.city or "").strip() else ""),
        f"Състезател: {(row.athlete_name_snapshot or '').strip() or '—'}",
        f"Предаващ треньор: {(row.coach_name_snapshot or '').strip() or '—'}",
        f"Статус: {'Върнато' if row.status == STATUS_RETURNED else 'Предадено (очаква връщане)'}",
    ]
    if row.returned_at:
        lines.append(
            f"Дата на връщане: {_format_bg_date(row.returned_at)}"
            + (f" · пред {(row.return_coach_name_snapshot or '').strip()}" if row.return_coach_name_snapshot else "")
        )
    for line in lines:
        c.drawString(margin, y, line.replace("—", "-"))
        y -= 6 * mm

    y -= 2 * mm
    c.setFont(font, 11)
    c.drawString(margin, y, "Опис на екипировката")
    y -= 7 * mm
    c.setFont(font, 10)
    for idx, item in enumerate(normalize_items(row.items), start=1):
        note = f" · {item['note']}" if item.get("note") else ""
        c.drawString(margin, y, f"{idx}. {item['label']} - {item['qty']} {item['unit']}{note}")
        y -= 5.5 * mm
        if y < 70 * mm:
            c.showPage()
            y = height - margin
            c.setFont(font, 10)

    y -= 3 * mm
    c.setFont(font, 9)
    obligation = (
        "Получателят се задължава да върне описаната екипировка в края на сезона "
        "в изправно състояние пред треньора на клуба."
    )
    from reportlab.pdfbase.pdfmetrics import stringWidth

    words = obligation.split()
    line = ""
    for w in words:
        trial = f"{line} {w}".strip()
        if stringWidth(trial, font, 9) > (width - 2 * margin):
            c.drawString(margin, y, line)
            y -= 5 * mm
            line = w
        else:
            line = trial
    if line:
        c.drawString(margin, y, line)
        y -= 8 * mm

    if (row.notes or "").strip():
        c.setFont(font, 9)
        c.drawString(margin, y, f"Бележки: {row.notes.strip()[:280]}")
        y -= 8 * mm

    if y < 55 * mm:
        c.showPage()
        y = height - margin

    sig_w = 55 * mm
    sig_h = 18 * mm
    left_x = margin
    right_x = width / 2 + 4 * mm

    c.setFont(font, 9)
    role_label = "родител" if row.recipient_signer_role == "parent" else "състезател"
    recipient_title = f"Подпис получател ({role_label})"
    if row.recipient_signer_name:
        recipient_title = f"{recipient_title}: {row.recipient_signer_name}"
    c.drawString(left_x, y, recipient_title)
    c.drawString(right_x, y, f"Подпис треньор: {(row.coach_name_snapshot or '').strip()}")
    y -= 3 * mm
    _draw_sig(c, row.signature_recipient_data, left_x, y - sig_h, sig_w, sig_h)
    _draw_sig(c, row.signature_coach_data, right_x, y - sig_h, sig_w, sig_h)
    y -= sig_h + 6 * mm
    c.setStrokeColorRGB(0.6, 0.62, 0.66)
    c.line(left_x, y, left_x + sig_w, y)
    c.line(right_x, y, right_x + sig_w, y)
    y -= 10 * mm

    if row.status == STATUS_RETURNED:
        if y < 55 * mm:
            c.showPage()
            y = height - margin
        c.setFont(font, 10)
        c.drawString(margin, y, "Връщане на екипировката")
        y -= 6 * mm
        c.setFont(font, 9)
        c.drawString(left_x, y, "Подпис при връщане (получател)")
        c.drawString(right_x, y, f"Подпис треньор: {(row.return_coach_name_snapshot or '').strip()}")
        y -= 3 * mm
        _draw_sig(c, row.signature_return_recipient_data, left_x, y - sig_h, sig_w, sig_h)
        _draw_sig(c, row.signature_return_coach_data, right_x, y - sig_h, sig_w, sig_h)
        y -= sig_h + 6 * mm
        c.line(left_x, y, left_x + sig_w, y)
        c.line(right_x, y, right_x + sig_w, y)

    c.showPage()
    c.save()
    return buf.getvalue()


def athlete_display_name(athlete: Athlete) -> str:
    parts = [
        (getattr(athlete, "first_name", None) or "").strip(),
        (getattr(athlete, "middle_name", None) or "").strip(),
        (getattr(athlete, "last_name", None) or "").strip(),
    ]
    composed = " ".join(p for p in parts if p)
    return composed or (athlete.athlete_name or "").strip() or f"Състезател #{athlete.id}"
