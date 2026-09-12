"""Извинителни бележки за училище — шаблон, PDF on-demand."""

from __future__ import annotations

import re
from datetime import date, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from app.competition_kinds import competition_kind_label
from app.models import Athlete, Club, ClubCompetitionEvent
from app.settings import settings

# Сдружение ВК Троян Волей — фиксиран подпис в git (без canvas)
TROYAN_BVF_CLUB_ID = 167

DEFAULT_BODY_TEMPLATE = """Уважаеми Г-н/Г-жо Директор,

на {period_from} в {event_city} се проведоха {event_description}. В отборите бяха включени състезатели от повереното Ви училище:

• {student_name}, {student_class} клас

С настоящата и на основание НАРЕДБА ЗА ПРИОБЩАВАЩОТО ОБРАЗОВАНИЕ. В сила от 27.10.2017 г. Приета с ПМС № 232 от 20.10.2017 г. Обн. ДВ. бр.86 от 27 Октомври 2017г. чл. 62, ал. 1, т. 2, Ви Моля отсъствията на гореспоменатите ученици в периода {period_from} – {period_to} да бъдат извинени."""


def school_excuse_assets_dir() -> Path:
    base = Path(settings.storage_path).resolve() / "school_excuse"
    base.mkdir(parents=True, exist_ok=True)
    return base


def _app_static_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "static"


def is_troyan_volley_club(club: Club | None) -> bool:
    if not club:
        return False
    if getattr(club, "bvf_club_id", None) == TROYAN_BVF_CLUB_ID:
        return True
    name = (club.name or "").lower()
    return "троян" in name and "волей" in name


def bundled_school_excuse_signature_path(club: Club | None) -> Path | None:
    """Фиксиран подпис от repo — само за Троян (deploy-safe)."""
    if not is_troyan_volley_club(club):
        return None
    for name in (f"{TROYAN_BVF_CLUB_ID}.png", "troyan.png"):
        path = _app_static_dir() / "school-excuse-signatures" / name
        if path.is_file() and path.stat().st_size > 0:
            return path
    return None


def uses_bundled_school_excuse_signature(club: Club | None) -> bool:
    return bundled_school_excuse_signature_path(club) is not None


def club_school_excuse_enabled(club: Club | None) -> bool:
    return bool(club and getattr(club, "school_excuse_enabled", False))


def default_body_template() -> str:
    return DEFAULT_BODY_TEMPLATE


def resolve_school_excuse_template(club: Club | None) -> dict[str, Any]:
    name = (club.name if club else "") or "Клуб"
    city = (club.city if club else "") or ""
    chairman = (getattr(club, "school_excuse_chairman_name", None) or "").strip()
    body = (getattr(club, "school_excuse_body", None) or "").strip() or DEFAULT_BODY_TEMPLATE
    return {
        "club_id": club.id if club else None,
        "club_name": name,
        "club_city": city,
        "enabled": club_school_excuse_enabled(club),
        "chairman_name": chairman,
        "body_template": body,
        "has_signature": has_school_excuse_signature(club),
        "uses_bundled_signature": uses_bundled_school_excuse_signature(club),
        "has_stamp": _club_has_school_excuse_asset(club, "school_excuse_stamp_rel", "school_excuse_stamp_data"),
        "club_logo_url": club.logo_url if club else None,
    }


def _club_has_school_excuse_asset(club: Club | None, rel_attr: str, data_attr: str) -> bool:
    if not club:
        return False
    if getattr(club, data_attr, None):
        return True
    return bool(getattr(club, rel_attr, None))


def has_school_excuse_signature(club: Club | None) -> bool:
    if uses_bundled_school_excuse_signature(club):
        return True
    return _club_has_school_excuse_asset(
        club, "school_excuse_signature_rel", "school_excuse_signature_data"
    )


def resolve_school_excuse_signature(club: Club | None) -> Path | bytes | None:
    """Подпис за PDF — bundled (Троян) има приоритет пред canvas/БД."""
    bundled = bundled_school_excuse_signature_path(club)
    if bundled:
        return bundled
    return resolve_school_excuse_asset(club, "school_excuse_signature_rel", "school_excuse_signature_data")


def save_school_excuse_signature_png(club_id: int, data_url: str) -> tuple[str, bytes]:
    from app.services.carding_form import _decode_png_data_url

    blob = _decode_png_data_url(data_url)
    rel = f"signatures/club_{int(club_id)}.png"
    path = school_excuse_assets_dir() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blob)
    return f"school_excuse/{rel}", blob


def save_school_excuse_stamp_file(club_id: int, content: bytes, filename: str) -> str:
    ext = ".png"
    lower = (filename or "").lower()
    if lower.endswith(".jpg") or lower.endswith(".jpeg"):
        ext = ".jpg"
    elif lower.endswith(".webp"):
        ext = ".webp"
    rel = f"stamps/club_{int(club_id)}{ext}"
    path = school_excuse_assets_dir() / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return f"school_excuse/{rel}"


