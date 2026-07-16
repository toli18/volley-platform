from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from io import BytesIO
from pathlib import Path
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Table, TableStyle

from app.routers.fees import _ensure_pdf_font

MAX_PLAYERS = 14
LINE = colors.Color(0.35, 0.42, 0.52)
SOFT_FILL = colors.Color(0.97, 0.98, 0.99)
HEADER_FILL = colors.Color(0.90, 0.93, 0.96)
ACCENT = colors.Color(0.12, 0.45, 0.35)


@dataclass
class TeamSheetPlayerRow:
    jersey: str = ""
    last_name: str = ""
    first_name: str = ""
    birth_year: str = ""
    place_of_birth: str = ""
    height: str = ""
    reach: str = ""
    sek: str = ""


@dataclass
class TeamSheetPayload:
    club_name: str = ""
    competition: str = ""
    city: str = ""
    sheet_date: str = ""
    age_group: str = ""
    venue_city: str = ""
    gender_male: bool = False
    gender_female: bool = False
    jersey_color: str = ""
    head_coach: str = ""
    assistant_1: str = ""
    assistant_2: str = ""
    manager: str = ""
    physio: str = ""
    doctor: str = ""
    players: list[TeamSheetPlayerRow] | None = None


def _branding_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "static" / "branding"


def _split_name(full_name: str) -> tuple[str, str]:
    parts = [p for p in str(full_name or "").strip().split() if p]
    if not parts:
        return "", ""
    if len(parts) == 1:
        return "", parts[0]
    return parts[-1], " ".join(parts[:-1])


def _round_box(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    h: float,
    radius: float = 3.5,
    fill=SOFT_FILL,
) -> None:
    c.setStrokeColor(LINE)
    c.setFillColor(fill)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def _labeled_box(
    c: canvas.Canvas,
    font: str,
    label: str,
    value: str,
    x: float,
    y: float,
    w: float,
    h: float = 10.5 * mm,
) -> None:
    _round_box(c, x, y, w, h, radius=3.5, fill=colors.white)
    c.setFillColor(colors.Color(0.35, 0.42, 0.52))
    c.setFont(font, 7.5)
    c.drawString(x + 2.4 * mm, y + h - 3.8 * mm, label)
    c.setFillColor(colors.black)
    c.setFont(font, 10.5)
    text = (value or "").strip()
    max_chars = max(8, int((w - 4.5 * mm) / 2.05))
    if len(text) > max_chars:
        text = text[: max_chars - 1] + "…"
    c.drawString(x + 2.4 * mm, y + 2.4 * mm, text)


def _gender_chip(c: canvas.Canvas, font: str, x: float, y: float, label: str, checked: bool) -> None:
    w, h = 16 * mm, 7.5 * mm
    c.setStrokeColor(LINE)
    c.setFillColor(colors.Color(0.88, 0.95, 0.90) if checked else SOFT_FILL)
    c.setLineWidth(0.9)
    c.roundRect(x, y, w, h, 3.5, stroke=1, fill=1)
    c.setFillColor(colors.black)
    c.setFont(font, 9.5)
    mark = "✓ " if checked else ""
    c.drawCentredString(x + w / 2, y + 2.3 * mm, f"{mark}{label}")


