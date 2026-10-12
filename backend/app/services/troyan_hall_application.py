"""Месечно заявление за МФЗ „Троян“ (Приложение 12) — само ВК Троян Волей."""

from __future__ import annotations

import calendar
from datetime import date, timedelta
from io import BytesIO
from typing import Any

from sqlalchemy.orm import Session

from app.models import Club, TrainingScheduleException, TrainingScheduleRule, User
from app.services.school_excuse_note import is_troyan_volley_club

MONTH_BG = (
    "",
    "януари",
    "февруари",
    "март",
    "април",
    "май",
    "юни",
    "юли",
    "август",
    "септември",
    "октомври",
    "ноември",
    "декември",
)

TROYAN_ORG_NAME = "Волейболен клуб Троян Волей"
TROYAN_EIK = "205338036"
TROYAN_CITY = "Троян"
TROYAN_MUNICIPALITY = "Троян"
TROYAN_OBLAST = "Ловеч"
TROYAN_STREET = "Захарий Зограф № 31"
LOCATION_NEEDLE = "троян"


def event_title_for_month(year: int, month: int) -> str:
    return f"Тренировки по волейбол – месец {MONTH_BG[int(month)]} {int(year)}"


def legal_defaults(club: Club | None, current_user: User | None = None) -> dict[str, Any]:
    chairman = ""
    if club:
        chairman = (
            (getattr(club, "school_excuse_chairman_name", None) or "").strip()
            or (club.contact_name or "").strip()
        )
    if not chairman and current_user:
        chairman = (current_user.name or "").strip()
    phone = (club.contact_phone or "").strip() if club else ""
    email = (club.contact_email or "").strip() if club else ""
    eik = (club.bulstat or "").strip() if club else ""
    if not eik:
        eik = TROYAN_EIK
    org = ""
    if club:
        org = (club.full_name or club.name or "").strip()
    if not org or "троян" not in org.lower():
        org = TROYAN_ORG_NAME
    return {
        "org_name": org,
        "eik": eik,
        "city": TROYAN_CITY,
        "municipality": TROYAN_MUNICIPALITY,
        "oblast": TROYAN_OBLAST,
        "street": TROYAN_STREET,
        "representative_name": chairman,
        "phone": phone,
        "email": email,
        "hall_type": "sport",  # спортна зала
        "event_kind": "training",
        "equipment_volleyball": True,
        "rebuild_hall": False,
    }


def _norm_location(value: str | None) -> str:
    return " ".join(str(value or "").split()).strip()


def _is_troyan_location(location: str | None) -> bool:
    return LOCATION_NEEDLE in _norm_location(location).lower()


def _time_to_minutes(hhmm: str) -> int:
    parts = str(hhmm or "0:0").split(":")
    h = int(parts[0] or 0)
    m = int(parts[1] or 0) if len(parts) > 1 else 0
    return h * 60 + m


def _minutes_to_time(total: int) -> str:
    h, m = divmod(int(total), 60)
    return f"{h:02d}:{m:02d}"