def resolve_school_excuse_asset_path(rel: str | None) -> Path | None:
    if not rel:
        return None
    name = str(rel).replace("\\", "/").lstrip("/")
    if name.startswith("school_excuse/"):
        name = name[len("school_excuse/") :]
    path = school_excuse_assets_dir() / name
    if path.is_file() and path.stat().st_size > 0:
        return path
    return None


def resolve_school_excuse_asset(club: Club | None, rel_attr: str, data_attr: str) -> Path | bytes | None:
    """Първо от БД (Railway-safe), после от локален файл."""
    if club:
        data = getattr(club, data_attr, None)
        if data and len(data) > 0:
            return bytes(data)
    path = resolve_school_excuse_asset_path(getattr(club, rel_attr, None) if club else None)
    return path


def backfill_school_excuse_assets_to_db(club: Club) -> bool:
    """Копира файлове от диск в БД (еднократно след deploy), ако липсват blob колоните."""
    changed = False
    pairs = (
        ("school_excuse_signature_rel", "school_excuse_signature_data"),
        ("school_excuse_stamp_rel", "school_excuse_stamp_data"),
    )
    for rel_attr, data_attr in pairs:
        if getattr(club, data_attr, None):
            continue
        path = resolve_school_excuse_asset_path(getattr(club, rel_attr, None))
        if not path:
            continue
        setattr(club, data_attr, path.read_bytes())
        changed = True
    return changed