def build_team_sheet_pdf(payload: TeamSheetPayload) -> bytes:
    font = _ensure_pdf_font()
    page = landscape(A4)
    width, height = page
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=page)

    margin = 8 * mm
    left = margin
    right = width - margin
    content_w = right - left

    # Outer page frame
    c.setStrokeColor(colors.Color(0.78, 0.84, 0.90))
    c.setLineWidth(1.3)
    c.roundRect(4.5 * mm, 4.5 * mm, width - 9 * mm, height - 9 * mm, 8, stroke=1, fill=0)

    top = height - 9 * mm
    branding = _branding_dir()
    fed_logo = branding / "bfvb-logo.png"
    platform_logo = branding / "platform-logo.png"
    logo_h = 15 * mm
    if fed_logo.is_file():
        c.drawImage(str(fed_logo), left, top - logo_h, width=15 * mm, height=logo_h, mask="auto", preserveAspectRatio=True)
    if platform_logo.is_file():
        c.drawImage(
            str(platform_logo),
            right - 17 * mm,
            top - logo_h,
            width=15 * mm,
            height=logo_h,
            mask="auto",
            preserveAspectRatio=True,
        )

    c.setFillColor(ACCENT)
    c.setFont(font, 15)
    c.drawCentredString(width / 2, top - 5.5 * mm, "Българска федерация по волейбол")
    c.setFillColor(colors.Color(0.25, 0.32, 0.40))
    c.setFont(font, 11)
    c.drawCentredString(width / 2, top - 11 * mm, "Отборна регистрационна форма О-2")

    _gender_chip(c, font, width / 2 + 52 * mm, top - 13 * mm, "М", payload.gender_male)
    _gender_chip(c, font, width / 2 + 70 * mm, top - 13 * mm, "Ж", payload.gender_female)

    meta_top = top - 18 * mm
    meta_h = 26 * mm
    _round_box(c, left, meta_top - meta_h, content_w, meta_h, radius=5)

    box_h = 10.5 * mm
    gap = 2.2 * mm
    row1_y = meta_top - 2.2 * mm - box_h
    row2_y = row1_y - box_h - gap

    w1, w2 = 82 * mm, 100 * mm
    w3 = content_w - w1 - w2 - 2 * gap - 5 * mm
    _labeled_box(c, font, "Клуб", payload.club_name, left + 2.5 * mm, row1_y, w1)
    _labeled_box(c, font, "Състезание", payload.competition, left + 2.5 * mm + w1 + gap, row1_y, w2)
    _labeled_box(c, font, "Град (клуб)", payload.city, left + 2.5 * mm + w1 + gap + w2 + gap, row1_y, w3)

    w4, w5 = 58 * mm, 72 * mm
    w6 = content_w - w4 - w5 - 2 * gap - 5 * mm
    _labeled_box(c, font, "Дата", payload.sheet_date, left + 2.5 * mm, row2_y, w4)
    _labeled_box(c, font, "Възраст", payload.age_group, left + 2.5 * mm + w4 + gap, row2_y, w5)
    _labeled_box(
        c,
        font,
        "Място / град на състезанието",
        payload.venue_city or payload.city,
        left + 2.5 * mm + w4 + gap + w5 + gap,
        row2_y,
        w6,
    )

    players = list(payload.players or [])[:MAX_PLAYERS]
    while len(players) < MAX_PLAYERS:
        players.append(TeamSheetPlayerRow())

    header = [
        "№ екип",
        "Фамилия",
        "Собствено име",
        "Година на раждане",
        "Място на раждане",
        "Ръст",
        "Разтег",
        "Индив. № в СЕК",
    ]
    data = [header]
    for p in players:
        data.append(
            [
                p.jersey or "",
                p.last_name,
                p.first_name,
                p.birth_year,
                p.place_of_birth,
                p.height,
                p.reach,
                "",
            ]
        )

    # Use nearly full content width for a larger table
    usable = content_w - 2 * mm
    ratios = [0.07, 0.17, 0.17, 0.13, 0.18, 0.08, 0.08, 0.12]
    col_widths = [usable * r for r in ratios]
    row_h = 7.2 * mm
    table = Table(data, colWidths=col_widths, rowHeights=[8.2 * mm] + [row_h] * MAX_PLAYERS, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("FONTSIZE", (0, 1), (-1, -1), 10.5),
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.Color(0.2, 0.28, 0.36)),
                ("BOX", (0, 0), (-1, -1), 1.1, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.55, colors.Color(0.72, 0.78, 0.86)),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("ALIGN", (0, 1), (0, -1), "CENTER"),
                ("ALIGN", (3, 1), (3, -1), "CENTER"),
                ("ALIGN", (5, 1), (6, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.Color(0.97, 0.98, 0.99)]),
            ]
        )
    )
    table_width = sum(col_widths)
    table_x = left + (content_w - table_width) / 2
    table_top = meta_top - meta_h - 3.5 * mm
    _, table_h = table.wrapOn(c, table_width, height)
    table.drawOn(c, table_x, table_top - table_h)

    c.setStrokeColor(LINE)
    c.setLineWidth(1.1)
    c.roundRect(table_x - 1.2 * mm, table_top - table_h - 1.2 * mm, table_width + 2.4 * mm, table_h + 2.4 * mm, 4, stroke=1, fill=0)

    footer_top = table_top - table_h - 4.5 * mm
    footer_h = 32 * mm
    _round_box(c, left, footer_top - footer_h, content_w, footer_h, radius=5)

    staff_box_h = 9 * mm
    staff_y1 = footer_top - 2.5 * mm - staff_box_h
    staff_y2 = staff_y1 - staff_box_h - 1.8 * mm
    staff_y3 = staff_y2 - staff_box_h - 1.8 * mm

    sw = (content_w - 7 * mm) / 3
    _labeled_box(c, font, "Ръководител", payload.manager, left + 2.5 * mm, staff_y1, sw, h=staff_box_h)
    _labeled_box(c, font, "Старши-треньор", payload.head_coach, left + 2.5 * mm + sw + gap, staff_y1, sw, h=staff_box_h)
    _labeled_box(c, font, "Цвят на екип", payload.jersey_color, left + 2.5 * mm + 2 * (sw + gap), staff_y1, sw, h=staff_box_h)

    _labeled_box(c, font, "Помощник-треньор 1", payload.assistant_1, left + 2.5 * mm, staff_y2, sw, h=staff_box_h)
    _labeled_box(c, font, "Помощник-треньор 2", payload.assistant_2, left + 2.5 * mm + sw + gap, staff_y2, sw, h=staff_box_h)
    _labeled_box(c, font, "Физиотерапевт", payload.physio, left + 2.5 * mm + 2 * (sw + gap), staff_y2, sw, h=staff_box_h)

    _labeled_box(c, font, "Лекар", payload.doctor, left + 2.5 * mm, staff_y3, sw, h=staff_box_h)
    _labeled_box(c, font, "Дата", payload.sheet_date, left + 2.5 * mm + sw + gap, staff_y3, sw * 0.7, h=staff_box_h)
    sig_x = left + 2.5 * mm + sw + gap + sw * 0.7 + gap
    sig_w = right - 2.5 * mm - sig_x
    _labeled_box(c, font, "Президент / оторизиран представител", "", sig_x, staff_y3, sig_w, h=staff_box_h)

    c.setFillColor(colors.Color(0.45, 0.52, 0.60))
    c.setFont(font, 7.5)
    c.drawCentredString(width / 2, 6.5 * mm, "Volley Coach Platform · Българска федерация по волейбол · макс. 14 състезатели")

    c.showPage()
    c.save()
    return buf.getvalue()


def split_athlete_name(full_name: str) -> tuple[str, str]:
    return _split_name(full_name)


def format_sheet_date(d: Optional[date] = None) -> str:
    value = d or date.today()
    return value.strftime("%d.%m.%Y")
