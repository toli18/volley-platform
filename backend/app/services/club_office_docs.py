"""PDF builders and helpers for club service notes and invoices."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from io import BytesIO
from typing import Any

from sqlalchemy.orm import Session

from app.models import Athlete, Club, ClubInvoice, ClubServiceNote

NOTE_KIND_NO_CLAIMS = "no_claims"
DEFAULT_REP_TITLE = "Председател на УС"
PAYMENT_LABELS = {
    "cash": "В брой",
    "bank": "По банков път",
    "card": "С карта",
}


def club_display_name(club: Club | None) -> str:
    if not club:
        return "Волейболен клуб"
    return (club.full_name or club.name or "Волейболен клуб").strip()


def club_address_line(club: Club | None) -> str:
    if not club:
        return ""
    parts = []
    city = (club.city or "").strip()
    addr = (club.address or "").strip()
    if city and city.lower() not in addr.lower():
        parts.append(f"град {city}" if not city.lower().startswith("град") else city)
    if addr:
        parts.append(addr)
    return ", ".join(parts)


def club_city(club: Club | None) -> str:
    if not club:
        return ""
    city = (club.city or "").strip()
    if city:
        return city.replace("град ", "").replace("гр. ", "").strip()
    addr = (club.address or "")
    for prefix in ("град ", "гр. ", "гр "):
        low = addr.lower()
        idx = low.find(prefix)
        if idx >= 0:
            rest = addr[idx + len(prefix) :]
            token = rest.replace(",", " ").split()
            if token:
                return token[0].strip(" .,")
    return ""


def compose_note_body(note: ClubServiceNote) -> str:
    if (note.custom_body or "").strip():
        return note.custom_body.strip()
    club_name = (note.club_name_snapshot or "").strip() or "клуба"
    city = (note.city or "").strip()
    city_bit = f" – {city}" if city else ""
    return (
        f"Волейболен клуб „{club_name}“{city_bit}, представляван от "
        f"{note.representative_name} – {note.representative_title}, издава настоящата "
        f"служебна бележка на {note.recipient_name}, ЕГН {note.recipient_egn}, "
        "в уверение на това, че клубът няма финансови и други претенции и задължения "
        "към състезателя и той може да бъде свободно картотекиран в други клубове "
        "в страна и извън нея."
    )


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value or "0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def normalize_invoice_items(raw: Any) -> list[dict[str, Any]]:
    items = []
    for row in raw or []:
        if not isinstance(row, dict):
            continue
        desc = str(row.get("description") or "").strip()
        if not desc:
            continue
        qty = _money(row.get("qty") if row.get("qty") not in (None, "") else 1)
        if qty <= 0:
            qty = Decimal("1.00")
        unit = str(row.get("unit") or "бр.").strip() or "бр."
        price = _money(row.get("unit_price"))
        total = (qty * price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        items.append(
            {
                "description": desc[:240],
                "qty": str(qty),
                "unit": unit[:24],
                "unit_price": str(price),
                "total": str(total),
            }
        )
    return items


def invoice_totals(inv: ClubInvoice) -> dict[str, Decimal]:
    items = normalize_invoice_items(inv.items)
    subtotal = sum((_money(i["total"]) for i in items), Decimal("0.00"))
    vat_rate = Decimal(str(inv.vat_rate or 0))
    if inv.vat_registered and vat_rate > 0:
        vat = (subtotal * vat_rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    else:
        vat = Decimal("0.00")
    return {
        "subtotal": subtotal,
        "vat": vat,
        "total": subtotal + vat,
    }


def next_invoice_number(db: Session, club_id: int, year: int) -> str:
    rows = (
        db.query(ClubInvoice.number)
        .filter(ClubInvoice.club_id == int(club_id), ClubInvoice.number.like(f"%/{year}"))
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


def next_note_number(db: Session, club_id: int, year: int) -> str:
    rows = (
        db.query(ClubServiceNote.number)
        .filter(ClubServiceNote.club_id == int(club_id), ClubServiceNote.number.like(f"%/{year}"))
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


def _bg_triplet(n: int, female: bool = False) -> str:
    ones_m = ["", "един", "два", "три", "четири", "пет", "шест", "седем", "осем", "девет"]
    ones_f = ["", "една", "две", "три", "четири", "пет", "шест", "седем", "осем", "девет"]
    teens = [
        "десет",
        "единадесет",
        "дванадесет",
        "тринадесет",
        "четиринадесет",
        "петнадесет",
        "шестнадесет",
        "седемнадесет",
        "осемнадесет",
        "деветнадесет",
    ]
    tens = ["", "", "двадесет", "тридесет", "четиридесет", "петдесет", "шестдесет", "седемдесет", "осемдесет", "деветдесет"]
    hundreds = [
        "",
        "сто",
        "двеста",
        "триста",
        "четиристотин",
        "петстотин",
        "шестстотин",
        "седемстотин",
        "осемстотин",
        "деветстотин",
    ]
    ones = ones_f if female else ones_m
    h, rem = divmod(n, 100)
    parts = []
    if h:
        parts.append(hundreds[h])
    if rem >= 10 and rem <= 19:
        parts.append(teens[rem - 10])
    else:
        t, o = divmod(rem, 10)
        if t:
            parts.append(tens[t])
        if o:
            parts.append(ones[o])
    return " ".join(p for p in parts if p)


def amount_in_words_bgn(amount: Decimal) -> str:
    whole = int(amount)
    stot = int((amount - Decimal(whole)) * 100)
    if whole == 0:
        leva = "нула лева"
    elif whole % 100 == 1 or (whole % 10 == 1 and whole % 100 != 11):
        leva = f"{_int_to_bg(whole, female=False)} лев"
    else:
        leva = f"{_int_to_bg(whole, female=False)} лева"
    if stot == 0:
        st = "нула стотинки"
    elif stot % 100 == 1 or (stot % 10 == 1 and stot % 100 != 11):
        st = f"{_int_to_bg(stot, female=True)} стотинка"
    else:
        st = f"{_int_to_bg(stot, female=True)} стотинки"
    return f"{leva} и {st}"


def _int_to_bg(n: int, female: bool = False) -> str:
    if n == 0:
        return "нула"
    millions, rest = divmod(n, 1_000_000)
    thousands, rem = divmod(rest, 1000)
    parts = []
    if millions:
        if millions == 1:
            parts.append("един милион")
        else:
            parts.append(f"{_bg_triplet(millions)} милиона")
    if thousands:
        if thousands == 1:
            parts.append("хиляда")
        else:
            parts.append(f"{_bg_triplet(thousands, female=True)} хиляди")
    if rem:
        parts.append(_bg_triplet(rem, female=female and not thousands and not millions))
    elif not parts:
        parts.append(_bg_triplet(0, female=female))
    return " ".join(parts)


def format_bg_date(value: date | datetime | None) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d.%m.%Y")


def athlete_brief(athlete: Athlete | None) -> dict[str, Any] | None:
    if not athlete:
        return None
    return {
        "id": athlete.id,
        "athlete_name": athlete.athlete_name,
        "egn": athlete.egn,
        "parent_name": athlete.parent_name,
    }


def note_to_dict(note: ClubServiceNote) -> dict[str, Any]:
    return {
        "id": note.id,
        "club_id": note.club_id,
        "athlete_id": note.athlete_id,
        "kind": note.kind,
        "number": note.number,
        "issued_at": note.issued_at.isoformat() if note.issued_at else None,
        "city": note.city,
        "recipient_name": note.recipient_name,
        "recipient_egn": note.recipient_egn,
        "representative_name": note.representative_name,
        "representative_title": note.representative_title,
        "club_name_snapshot": note.club_name_snapshot,
        "club_address_snapshot": note.club_address_snapshot,
        "custom_body": note.custom_body,
        "created_at": note.created_at.isoformat() if note.created_at else None,
        "athlete": athlete_brief(getattr(note, "athlete", None)),
    }


def invoice_to_dict(inv: ClubInvoice) -> dict[str, Any]:
    totals = invoice_totals(inv)
    return {
        "id": inv.id,
        "club_id": inv.club_id,
        "athlete_id": inv.athlete_id,
        "number": inv.number,
        "issued_at": inv.issued_at.isoformat() if inv.issued_at else None,
        "place_of_issue": inv.place_of_issue,
        "status": inv.status,
        "supplier_name": inv.supplier_name,
        "supplier_address": inv.supplier_address,
        "supplier_bulstat": inv.supplier_bulstat,
        "supplier_vat_id": inv.supplier_vat_id,
        "buyer_name": inv.buyer_name,
        "buyer_id_number": inv.buyer_id_number,
        "buyer_address": inv.buyer_address,
        "vat_registered": bool(inv.vat_registered),
        "vat_rate": inv.vat_rate,
        "currency": inv.currency,
        "payment_method": inv.payment_method,
        "bank_iban": inv.bank_iban,
        "bank_name": inv.bank_name,
        "notes": inv.notes,
        "items": normalize_invoice_items(inv.items),
        "subtotal": str(totals["subtotal"]),
        "vat": str(totals["vat"]),
        "total": str(totals["total"]),
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
        "athlete": athlete_brief(getattr(inv, "athlete", None)),
    }


def _draw_logo(c, path, x, y, size) -> None:
    if not path:
        return
    try:
        c.drawImage(str(path), x, y, width=size, height=size, mask="auto", preserveAspectRatio=True)
    except Exception:
        pass


def build_service_note_pdf(note: ClubServiceNote, club: Club | None = None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font
    from app.services.club_membership_consent import _club_logo_filesystem_path

    font = _ensure_pdf_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 22 * mm
    logo_size = 28 * mm
    club_logo = _club_logo_filesystem_path(club.logo_url if club else None, club=club)
    _draw_logo(c, club_logo, margin, height - margin - logo_size, logo_size)
    _draw_logo(c, club_logo, width - margin - logo_size, height - margin - logo_size, logo_size)

    y = height - margin - 8 * mm
    club_name = (note.club_name_snapshot or club_display_name(club)).strip()
    address = (note.club_address_snapshot or club_address_line(club)).strip()
    c.setFont(font, 11)
    c.drawCentredString(width / 2, y, "ВОЛЕЙБОЛЕН КЛУБ")
    y -= 6 * mm
    c.setFont(font, 13)
    display = club_name
    if not display.startswith("„") and not display.startswith('"'):
        display = f"„{display}“"
    c.drawCentredString(width / 2, y, display.upper())
    y -= 6 * mm
    if address:
        c.setFont(font, 9)
        c.drawCentredString(width / 2, y, address)

    y = height - margin - logo_size - 16 * mm
    c.setFont(font, 18)
    c.drawCentredString(width / 2, y, "СЛУЖЕБНА БЕЛЕЖКА")
    y -= 16 * mm

    body_left = margin + 4 * mm
    max_w = width - 2 * margin - 8 * mm
    size = 12
    leading = 7 * mm
    recipient = (note.recipient_name or "").strip()
    egn = (note.recipient_egn or "").strip()
    prefix_end = f"служебна бележка на "
    # Build styled runs from generated or custom body.
    if (note.custom_body or "").strip():
        runs = [("normal", note.custom_body.strip())]
    else:
        club_name_plain = (note.club_name_snapshot or "").strip() or "клуба"
        city = (note.city or "").strip()
        city_bit = f" – {city}" if city else ""
        runs = [
            ("normal", f"Волейболен клуб „{club_name_plain}“{city_bit}, представляван от "),
            ("normal", f"{note.representative_name} – {note.representative_title}, издава настоящата {prefix_end}"),
            ("bold", recipient),
            ("normal", ", ЕГН "),
            ("bold", egn),
            ("normal", ", в уверение на това, че клубът "),
            ("underline", "няма"),
            (
                "normal",
                " финансови и други претенции и задължения към състезателя и той може да бъде "
                "свободно картотекиран в други клубове в страна и извън нея.",
            ),
        ]

    def run_width(style: str, text: str) -> float:
        return stringWidth(text, font, size + (1 if style == "bold" else 0))

    # Wrap runs into lines of (style, text) chunks
    lines: list[list[tuple[str, str]]] = [[]]
    line_w = 0.0
    for style, text in runs:
        words = text.split(" ")
        for i, word in enumerate(words):
            piece = word if i == 0 or word == "" else f" {word}"
            w = run_width(style, piece)
            if line_w + w > max_w and lines[-1]:
                lines.append([])
                line_w = 0.0
                piece = word
                w = run_width(style, piece)
            lines[-1].append((style, piece))
            line_w += w

    for chunks in lines:
        x = body_left
        for style, text in chunks:
            use_size = size + (1 if style == "bold" else 0)
            c.setFont(font, use_size)
            c.drawString(x, y, text)
            tw = stringWidth(text, font, use_size)
            if style in ("bold", "underline"):
                c.setLineWidth(0.6 if style == "underline" else 0.8)
                c.line(x, y - 1.4, x + tw, y - 1.4)
            x += tw
        y -= leading

    y = max(y - 18 * mm, 38 * mm)
    city = (note.city or "").strip()
    issued = format_bg_date(note.issued_at)
    c.setFont(font, 11)
    left_y = y
    if city:
        c.drawString(margin, left_y, city + ",")
        left_y -= 6 * mm
    if issued:
        c.drawString(margin, left_y, f"{issued} година")

    c.setFont(font, 10)
    sig_x = width - margin - 70 * mm
    c.line(sig_x, y + 8 * mm, width - margin, y + 8 * mm)
    c.drawCentredString(sig_x + 35 * mm, y, note.representative_name or "")
    c.setFont(font, 9)
    c.drawCentredString(sig_x + 35 * mm, y - 5 * mm, note.representative_title or DEFAULT_REP_TITLE)

    c.save()
    return buf.getvalue()


def build_invoice_pdf(inv: ClubInvoice, club: Club | None = None) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font
    from app.services.club_membership_consent import _club_logo_filesystem_path

    font = _ensure_pdf_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 16 * mm
    logo_size = 22 * mm
    club_logo = _club_logo_filesystem_path(club.logo_url if club else None, club=club)
    _draw_logo(c, club_logo, margin, height - margin - logo_size, logo_size)

    y = height - margin - 6 * mm
    c.setFont(font, 16)
    title = "ФАКТУРА" if inv.status != "cancelled" else "ФАКТУРА (АНУЛИРАНА)"
    c.drawCentredString(width / 2, y, title)
    y -= 7 * mm
    c.setFont(font, 12)
    c.drawCentredString(width / 2, y, f"№ {inv.number}")
    y -= 6 * mm
    c.setFont(font, 10)
    c.drawCentredString(
        width / 2,
        y,
        f"Дата: {format_bg_date(inv.issued_at)}"
        + (f"    Място: {inv.place_of_issue}" if inv.place_of_issue else ""),
    )

    y = height - margin - logo_size - 10 * mm
    col_w = (width - 2 * margin - 6 * mm) / 2
    box_h = 32 * mm

    def box(x, title_txt, lines):
        c.setLineWidth(0.7)
        c.rect(x, y - box_h, col_w, box_h)
        c.setFont(font, 8)
        c.drawString(x + 3 * mm, y - 5 * mm, title_txt)
        c.setFont(font, 10)
        ty = y - 11 * mm
        for line in lines:
            if not line:
                continue
            c.drawString(x + 3 * mm, ty, str(line)[:52])
            ty -= 5 * mm

    box(
        margin,
        "ДОСТАВЧИК",
        [
            inv.supplier_name,
            inv.supplier_address,
            f"ЕИК/БУЛСТАТ: {inv.supplier_bulstat}" if inv.supplier_bulstat else "",
            f"ДДС №: {inv.supplier_vat_id}" if inv.supplier_vat_id else "",
        ],
    )
    box(
        margin + col_w + 6 * mm,
        "ПОЛУЧАТЕЛ",
        [
            inv.buyer_name,
            inv.buyer_address,
            f"ЕГН/ЕИК: {inv.buyer_id_number}" if inv.buyer_id_number else "",
        ],
    )
    y -= box_h + 8 * mm

    items = normalize_invoice_items(inv.items)
    cols = [
        (8 * mm, "№", "c"),
        (78 * mm, "Описание", "l"),
        (16 * mm, "Кол.", "r"),
        (16 * mm, "Мярка", "c"),
        (24 * mm, "Ед. цена", "r"),
        (24 * mm, "Стойност", "r"),
    ]
    table_w = sum(w for w, _, _ in cols)
    x0 = margin
    row_h = 7 * mm
    c.setFont(font, 8)
    c.setLineWidth(0.6)
    c.rect(x0, y - row_h, table_w, row_h)
    cx = x0
    for w, label, _align in cols:
        c.drawString(cx + 1.5 * mm, y - 4.5 * mm, label)
        cx += w
    y -= row_h
    c.setFont(font, 9)
    if not items:
        c.rect(x0, y - row_h, table_w, row_h)
        c.drawString(x0 + 10 * mm, y - 4.5 * mm, "—")
        y -= row_h
    for idx, item in enumerate(items, start=1):
        if y < 50 * mm:
            c.showPage()
            y = height - margin
        c.rect(x0, y - row_h, table_w, row_h)
        values = [
            str(idx),
            item["description"],
            item["qty"],
            item["unit"],
            item["unit_price"],
            item["total"],
        ]
        cx = x0
        for (w, _lab, align), val in zip(cols, values):
            text = str(val)
            if align == "r":
                c.drawRightString(cx + w - 1.5 * mm, y - 4.5 * mm, text)
            elif align == "c":
                c.drawCentredString(cx + w / 2, y - 4.5 * mm, text)
            else:
                while stringWidth(text, font, 9) > w - 3 * mm and len(text) > 4:
                    text = text[:-1]
                c.drawString(cx + 1.5 * mm, y - 4.5 * mm, text)
            cx += w
        y -= row_h

    totals = invoice_totals(inv)
    y -= 4 * mm
    c.setFont(font, 10)
    right = x0 + table_w
    c.drawRightString(right, y, f"Стойност: {totals['subtotal']} {inv.currency}")
    y -= 5 * mm
    if inv.vat_registered:
        c.drawRightString(right, y, f"ДДС {inv.vat_rate}%: {totals['vat']} {inv.currency}")
        y -= 5 * mm
    else:
        c.setFont(font, 8)
        c.drawString(margin, y, "Лицето не е регистрирано по ЗДДС.")
        y -= 5 * mm
        c.setFont(font, 10)
    c.setFont(font, 12)
    c.drawRightString(right, y, f"Общо: {totals['total']} {inv.currency}")
    y -= 8 * mm
    c.setFont(font, 9)
    c.drawString(margin, y, f"Словом: {amount_in_words_bgn(totals['total'])}")
    y -= 6 * mm
    pay = PAYMENT_LABELS.get(inv.payment_method or "", inv.payment_method or "")
    c.drawString(margin, y, f"Начин на плащане: {pay}")
    y -= 5 * mm
    if inv.bank_iban:
        c.drawString(margin, y, f"IBAN: {inv.bank_iban}" + (f"  {inv.bank_name}" if inv.bank_name else ""))
        y -= 5 * mm
    if inv.notes:
        c.drawString(margin, y, f"Забележка: {inv.notes[:120]}")
        y -= 8 * mm
    else:
        y -= 10 * mm

    c.setFont(font, 9)
    c.drawString(margin, y, "Съставил: ______________________")
    c.drawRightString(width - margin, y, "Получател: ______________________")

    c.save()
    return buf.getvalue()