def build_month_slots(db: Session, club_id: int, year: int, month: int) -> list[dict[str, Any]]:
    """Един ред на ден: обединени часове за всички тренировки с локация „Троян“."""
    year = int(year)
    month = int(month)
    last_day = calendar.monthrange(year, month)[1]
    d0 = date(year, month, 1)
    d1 = date(year, month, last_day)

    rules = (
        db.query(TrainingScheduleRule)
        .filter(
            TrainingScheduleRule.club_id == int(club_id),
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

    rule_ids = [r.id for r in rules]
    exc_rows = (
        db.query(TrainingScheduleException)
        .filter(
            TrainingScheduleException.rule_id.in_(rule_ids),
            TrainingScheduleException.date >= d0.isoformat(),
            TrainingScheduleException.date <= d1.isoformat(),
        )
        .all()
    )
    exc_by_key = {(e.rule_id, e.date): e for e in exc_rows}

    by_date: dict[str, dict[str, Any]] = {}
    for day_idx in range((d1 - d0).days + 1):
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
            exc = exc_by_key.get((r.id, cur_s))
            if exc and exc.kind == "cancelled":
                continue
            location_v = (
                _norm_location(exc.location)
                if exc and exc.kind == "override" and exc.location
                else _norm_location(r.location)
            )
            if not _is_troyan_location(location_v):
                continue
            start_v = exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
            end_v = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time
            slot = by_date.get(cur_s)
            start_m = _time_to_minutes(start_v)
            end_m = _time_to_minutes(end_v)
            if slot is None:
                by_date[cur_s] = {
                    "date": cur_s,
                    "start_time": start_v,
                    "end_time": end_v,
                    "_start_m": start_m,
                    "_end_m": end_m,
                    "session_count": 1,
                    "locations": [location_v] if location_v else [],
                }
            else:
                slot["_start_m"] = min(slot["_start_m"], start_m)
                slot["_end_m"] = max(slot["_end_m"], end_m)
                slot["start_time"] = _minutes_to_time(slot["_start_m"])
                slot["end_time"] = _minutes_to_time(slot["_end_m"])
                slot["session_count"] = int(slot["session_count"]) + 1
                if location_v and location_v not in slot["locations"]:
                    slot["locations"].append(location_v)

    out: list[dict[str, Any]] = []
    for key in sorted(by_date.keys()):
        row = by_date[key]
        hours = max(0.0, (row["_end_m"] - row["_start_m"]) / 60.0)
        out.append(
            {
                "date": row["date"],
                "date_bg": f"{row['date'][8:10]}.{row['date'][5:7]}.{row['date'][0:4]}",
                "start_time": row["start_time"],
                "end_time": row["end_time"],
                "hours": round(hours, 2),
                "session_count": row["session_count"],
                "locations": row["locations"],
                "all_day": False,
            }
        )
    return out


def preview_payload(
    db: Session,
    club: Club,
    year: int,
    month: int,
    current_user: User | None = None,
) -> dict[str, Any]:
    if not is_troyan_volley_club(club):
        raise PermissionError("Заявлението за зала Троян е само за ВК Троян Волей")
    slots = build_month_slots(db, club.id, year, month)
    defaults = legal_defaults(club, current_user)
    total_hours = round(sum(float(s["hours"]) for s in slots), 2)
    return {
        "year": int(year),
        "month": int(month),
        "month_label": MONTH_BG[int(month)],
        "event_title": event_title_for_month(year, month),
        "count": len(slots),
        "total_hours": total_hours,
        "slots": slots,
        "defaults": defaults,
        "hall_label": "Спортна зала",
        "rule": "Само тренировки с място, съдържащо „Троян“. По 1 ред на ден с обединени часове.",
    }


def build_troyan_hall_application_pdf(
    *,
    year: int,
    month: int,
    slots: list[dict[str, Any]],
    fields: dict[str, Any],
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font

    font = _ensure_pdf_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 14 * mm

    def checkbox(x: float, y: float, checked: bool, size: float = 3.2 * mm) -> None:
        c.rect(x, y, size, size, stroke=1, fill=0)
        if checked:
            c.setFont(font, 9)
            c.drawString(x + 0.5 * mm, y + 0.3 * mm, "X")

    def draw_header_and_body(start_slot_idx: int) -> int:
        """Draw form; return next slot index to draw."""
        y = height - margin
        c.setFont(font, 9)
        c.drawString(margin, y, "Приложение № 12")
        c.drawRightString(width - margin, y, "Община Троян")
        y -= 5 * mm
        c.setFont(font, 8)
        c.drawString(margin, y, "(ново, Решение № 965/17.09.2026 г.)")
        y -= 7 * mm

        c.setFont(font, 14)
        c.drawCentredString(width / 2, y, "ЗАЯВЛЕНИЕ")
        y -= 5.5 * mm
        c.setFont(font, 10)
        c.drawCentredString(width / 2, y, "ползване на спортни зали и помещения в")
        y -= 5 * mm
        c.setFont(font, 11)
        c.drawCentredString(width / 2, y, "Многофункционална спортна зала „Троян“")
        y -= 8 * mm

        org = (fields.get("org_name") or TROYAN_ORG_NAME).strip()
        eik = (fields.get("eik") or TROYAN_EIK).strip()
        city = (fields.get("city") or TROYAN_CITY).strip()
        municipality = (fields.get("municipality") or TROYAN_MUNICIPALITY).strip()
        oblast = (fields.get("oblast") or TROYAN_OBLAST).strip()
        street = (fields.get("street") or TROYAN_STREET).strip()
        rep = (fields.get("representative_name") or "").strip()
        phone = (fields.get("phone") or "").strip()
        email = (fields.get("email") or "").strip()
        event = (fields.get("event_title") or event_title_for_month(year, month)).strip()

        c.setFont(font, 9)
        c.drawString(margin, y, f"от {org}")
        y -= 5 * mm
        c.setFont(font, 8)
        c.drawString(margin, y, "(наименование на юридическото лице)")
        y -= 6 * mm
        c.setFont(font, 9)
        c.drawString(margin, y, f"ЕИК {eik}")
        y -= 5 * mm
        c.drawString(
            margin,
            y,
            f"адрес на управление: гр./с. {city}, община {municipality}, област {oblast},",
        )
        y -= 5 * mm
        c.drawString(margin, y, f"ул. (ж.к.) {street}, тел.: {phone or '—'}")
        y -= 5 * mm
        c.drawString(margin, y, f"представляван/а от {rep or '—'}")
        y -= 4.5 * mm
        c.setFont(font, 8)
        c.drawString(margin, y, "(трите имена на законния представител)")
        y -= 5 * mm
        c.setFont(font, 9)
        c.drawString(margin, y, f"e-mail: {email or '—'}")
        y -= 7 * mm

        c.setFont(font, 10)
        c.drawString(margin, y, "УВАЖАЕМА ГОСПОЖО КМЕТ,")
        y -= 6 * mm
        c.setFont(font, 9)
        c.drawString(
            margin,
            y,
            "Заявявам желание за предоставяне за ползване на следното помещение в",
        )
        y -= 4.5 * mm
        c.drawString(margin, y, "Многофункционална спортна зала „Троян“:")
        y -= 6 * mm

        checkbox(margin, y, True)
        c.drawString(margin + 5 * mm, y + 0.4 * mm, "Спортна зала")
        checkbox(margin + 45 * mm, y, False)
        c.drawString(margin + 50 * mm, y + 0.4 * mm, "Тренировъчна зала")
        checkbox(margin + 100 * mm, y, False)
        c.drawString(margin + 105 * mm, y + 0.4 * mm, "Конферентна зала")
        y -= 6 * mm

        c.drawString(margin, y, f"за провеждане на: {event}")
        y -= 5.5 * mm
        c.drawString(margin, y, "вид на събитието:")
        y -= 5.5 * mm
        checkbox(margin, y, True)
        c.drawString(margin + 5 * mm, y + 0.4 * mm, "Тренировки")
        checkbox(margin + 40 * mm, y, False)
        c.drawString(margin + 45 * mm, y + 0.4 * mm, "Спортни турнири/състезания")
        checkbox(margin + 105 * mm, y, False)
        c.drawString(margin + 110 * mm, y + 0.4 * mm, "Други")
        y -= 6 * mm

        c.setFont(font, 9)
        c.drawString(margin, y, "дати и часове за ползване:")
        y -= 5 * mm

        # Table header
        col_w = [32 * mm, 28 * mm, 28 * mm, 70 * mm]
        headers = ["Дата", "Начален час", "Краен час", "Целодневно ползване"]
        row_h = 6 * mm
        x0 = margin
        c.setFont(font, 8)
        x = x0
        for i, htxt in enumerate(headers):
            c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
            c.drawString(x + 1.5 * mm, y - row_h + 1.8 * mm, htxt)
            x += col_w[i]
        y -= row_h

        idx = start_slot_idx
        while idx < len(slots):
            if y < margin + 55 * mm:
                break
            slot = slots[idx]
            vals = [
                slot.get("date_bg") or slot.get("date") or "",
                slot.get("start_time") or "",
                slot.get("end_time") or "",
                "",
            ]
            x = x0
            for i, val in enumerate(vals):
                c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
                c.drawString(x + 1.5 * mm, y - row_h + 1.8 * mm, str(val))
                if i == 3:
                    checkbox(x + 3 * mm, y - row_h + 1.5 * mm, False, size=2.8 * mm)
                x += col_w[i]
            y -= row_h
            idx += 1

        if start_slot_idx == 0:
            y -= 5 * mm
            c.setFont(font, 9)
            c.drawString(margin, y, "За провеждането на събитието е необходимо:")
            y -= 5.5 * mm
            checkbox(margin, y, False)
            c.drawString(margin + 5 * mm, y + 0.3 * mm, "Баскетбол")
            checkbox(margin + 35 * mm, y, True)
            c.drawString(margin + 40 * mm, y + 0.3 * mm, "Волейбол")
            checkbox(margin + 70 * mm, y, False)
            c.drawString(margin + 75 * mm, y + 0.3 * mm, "Тенис")
            y -= 5.5 * mm
            checkbox(margin, y, False)
            c.drawString(margin + 5 * mm, y + 0.3 * mm, "Винилова настилка / озвучаване / табла")
            y -= 6 * mm
            c.drawString(margin, y, "Изисква се преустройство на залата:")
            checkbox(margin + 70 * mm, y, False)
            c.drawString(margin + 75 * mm, y + 0.3 * mm, "ДА")
            checkbox(margin + 90 * mm, y, True)
            c.drawString(margin + 95 * mm, y + 0.3 * mm, "НЕ")
            y -= 7 * mm

            c.setFont(font, 8)
            c.drawString(margin, y, "Цени (по Наредба № 7) — без промяна:")
            y -= 4.5 * mm
            c.drawString(
                margin,
                y,
                "Спортна зала: 8,00 €/час (местни клубове) · Тренировъчна: 5,00 €/час · Конферентна: 15,00 €/час",
            )
            y -= 4.5 * mm
            c.drawString(
                margin,
                y,
                "Плащане до 3 работни дни след Разрешение: каса Община Троян / ПОС / IBAN BG92UBBS81558420008108",
            )
            y -= 8 * mm

            today = date.today()
            c.setFont(font, 9)
            c.drawString(margin, y, f"Дата: {today.day:02d}.{today.month:02d}.{today.year} г.    гр. Троян")
            c.drawRightString(width - margin, y, "С уважение: ........................")
            y -= 5 * mm
            c.setFont(font, 8)
            c.drawRightString(width - margin, y, f"{rep or 'Председател'}  (подпис)")
            y -= 4 * mm
            if idx < len(slots):
                c.setFont(font, 8)
                c.drawString(margin, y, f"Продължение на таблицата — още {len(slots) - idx} дати на следваща страница.")

        return idx

    next_idx = 0
    page = 0
    while True:
        page += 1
        if page > 1:
            c.setFont(font, 9)
            c.drawString(margin, height - margin, f"Приложение № 12 — продължение (стр. {page})")
            c.drawCentredString(width / 2, height - margin - 6 * mm, "дати и часове за ползване (продължение)")
            # continuation table only
            y = height - margin - 12 * mm
            col_w = [32 * mm, 28 * mm, 28 * mm, 70 * mm]
            headers = ["Дата", "Начален час", "Краен час", "Целодневно ползване"]
            row_h = 6 * mm
            c.setFont(font, 8)
            x = margin
            for i, htxt in enumerate(headers):
                c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
                c.drawString(x + 1.5 * mm, y - row_h + 1.8 * mm, htxt)
                x += col_w[i]
            y -= row_h
            while next_idx < len(slots) and y >= margin + 15 * mm:
                slot = slots[next_idx]
                vals = [
                    slot.get("date_bg") or slot.get("date") or "",
                    slot.get("start_time") or "",
                    slot.get("end_time") or "",
                    "",
                ]
                x = margin
                for i, val in enumerate(vals):
                    c.rect(x, y - row_h, col_w[i], row_h, stroke=1, fill=0)
                    c.drawString(x + 1.5 * mm, y - row_h + 1.8 * mm, str(val))
                    if i == 3:
                        checkbox(x + 3 * mm, y - row_h + 1.5 * mm, False, size=2.8 * mm)
                    x += col_w[i]
                y -= row_h
                next_idx += 1
            if next_idx < len(slots):
                c.showPage()
                continue
            break

        next_idx = draw_header_and_body(0)
        if next_idx < len(slots):
            c.showPage()
            continue
        break

    c.save()
    return buf.getvalue()