def _strip_dark_background(img) -> None:
    """Маха черен фон от скан на подпис (PNG върху #000)."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            if r <= 48 and g <= 48 and b <= 48:
                px[x, y] = (255, 255, 255, 0)


def _strip_scan_background(img) -> None:
    """Маха бял/сив/светлосин фон от скан на печат (JPG/PNG с правоъгълник)."""
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (r + g + b) / 3.0
            spread = max(r, g, b) - min(r, g, b)
            if lum >= 178 and spread <= 62:
                px[x, y] = (255, 255, 255, 0)
            elif r >= 225 and g >= 225 and b >= 225:
                px[x, y] = (255, 255, 255, 0)


def _pdf_image_reader(
    source: Path | bytes,
    *,
    white_to_transparent: bool = False,
    dark_to_transparent: bool = False,
):
    """ReportLab 4.x изисква ImageReader за bytes (БД) — raw BytesIO хвърля грешка."""
    from reportlab.lib.utils import ImageReader

    if white_to_transparent or dark_to_transparent:
        try:
            from PIL import Image
        except ImportError:
            white_to_transparent = False
            dark_to_transparent = False
        else:
            try:
                img = Image.open(BytesIO(source) if isinstance(source, bytes) else source).convert("RGBA")
                w, h = img.size
                max_dim = 900
                if max(w, h) > max_dim:
                    scale = max_dim / float(max(w, h))
                    img = img.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.Resampling.LANCZOS)
                if dark_to_transparent:
                    _strip_dark_background(img)
                if white_to_transparent:
                    _strip_scan_background(img)
                bbox = img.getbbox()
                if bbox:
                    img = img.crop(bbox)
                out = BytesIO()
                img.save(out, format="PNG", optimize=True)
                out.seek(0)
                return ImageReader(out)
            except Exception:
                white_to_transparent = False
                dark_to_transparent = False

    if isinstance(source, bytes):
        return ImageReader(BytesIO(source))
    return ImageReader(str(source))


def _draw_footer_seal_and_signature(
    c,
    *,
    font: str,
    width: float,
    margin: float,
    footer_y: float,
    stamp_source: Path | bytes | None,
    sig_source: Path | bytes | None,
    chairman_name: str = "",
    sig_dark_background: bool = False,
) -> None:
    """Печат и подпис — две колони, подравнени: етикет / картинка / линия / име."""
    from reportlab.lib.units import mm

    right = width - margin
    has_stamp = bool(stamp_source)
    has_sig = bool(sig_source)
    signer = (chairman_name or "").strip()
    has_name = bool(signer and signer != "—")

    stamp_col_w = 34 * mm
    sig_col_w = 50 * mm
    col_gap = 12 * mm
    img_box_h = 24 * mm
    sig_img_h = 12 * mm
    name_h = 4.5 * mm if has_name else 0

    if not has_stamp and not has_sig:
        c.setFont(font, 10)
        line_y = footer_y + 6 * mm
        c.drawCentredString(right - 25 * mm, line_y + 14 * mm, "Подпис")
        c.setLineWidth(0.5)
        c.line(right - 45 * mm, line_y, right, line_y)
        return

    sig_left = right - sig_col_w
    stamp_left = sig_left - col_gap - stamp_col_w if has_stamp else sig_left
    line_y = footer_y + name_h + 1 * mm
    label_y = line_y + img_box_h + 5 * mm

    c.setFont(font, 9)
    c.setFillColorRGB(0.35, 0.35, 0.35)

    if has_stamp:
        c.drawCentredString(stamp_left + stamp_col_w / 2, label_y, "Печат")
        stamp_reader = _pdf_image_reader(stamp_source, white_to_transparent=True)
        c.drawImage(
            stamp_reader,
            stamp_left + stamp_col_w / 2,
            line_y + img_box_h / 2,
            width=stamp_col_w - 4 * mm,
            height=img_box_h - 2 * mm,
            mask="auto",
            preserveAspectRatio=True,
            anchor="c",
        )

    if has_sig:
        c.drawCentredString(sig_left + sig_col_w / 2, label_y, "Подпис")
        sig_draw_w = sig_col_w - 6 * mm
        sig_x = sig_left + (sig_col_w - sig_draw_w) / 2
        sig_y = line_y + (img_box_h - sig_img_h) / 2 + 1 * mm
        sig_reader = _pdf_image_reader(
            sig_source,
            white_to_transparent=False,
            dark_to_transparent=sig_dark_background,
        )
        c.drawImage(
            sig_reader,
            sig_x,
            sig_y,
            width=sig_draw_w,
            height=sig_img_h,
            mask="auto",
            preserveAspectRatio=True,
            anchor="sw",
        )
        c.setFillColorRGB(0, 0, 0)
        c.setLineWidth(0.4)
        c.line(sig_left + 3 * mm, line_y, right - 3 * mm, line_y)
        if has_name:
            c.setFont(font, 8)
            label = signer
            while label and c.stringWidth(label, font, 8) > sig_col_w - 4 * mm:
                label = label[:-1]
            if label:
                c.drawCentredString(sig_left + sig_col_w / 2, footer_y + 0.5 * mm, label)

    c.setFillColorRGB(0, 0, 0)


def format_date_bg(iso: str | None) -> str:
    if not iso or len(str(iso)) < 10:
        return "—"
    y, m, d = str(iso)[:10].split("-")
    return f"{d}.{m}.{y}г."


def format_date_short(iso: str | None) -> str:
    if not iso or len(str(iso)) < 10:
        return "—"
    y, m, d = str(iso)[:10].split("-")
    return f"{d}.{m}.{y[-2:]}"


def is_weekend_date(iso: str | None) -> bool:
    try:
        dt = datetime.strptime(str(iso)[:10], "%Y-%m-%d")
        return dt.weekday() >= 5
    except ValueError:
        return False


def extract_event_city(comp: ClubCompetitionEvent, club: Club | None = None) -> str:
    loc = (comp.location or "").strip()
    if loc.lower().startswith("гр."):
        return loc
    if loc.lower().startswith("град "):
        return "гр. " + loc[5:].strip()
    m = re.search(r"гр\.?\s*([A-Za-zА-Яа-я\-]+)", loc, re.IGNORECASE)
    if m:
        return f"гр. {m.group(1).strip()}"
    if loc:
        return loc
    city = (club.city if club else "") or ""
    return f"гр. {city}" if city and not city.lower().startswith("гр") else city or "—"


def build_event_description(comp: ClubCompetitionEvent) -> str:
    notes = (comp.notes or "").strip()
    if notes:
        return notes
    kind = competition_kind_label(comp.competition_kind).lower()
    opp = (comp.opponent_name or "").strip()
    if opp:
        return f"{kind} срещу {opp} от националния календар на БФВ"
    return f"{kind} от националния календар на БФВ"


def athlete_school_missing(athlete: Athlete) -> list[str]:
    missing = []
    if not (athlete.school_name or "").strip():
        missing.append("school_name")
    if not (athlete.school_class or "").strip():
        missing.append("school_class")
    return missing


def build_placeholder_context(
    *,
    athlete: Athlete,
    comp: ClubCompetitionEvent,
    club: Club,
    period_from: str | None = None,
    period_to: str | None = None,
) -> dict[str, str]:
    pf = period_from or comp.date
    pt = period_to or comp.date
    school_city = (athlete.school_city or club.city or "").strip()
    if school_city and not school_city.lower().startswith("гр"):
        school_city = f"гр. {school_city}"
    student_name = (athlete.athlete_name or "").strip()
    student_class = (athlete.school_class or "").strip()
    student_line = f"{student_name}, {student_class} клас" if student_class else student_name
    return {
        "school_name": (athlete.school_name or "").strip(),
        "school_city": school_city or "—",
        "student_name": student_name,
        "student_class": student_class,
        "student_line": student_line,
        "period_from": format_date_bg(pf),
        "period_to": format_date_bg(pt),
        "event_description": build_event_description(comp),
        "event_city": extract_event_city(comp, club),
        "event_date": format_date_bg(comp.date),
        "issue_date": format_date_short(date.today().isoformat()),
        "club_name": (club.name or "").strip(),
        "club_city": (club.city or "").strip() or "—",
        "chairman_name": (getattr(club, "school_excuse_chairman_name", None) or "").strip() or "—",
    }


def apply_template(template: str, ctx: dict[str, str]) -> str:
    text = template or ""
    for key, val in ctx.items():
        text = text.replace("{" + key + "}", val)
        text = text.replace("{{" + key + "}}", val)
    return text


def _ensure_student_class_visible(body_text: str, ctx: dict[str, str]) -> str:
    """Стари клубни шаблони може да имат само {student_name} — добавяме клас автоматично."""
    student_class = (ctx.get("student_class") or "").strip()
    student_name = (ctx.get("student_name") or "").strip()
    if not student_class or not student_name or student_class in body_text:
        return body_text
    for prefix in ("• ", "- ", "– "):
        old = f"{prefix}{student_name}"
        new = f"{prefix}{student_name}, {student_class} клас"
        if old in body_text:
            return body_text.replace(old, new, 1)
    if student_name in body_text:
        return body_text.replace(student_name, f"{student_name}, {student_class} клас", 1)
    return body_text


def build_school_excuse_pdf(
    *,
    athlete: Athlete,
    comp: ClubCompetitionEvent,
    club: Club,
    period_from: str | None = None,
    period_to: str | None = None,
) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    from app.routers.fees import _ensure_pdf_font
    from app.services.club_membership_consent import _club_logo_filesystem_path

    ctx = build_placeholder_context(
        athlete=athlete, comp=comp, club=club, period_from=period_from, period_to=period_to
    )
    body_template = (getattr(club, "school_excuse_body", None) or "").strip() or DEFAULT_BODY_TEMPLATE
    body_text = _ensure_student_class_visible(apply_template(body_template, ctx), ctx)

    font = _ensure_pdf_font()
    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin = 20 * mm
    logo_size = 26 * mm

    club_logo = _club_logo_filesystem_path(club.logo_url if club else None, club=club)
    if club_logo:
        try:
            c.drawImage(str(club_logo), margin, height - margin - logo_size, width=logo_size, height=logo_size, mask="auto")
            c.drawImage(
                str(club_logo),
                width - margin - logo_size,
                height - margin - logo_size,
                width=logo_size,
                height=logo_size,
                mask="auto",
            )
        except Exception:
            pass

    y = height - margin - logo_size - 6 * mm
    c.setFont(font, 11)
    c.drawRightString(width - margin, y, "ДО ДИРЕКТОРА")
    y -= 5 * mm
    c.drawRightString(width - margin, y, f"на {ctx['school_name']}")
    y -= 5 * mm
    c.drawRightString(width - margin, y, ctx["school_city"])

    y -= 14 * mm
    c.setFont(font, 16)
    c.drawCentredString(width / 2, y, "Молба")
    y -= 8 * mm
    c.setFont(font, 10)
    chairman_line = f"от {ctx['chairman_name']}, Председател на {ctx['club_name']}"
    c.drawCentredString(width / 2, y, chairman_line)

    y -= 12 * mm
    left = margin
    max_w = width - 2 * margin
    size = 11
    leading = 5.5 * mm

    for para in body_text.split("\n"):
        para = para.strip()
        if not para:
            y -= leading * 0.5
            continue
        words = para.split()
        line = ""
        for word in words:
            trial = f"{line} {word}".strip()
            if c.stringWidth(trial, font, size) <= max_w:
                line = trial
            else:
                if line:
                    c.drawString(left, y, line)
                    y -= leading
                line = word
        if line:
            c.drawString(left, y, line)
            y -= leading
        y -= leading * 0.3

    footer_y = margin + 18 * mm
    c.setFont(font, 10)
    c.drawString(left, footer_y + 6 * mm, f"дата: {ctx['issue_date']} г")
    c.drawString(left, footer_y, ctx["club_city"] if ctx["club_city"].lower().startswith("гр") else f"гр. {ctx['club_city']}")

    sig_source = resolve_school_excuse_signature(club)
    stamp_source = resolve_school_excuse_asset(club, "school_excuse_stamp_rel", "school_excuse_stamp_data")
    _draw_footer_seal_and_signature(
        c,
        font=font,
        width=width,
        margin=margin,
        footer_y=footer_y,
        stamp_source=stamp_source,
        sig_source=sig_source,
        chairman_name=ctx.get("chairman_name") or "",
        sig_dark_background=uses_bundled_school_excuse_signature(club),
    )

    c.showPage()
    c.save()
    return buf.getvalue()
