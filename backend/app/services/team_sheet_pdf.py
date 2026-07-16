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


def build_team_sheet_pdf(payload: TeamSheetPayload) -> bytes:
    font = _ensure_pdf_font()
    page = landscape(A4)
    width, height = page
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=page)

    left = 12 * mm
    right = width - 12 * mm
    top = height - 10 * mm

    branding = _branding_dir()
    fed_logo = branding / "bfvb-logo.png"
    platform_logo = branding / "platform-logo.png"
    logo_h = 16 * mm
    if fed_logo.is_file():
        c.drawImage(str(fed_logo), left, top - logo_h, width=16 * mm, height=logo_h, mask="auto", preserveAspectRatio=True)
    if platform_logo.is_file():
        c.drawImage(
            str(platform_logo),
            right - 18 * mm,
            top - logo_h,
            width=16 * mm,
            height=logo_h,
            mask="auto",
            preserveAspectRatio=True,
        )

    c.setFont(font, 13)
    c.drawCentredString(width / 2, top - 6 * mm, "Българска федерация по волейбол")
    c.setFont(font, 10)
    c.drawCentredString(width / 2, top - 11 * mm, "Отборна регистрационна форма О-2")

    gender_x = width / 2 + 55 * mm
    c.setFont(font, 9)
    c.rect(gender_x, top - 12 * mm, 4 * mm, 4 * mm)
    if payload.gender_male:
        c.setFont(font, 10)
        c.drawString(gender_x + 0.7 * mm, top - 11.2 * mm, "X")
    c.setFont(font, 9)
    c.drawString(gender_x + 6 * mm, top - 11.2 * mm, "М")
    c.rect(gender_x + 14 * mm, top - 12 * mm, 4 * mm, 4 * mm)
    if payload.gender_female:
        c.setFont(font, 10)
        c.drawString(gender_x + 14.7 * mm, top - 11.2 * mm, "X")
    c.setFont(font, 9)
    c.drawString(gender_x + 20 * mm, top - 11.2 * mm, "Ж")

    y = top - 22 * mm
    c.setFont(font, 9)

    def field(label: str, value: str, x: float, w: float):
        c.drawString(x, y, f"{label}:")
        c.line(x + 22 * mm, y - 1, x + w, y - 1)
        c.drawString(x + 24 * mm, y, value or "")

    field("Клуб", payload.club_name, left, 95 * mm)
    field("Състезание", payload.competition, left + 100 * mm, 95 * mm)
    field("Град", payload.city, left + 200 * mm, 70 * mm)

    y -= 8 * mm
    field("Дата", payload.sheet_date, left, 60 * mm)
    field("Възраст", payload.age_group, left + 70 * mm, 70 * mm)
    field("Град", payload.venue_city or payload.city, left + 150 * mm, 80 * mm)

    players = list(payload.players or [])
    # Keep enough blank rows for handwriting (min 14 like the form).
    while len(players) < 14:
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
                "",  # SEK always empty for now
            ]
        )

    col_widths = [18 * mm, 38 * mm, 38 * mm, 32 * mm, 42 * mm, 18 * mm, 18 * mm, 32 * mm]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, -1), font),
                ("FONTSIZE", (0, 0), (-1, 0), 7),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.92, 0.92, 0.92)),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.black),
                ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 2),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    table_width = sum(col_widths)
    table_x = (width - table_width) / 2
    _, table_h = table.wrapOn(c, table_width, height)
    table.drawOn(c, table_x, y - 10 * mm - table_h)

    footer_top = y - 14 * mm - table_h
    c.setFont(font, 8)
    staff_x = left
    staff_lines = [
        ("Ръководител", payload.manager),
        ("Старши-треньор", payload.head_coach),
        ("Помощник-треньор 1", payload.assistant_1),
        ("Помощник-треньор 2", payload.assistant_2),
        ("Физиотерапевт", payload.physio),
        ("Лекар", payload.doctor),
        ("Дата", payload.sheet_date),
    ]
    sy = footer_top
    for label, value in staff_lines:
        c.drawString(staff_x, sy, f"{label}: {value or '________________'}")
        sy -= 5 * mm

    c.drawString(left + 95 * mm, footer_top, f"Цвят на екип: {payload.jersey_color or '____________'}")
    c.drawString(left + 95 * mm, footer_top - 12 * mm, "Президент/оторизиран представител на клуба:")
    c.line(left + 95 * mm, footer_top - 20 * mm, left + 180 * mm, footer_top - 20 * mm)

    c.setFont(font, 7)
    c.drawString(left, 8 * mm, "Volley Coach Platform · Българска федерация по волейбол")

    c.showPage()
    c.save()
    return buf.getvalue()


def split_athlete_name(full_name: str) -> tuple[str, str]:
    return _split_name(full_name)


def format_sheet_date(d: Optional[date] = None) -> str:
    value = d or date.today()
    return value.strftime("%d.%m.%Y")
