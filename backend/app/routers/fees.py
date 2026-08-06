import csv
import logging
import os
import re
import shutil
import subprocess
import urllib.request
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.database import get_db
from app.money_format import format_money_eur
from app.dependencies.roles import require_role
from app.models import Athlete, AthletePayment, Club, Team, TeamMember, User, UserRole
from app.services.parent_portal_notify import queue_fee_paid
from app.services.athlete_birth import resolve_birth_date, resolve_place_of_birth
from app.services.athlete_identity import (
    bvf_identity_locked,
    compose_athlete_name,
    default_nationality_from_city,
    validate_name_part,
)
from app.schemas.fees import (
    AthleteCreate,
    AthleteMonthlyReport,
    AthletePaymentCreate,
    AthletePaymentRead,
    AthleteRead,
    AthleteUpdate,
    CardedTeamBadge,
    FeesMonthCoachRow,
    FeesMonthSummary,
    MonthStatusRow,
    PeriodAthleteReportRow,
    PeriodReportResponse,
    FeeReminderResponse,
)
from app.services.parent_push import notify_athlete

router = APIRouter()
logger = logging.getLogger(__name__)

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")


def _validate_month_key(month_key: str) -> str:
    value = (month_key or "").strip()
    if not MONTH_RE.match(value):
        raise HTTPException(status_code=422, detail="month_key must be in format YYYY-MM")
    year = int(value[:4])
    month = int(value[5:7])
    if month < 1 or month > 12:
        raise HTTPException(status_code=422, detail="month_key month must be between 01 and 12")
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=422, detail="month_key year is out of valid range")
    return value


def _iter_months(from_month: str, to_month: str) -> list[str]:
    start = _validate_month_key(from_month)
    end = _validate_month_key(to_month)
    if start > end:
        raise HTTPException(status_code=422, detail="from_month must be <= to_month")

    sy, sm = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    out: list[str] = []
    y, m = sy, sm
    while (y < ey) or (y == ey and m <= em):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            m = 1
            y += 1
    return out


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_head_coach(user: User) -> bool:
    return _role_value(user) == UserRole.club_head_coach.value


def _team_names_by_athlete(db: Session, athlete_ids: list[int]) -> dict[int, list[str]]:
    if not athlete_ids:
        return {}
    rows = (
        db.query(TeamMember.athlete_id, Team.name)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(TeamMember.athlete_id.in_(athlete_ids), TeamMember.is_active.is_(True))
        .order_by(Team.name.asc())
        .all()
    )
    out: dict[int, list[str]] = {}
    for athlete_id, team_name in rows:
        out.setdefault(int(athlete_id), []).append(team_name)
    return out


def _athlete_reads_with_teams(db: Session, athletes: list[Athlete]) -> list[AthleteRead]:
    from app.services.athlete_memberships import athlete_display_has_photo, carded_team_badges_by_athlete
    from app.services.athlete_photo import has_cached_photo

    team_map = _team_names_by_athlete(db, [a.id for a in athletes])
    carded_map = carded_team_badges_by_athlete(db, [a.id for a in athletes])
    return [
        AthleteRead.model_validate(athlete).model_copy(
            update={
                "team_names": team_map.get(athlete.id, []),
                "carded_teams": [CardedTeamBadge(**row) for row in carded_map.get(athlete.id, [])],
                "has_photo": athlete_display_has_photo(
                    athlete, cached=has_cached_photo(athlete.id)
                ),
            }
        )
        for athlete in athletes
    ]


def _attach_athlete_to_team(db: Session, athlete: Athlete, team_id: int, user: User) -> None:
    team = db.query(Team).filter(Team.id == int(team_id)).first()
    if not team:
        raise HTTPException(status_code=422, detail="Тренировъчната група не е намерена")
    if not user.club_id or int(team.club_id or 0) != int(user.club_id):
        raise HTTPException(status_code=403, detail="Групата не е от твоя клуб")
    if not _is_head_coach(user) and int(team.coach_id) != int(user.id):
        raise HTTPException(status_code=403, detail="Можеш да добавяш само в групи, които водиш")
    team_gender = (team.gender or "").strip().lower() or None
    athlete_gender = (athlete.gender or "").strip().lower() or None
    if team_gender and athlete_gender and team_gender != athlete_gender:
        raise HTTPException(status_code=422, detail="Полът на състезателя не съвпада с типа на групата")
    existing = (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team.id, TeamMember.athlete_id == athlete.id)
        .first()
    )
    if existing:
        existing.is_active = True
        existing.left_at = None
    else:
        db.add(TeamMember(team_id=team.id, athlete_id=athlete.id, is_active=True))


def _ensure_athlete_access(db: Session, athlete_id: int, user: User) -> Athlete:
    q = db.query(Athlete).filter(Athlete.id == athlete_id)
    if _is_head_coach(user):
        q = q.filter(Athlete.club_id == user.club_id)
    else:
        q = q.filter(Athlete.coach_id == user.id)
    athlete = q.first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    return athlete


def _normalize_header(value: str) -> str:
    return re.sub(r"[\s_\-]+", "", str(value or "").strip().lower())


def _extract_column(row: dict, aliases: list[str]):
    normalized_row = {_normalize_header(k): v for k, v in row.items()}
    for alias in aliases:
        key = _normalize_header(alias)
        if key in normalized_row:
            return normalized_row[key]
    return None


def _to_bool(value) -> bool:
    text = str(value or "").strip().lower()
    if text in {"1", "true", "yes", "y", "да", "активен"}:
        return True
    if text in {"0", "false", "no", "n", "не", "неактивен"}:
        return False
    return True


def _normalize_gender(value) -> str | None:
    """Map import/free-text values to Athlete.gender: 'male' | 'female' | None."""
    if value is None:
        return None
    raw = str(value).strip().lower()
    if not raw:
        return None
    if raw in {"m", "male", "м", "мъж", "мж", "man"}:
        return "male"
    if raw in {"f", "female", "ж", "жена", "fem", "woman"}:
        return "female"
    return None


PDF_FONT_NAME = "ReceiptFontBG"
PDF_FONT_REGISTERED = False

# DejaVu upstream removed prebuilt TTF from the GitHub tree; use jsDelivr + Noto as reliable fallbacks.
_PDF_REMOTE_FONT_SOURCES: tuple[tuple[str, str, int], ...] = (
    (
        "https://cdn.jsdelivr.net/gh/notofonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
        "NotoSans-Regular.ttf",
        200_000,
    ),
    (
        "https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
        "NotoSans-Regular.ttf",
        200_000,
    ),
)


def _try_register_ttf(path: Path) -> bool:
    global PDF_FONT_REGISTERED
    try:
        if not path.is_file():
            return False
        pdfmetrics.registerFont(TTFont(PDF_FONT_NAME, str(path)))
        PDF_FONT_REGISTERED = True
        return True
    except Exception as exc:
        logger.warning("PDF font register failed for %s: %s", path, exc)
        return False


def _pdf_font_static_candidates() -> list[Path]:
    app_dir = Path(__file__).resolve().parent.parent
    return [
        app_dir / "fonts" / "DejaVuSans.ttf",
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/ttf/DejaVuSans.ttf"),
        Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/liberation/LiberationSans-Regular.ttf"),
        Path("/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSans-Regular.ttf"),
    ]


def _pdf_font_via_fc_match() -> Path | None:
    fc = shutil.which("fc-match")
    if not fc:
        return None
    for pattern in ("DejaVu Sans", "Liberation Sans", "sans"):
        try:
            out = subprocess.check_output(
                [fc, "-f", "%{file}", pattern],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=6,
            ).strip()
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError, OSError):
            continue
        if out:
            p = Path(out)
            if p.is_file():
                return p
    return None


def _pdf_font_scan_share() -> Path | None:
    root = Path("/usr/share/fonts")
    if not root.is_dir():
        return None
    wanted = frozenset(
        {
            "dejavusans.ttf",
            "liberationsans-regular.ttf",
            "notosans-regular.ttf",
            "notosansdisplay-regular.ttf",
        }
    )
    try:
        for p in root.rglob("*.ttf"):
            if p.name.lower() in wanted:
                return p
    except OSError as exc:
        logger.warning("PDF font scan under %s failed: %s", root, exc)
    return None


def _pdf_font_download_remote() -> Path | None:
    base = Path(os.environ.get("VP_FONT_CACHE", "/tmp/vp-fonts"))
    try:
        base.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        logger.warning("PDF font cache dir not usable %s: %s", base, exc)
        return None
    for url, filename, min_bytes in _PDF_REMOTE_FONT_SOURCES:
        dest = base / filename
        if dest.is_file() and dest.stat().st_size >= min_bytes:
            return dest
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "VolleyPlatform/1.0"})
            with urllib.request.urlopen(req, timeout=45) as resp:
                data = resp.read()
            if len(data) < min_bytes:
                logger.warning("PDF font download too small (%s bytes) from %s", len(data), url)
                continue
            dest.write_bytes(data)
            return dest
        except Exception as exc:
            logger.warning("PDF font download failed (%s): %s", url, exc)
            continue
    return None


def _ensure_pdf_font() -> str:
    global PDF_FONT_REGISTERED
    if PDF_FONT_REGISTERED:
        return PDF_FONT_NAME

    for candidate in _pdf_font_static_candidates():
        if _try_register_ttf(candidate):
            return PDF_FONT_NAME

    for resolver in (_pdf_font_via_fc_match, _pdf_font_scan_share, _pdf_font_download_remote):
        resolved = resolver()
        if resolved and _try_register_ttf(resolved):
            return PDF_FONT_NAME

    raise HTTPException(
        status_code=500,
        detail="Не е наличен шрифт за PDF (кирилица). На сървъра няма DejaVu/Liberation и изтеглянето неуспя. "
        "Добавете пакет fonts-dejavu-core в образа или файл backend/app/fonts/DejaVuSans.ttf.",
    )


def _build_receipt_pdf(lines: list[str]) -> bytes:
    font_name = _ensure_pdf_font()
    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 45
    c.setFont(font_name, 15)
    c.drawString(45, y, "КВИТАНЦИЯ ЗА МЕСЕЧНА ТАКСА")
    y -= 22
    c.setLineWidth(0.7)
    c.line(45, y, width - 45, y)
    y -= 22

    c.setFont(font_name, 11)
    for line in lines:
        c.drawString(45, y, line)
        y -= 18
        if y < 70:
            c.showPage()
            c.setFont(font_name, 11)
            y = height - 50

    y -= 12
    c.line(45, y, width - 45, y)
    y -= 18
    c.setFont(font_name, 10)
    c.drawString(45, y, "Подпис треньор: ____________________")
    c.drawString(width - 245, y, "Подпис родител: ____________________")

    c.save()
    return buffer.getvalue()


@router.get("/fees/athletes", response_model=list[AthleteRead])
def list_athletes(
    query: str | None = Query(default=None),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    q = db.query(Athlete)
    if _is_head_coach(current_user):
        q = q.filter(Athlete.club_id == current_user.club_id)
        if coach_id:
            q = q.filter(Athlete.coach_id == coach_id)
    else:
        q = q.filter(Athlete.coach_id == current_user.id)
    q = q.order_by(Athlete.athlete_name.asc())
    if query and query.strip():
        search = f"%{query.strip()}%"
        q = q.filter(
            (Athlete.athlete_name.ilike(search))
            | (Athlete.parent_name.ilike(search))
            | (Athlete.athlete_phone.ilike(search))
            | (Athlete.parent_phone.ilike(search))
            | (Athlete.notes.ilike(search))
        )
        if query.strip().isdigit():
            q = q.filter(Athlete.birth_year == int(query.strip()))
    athletes = q.all()
    athlete_ids = [a.id for a in athletes]

    recent_by_athlete: dict[int, list[dict]] = {}
    if athlete_ids:
        payments = (
            db.query(AthletePayment)
            .filter(AthletePayment.athlete_id.in_(athlete_ids))
            .order_by(AthletePayment.athlete_id.asc(), AthletePayment.month_key.desc(), AthletePayment.paid_at.desc())
            .all()
        )
        for p in payments:
            bucket = recent_by_athlete.setdefault(p.athlete_id, [])
            if len(bucket) >= 3:
                continue
            bucket.append(
                {
                    "month_key": p.month_key,
                    "amount": float(p.amount or 0),
                    "paid_at": p.paid_at,
                    "payment_id": p.id,
                }
            )

    for athlete in athletes:
        athlete.recent_payments = recent_by_athlete.get(athlete.id, [])

    reads = _athlete_reads_with_teams(db, athletes)
    if query and query.strip() and not query.strip().isdigit():
        needle = query.strip().lower()
        team_rows = (
            db.query(TeamMember.athlete_id)
            .join(Team, Team.id == TeamMember.team_id)
            .filter(TeamMember.is_active.is_(True), Team.name.ilike(f"%{needle}%"))
            .distinct()
            .all()
        )
        team_athlete_ids = {int(r[0]) for r in team_rows}
        if team_athlete_ids:
            existing_ids = {r.id for r in reads}
            extra = (
                q.filter(Athlete.id.in_(team_athlete_ids - existing_ids)).all()
                if team_athlete_ids - existing_ids
                else []
            )
            for athlete in extra:
                athlete.recent_payments = recent_by_athlete.get(athlete.id, [])
            reads.extend(_athlete_reads_with_teams(db, extra))
            reads.sort(key=lambda x: x.athlete_name.lower())

    return reads


@router.get("/fees/month-summary", response_model=FeesMonthSummary)
def fees_month_summary(
    month_key: str = Query(..., description="YYYY-MM"),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
    ),
):
    """Събрани такси за месеца: груповият треньор — само своите; главният — всички + разбивка."""
    month_key = _validate_month_key(month_key)
    q = db.query(Athlete).filter(Athlete.is_active.is_(True))
    if _is_head_coach(current_user):
        if not current_user.club_id:
            raise HTTPException(status_code=422, detail="Главният треньор няма клуб")
        q = q.filter(Athlete.club_id == current_user.club_id)
        if coach_id:
            q = q.filter(Athlete.coach_id == int(coach_id))
    else:
        q = q.filter(Athlete.coach_id == current_user.id)
    athletes = q.all()
    athlete_ids = [a.id for a in athletes]
    payments = []
    if athlete_ids:
        payments = (
            db.query(AthletePayment)
            .filter(AthletePayment.athlete_id.in_(athlete_ids), AthletePayment.month_key == month_key)
            .all()
        )
    paid_by_athlete = {int(p.athlete_id): float(p.amount or 0) for p in payments}
    total_collected = round(sum(paid_by_athlete.values()), 2)
    paid_count = len(paid_by_athlete)
    unpaid_count = max(0, len(athletes) - paid_count)

    by_coach: list[FeesMonthCoachRow] = []
    if _is_head_coach(current_user) and not coach_id:
        coach_ids = sorted({int(a.coach_id) for a in athletes if a.coach_id})
        names = {}
        if coach_ids:
            names = {
                int(uid): (name or "").strip() or f"Треньор #{uid}"
                for uid, name in db.query(User.id, User.name).filter(User.id.in_(coach_ids)).all()
            }
        for cid in coach_ids:
            subset = [a for a in athletes if int(a.coach_id) == cid]
            paid_amt = 0.0
            paid_n = 0
            for a in subset:
                if a.id in paid_by_athlete:
                    paid_n += 1
                    paid_amt += paid_by_athlete[a.id]
            by_coach.append(
                FeesMonthCoachRow(
                    coach_id=cid,
                    coach_name=names.get(cid, f"Треньор #{cid}"),
                    total_collected=round(paid_amt, 2),
                    paid_count=paid_n,
                    unpaid_count=max(0, len(subset) - paid_n),
                )
            )
        by_coach.sort(key=lambda r: r.coach_name.lower())

    return FeesMonthSummary(
        month_key=month_key,
        total_collected=total_collected,
        paid_count=paid_count,
        unpaid_count=unpaid_count,
        athlete_count=len(athletes),
        by_coach=by_coach,
    )


@router.post("/fees/remind-unpaid", response_model=FeeReminderResponse)
def remind_unpaid_fees(
    month_key: str = Query(..., description="YYYY-MM"),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    month_key = _validate_month_key(month_key)
    q = db.query(Athlete).filter(Athlete.is_active.is_(True))
    if _is_head_coach(current_user):
        if not current_user.club_id:
            raise HTTPException(status_code=403, detail="Club is required")
        q = q.filter(Athlete.club_id == current_user.club_id)
        if coach_id is not None:
            q = q.filter(Athlete.coach_id == int(coach_id))
    else:
        q = q.filter(Athlete.coach_id == current_user.id)

    athletes = q.order_by(Athlete.athlete_name.asc()).all()
    if not athletes:
        return FeeReminderResponse(month_key=month_key)

    athlete_ids = [int(a.id) for a in athletes]
    paid_rows = (
        db.query(AthletePayment.athlete_id)
        .filter(AthletePayment.athlete_id.in_(athlete_ids), AthletePayment.month_key == month_key)
        .all()
    )
    paid_ids = {int(r[0]) for r in paid_rows}
    unpaid = [a for a in athletes if int(a.id) not in paid_ids]

    notified = 0
    skipped_no_push = 0
    errors: list[str] = []
    title = "Напомняне за месечна такса"
    body = f"Таксата за {month_key} не е отбелязана като платена. Проверете родителския профил или отборната стая."

    for athlete in unpaid:
        result = notify_athlete(db, int(athlete.id), title, body)
        if int(result.get("sent") or 0) > 0:
            notified += 1
        elif int(result.get("subscriptions") or 0) == 0:
            skipped_no_push += 1
        for err in result.get("errors") or []:
            if err and err not in errors:
                errors.append(str(err))

    return FeeReminderResponse(
        month_key=month_key,
        targeted=len(unpaid),
        notified=notified,
        skipped_no_push=skipped_no_push,
        errors=errors[:20],
    )


@router.post("/fees/athletes", response_model=AthleteRead, status_code=status.HTTP_201_CREATED)
def create_athlete(
    payload: AthleteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    try:
        first_name = validate_name_part("Собствено име", payload.first_name)
        middle_name = validate_name_part("Бащино име", payload.middle_name)
        last_name = validate_name_part("Фамилия", payload.last_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    place = (payload.place_of_birth or "").strip()
    if not place:
        raise HTTPException(status_code=422, detail="Градът на раждане е задължителен")
    if not payload.birth_date:
        raise HTTPException(status_code=422, detail="Датата на раждане е задължителна")
    if not payload.gender:
        raise HTTPException(status_code=422, detail="Полът е задължителен")

    birth_date, birth_year = resolve_birth_date(
        birth_date=payload.birth_date,
        birth_year=payload.birth_year,
    )
    nationality = default_nationality_from_city(place, payload.nationality)
    full_name = compose_athlete_name(first_name, middle_name, last_name)

    athlete = Athlete(
        coach_id=current_user.id,
        club_id=current_user.club_id,
        athlete_name=full_name,
        first_name=first_name,
        middle_name=middle_name,
        last_name=last_name,
        athlete_phone=(payload.athlete_phone or "").strip() or None,
        parent_name=(payload.parent_name or "").strip() or None,
        parent_phone=(payload.parent_phone or "").strip() or None,
        birth_date=birth_date,
        birth_year=birth_year,
        place_of_birth=place,
        nationality=nationality,
        gender=payload.gender,
        notes=(payload.notes or "").strip() or None,
        is_active=bool(payload.is_active),
        egn=(payload.egn or "").strip() or None,
        bvf_player_id=payload.bvf_player_id,
        bvf_player_number=payload.bvf_player_number,
    )
    db.add(athlete)
    db.flush()
    if payload.team_id:
        _attach_athlete_to_team(db, athlete, int(payload.team_id), current_user)
    db.commit()
    db.refresh(athlete)
    return _athlete_reads_with_teams(db, [athlete])[0]


@router.post("/fees/athletes/import")
def import_athletes(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    file_name = (file.filename or "").lower()
    content = file.file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Празен файл.")

    rows: list[dict] = []
    try:
        if file_name.endswith(".csv"):
            decoded = None
            for encoding in ("utf-8-sig", "cp1251"):
                try:
                    decoded = content.decode(encoding)
                    break
                except Exception:
                    continue
            if decoded is None:
                raise HTTPException(status_code=400, detail="Неуспешно декодиране на CSV файла.")
            sample = decoded[:2048]
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                reader = csv.DictReader(decoded.splitlines(), dialect=dialect)
            except Exception:
                # Fallback to comma for malformed CSV samples.
                reader = csv.DictReader(decoded.splitlines())
            rows = [dict(r) for r in reader]
        elif file_name.endswith(".xlsx") or file_name.endswith(".xls"):
            try:
                import pandas as pd  # lazy import, so app can start without pandas
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="Excel импортът изисква pandas/openpyxl. Използвай CSV или инсталирай зависимостите.",
                )
            df = pd.read_excel(BytesIO(content))
            if not df.empty:
                rows = df.fillna("").to_dict(orient="records")
        else:
            raise HTTPException(status_code=400, detail="Поддържани формати: CSV, XLSX, XLS")
    except HTTPException:
        raise
    except Exception as ex:
        raise HTTPException(status_code=400, detail=f"Неуспешно прочитане на файла: {ex}")

    if not rows:
        return {"created": 0, "skipped_empty": 0, "skipped_duplicates": 0, "total_rows": 0}
    existing = db.query(Athlete).filter(Athlete.coach_id == current_user.id).all()
    existing_keys = {
        (
            (a.athlete_name or "").strip().lower(),
            (a.parent_phone or a.athlete_phone or "").strip(),
        )
        for a in existing
    }
    batch_keys = set()

    created = 0
    skipped_empty = 0
    skipped_duplicates = 0

    for row in rows:
        athlete_name = str(
            _extract_column(row, ["athlete_name", "athlete", "name", "състезател", "име", "име на състезател"]) or ""
        ).strip()
        if not athlete_name:
            skipped_empty += 1
            continue

        athlete_phone = str(
            _extract_column(row, ["athlete_phone", "phone_athlete", "тел_състезател", "телефон състезател"]) or ""
        ).strip()
        parent_name = str(_extract_column(row, ["parent_name", "родител", "име_родител", "име на родител"]) or "").strip()
        parent_phone = str(
            _extract_column(row, ["parent_phone", "phone_parent", "тел_родител", "телефон родител"]) or ""
        ).strip()
        birth_year_raw = _extract_column(row, ["birth_year", "year", "година", "година на раждане"])
        notes = str(_extract_column(row, ["notes", "бележка", "бележки"]) or "").strip()
        is_active_raw = _extract_column(row, ["is_active", "active", "активен"])
        gender_raw = _extract_column(row, ["gender", "sex", "пол"])

        birth_year = None
        if str(birth_year_raw).strip():
            try:
                birth_year = int(float(str(birth_year_raw).strip()))
            except Exception:
                birth_year = None

        birth_date, synced_year = resolve_birth_date(birth_year=birth_year)
        club_city = None
        if current_user.club_id:
            club = db.query(Club).filter(Club.id == current_user.club_id).first()
            club_city = club.city if club else None

        dedupe_phone = parent_phone or athlete_phone
        dedupe_key = (athlete_name.lower(), dedupe_phone)
        if dedupe_key in existing_keys or dedupe_key in batch_keys:
            skipped_duplicates += 1
            continue

        athlete = Athlete(
            coach_id=current_user.id,
            club_id=current_user.club_id,
            athlete_name=athlete_name,
            athlete_phone=athlete_phone or None,
            parent_name=parent_name or None,
            parent_phone=parent_phone or None,
            birth_year=synced_year,
            birth_date=birth_date,
            place_of_birth=resolve_place_of_birth(None, club_city),
            gender=_normalize_gender(gender_raw),
            notes=notes or None,
            is_active=_to_bool(is_active_raw),
        )
        db.add(athlete)
        batch_keys.add(dedupe_key)
        created += 1

    db.commit()
    return {
        "created": created,
        "skipped_empty": skipped_empty,
        "skipped_duplicates": skipped_duplicates,
        "total_rows": len(rows),
    }


@router.get("/fees/athletes/import-template")
def download_athletes_import_template(
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ = current_user
    csv_content = (
        "име на състезател,телефон състезател,име на родител,телефон родител,година на раждане,пол,бележка,активен\n"
        "Иван Иванов,0888123456,Петър Иванов,0899123456,2010,м,Примерен запис,да\n"
    )
    data = csv_content.encode("utf-8-sig")
    headers = {
        "Content-Disposition": 'attachment; filename="shablon_sastezateli_import.csv"'
    }
    return Response(content=data, media_type="text/csv; charset=utf-8", headers=headers)


@router.get("/fees/coaches")
def list_fee_coaches(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    if not _is_head_coach(current_user):
        return [{"id": current_user.id, "name": current_user.name, "email": current_user.email}]
    if not current_user.club_id:
        return []
    # Primary query by enum role
    coaches = []
    try:
        coaches = (
            db.query(User)
            .filter(
                User.club_id == current_user.club_id,
                User.role.in_([UserRole.coach, UserRole.club_head_coach]),
            )
            .order_by(User.name.asc())
            .all()
        )
    except Exception:
        # Fallback when DB enum state is inconsistent: fetch by club and filter in Python.
        raw_users = db.query(User).filter(User.club_id == current_user.club_id).order_by(User.name.asc()).all()
        coaches = [
            u for u in raw_users
            if (u.role.value if hasattr(u.role, "value") else str(u.role)) in {UserRole.coach.value, UserRole.club_head_coach.value}
        ]
    return [
        {"id": c.id, "name": c.name, "email": c.email, "role": c.role.value if hasattr(c.role, "value") else c.role}
        for c in coaches
    ]


@router.put("/fees/athletes/{athlete_id}", response_model=AthleteRead)
def update_athlete(
    athlete_id: int,
    payload: AthleteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_access(db, athlete_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    locked = bvf_identity_locked(athlete)

    identity_keys = {
        "first_name",
        "middle_name",
        "last_name",
        "athlete_name",
        "birth_date",
        "birth_year",
        "place_of_birth",
        "nationality",
        "gender",
        "egn",
    }
    if locked and identity_keys.intersection(data.keys()):
        raise HTTPException(
            status_code=409,
            detail="След връзка с БФВ идентичността (имена, ЕГН, дата, град, националност, пол) не се редактира тук.",
        )

    name_touched = any(k in data for k in ("first_name", "middle_name", "last_name"))
    if name_touched:
        try:
            first_name = validate_name_part(
                "Собствено име",
                data["first_name"] if "first_name" in data else athlete.first_name,
            )
            middle_name = validate_name_part(
                "Бащино име",
                data["middle_name"] if "middle_name" in data else athlete.middle_name,
            )
            last_name = validate_name_part(
                "Фамилия",
                data["last_name"] if "last_name" in data else athlete.last_name,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        athlete.first_name = first_name
        athlete.middle_name = middle_name
        athlete.last_name = last_name
        athlete.athlete_name = compose_athlete_name(first_name, middle_name, last_name)
    elif "athlete_name" in data:
        # Legacy: allow fixing old single-field records until names are split
        name = (data.get("athlete_name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Името не може да е празно")
        athlete.athlete_name = name

    if "athlete_phone" in data:
        athlete.athlete_phone = (data.get("athlete_phone") or "").strip() or None
    if "parent_name" in data:
        athlete.parent_name = (data.get("parent_name") or "").strip() or None
    if "parent_phone" in data:
        athlete.parent_phone = (data.get("parent_phone") or "").strip() or None
    if "birth_date" in data or "birth_year" in data:
        birth_date, birth_year = resolve_birth_date(
            birth_date=data.get("birth_date") if "birth_date" in data else athlete.birth_date,
            birth_year=data.get("birth_year") if "birth_year" in data and "birth_date" not in data else None,
        )
        if "birth_date" in data:
            if not birth_date:
                raise HTTPException(status_code=422, detail="Датата на раждане е задължителна")
            athlete.birth_date = birth_date
            athlete.birth_year = birth_year
        elif "birth_year" in data:
            athlete.birth_year = data.get("birth_year")
            if athlete.birth_year and not athlete.birth_date:
                athlete.birth_date = resolve_birth_date(birth_year=athlete.birth_year)[0]
            elif athlete.birth_date and athlete.birth_year:
                athlete.birth_date = athlete.birth_date.replace(year=int(athlete.birth_year))
    if "place_of_birth" in data:
        place = (data.get("place_of_birth") or "").strip()
        if not place:
            raise HTTPException(status_code=422, detail="Градът на раждане е задължителен")
        athlete.place_of_birth = place
        if "nationality" not in data:
            athlete.nationality = default_nationality_from_city(place, athlete.nationality)
    if "nationality" in data:
        athlete.nationality = default_nationality_from_city(
            athlete.place_of_birth,
            data.get("nationality"),
        )
    if "gender" in data:
        if not data.get("gender"):
            raise HTTPException(status_code=422, detail="Полът е задължителен")
        athlete.gender = data.get("gender")
    if "egn" in data:
        athlete.egn = (data.get("egn") or "").strip() or None
    if "notes" in data:
        athlete.notes = (data.get("notes") or "").strip() or None
    if "is_active" in data:
        athlete.is_active = bool(data.get("is_active"))

    from app.services.sek_athlete_readiness import refresh_open_sek_task

    refresh_open_sek_task(athlete)

    athlete.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(athlete)
    return athlete


@router.delete("/fees/athletes/{athlete_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_athlete(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_access(db, athlete_id, current_user)
    if getattr(athlete, "bvf_player_id", None):
        raise HTTPException(
            status_code=409,
            detail="Състезател, свързан със СЕК, не може да се изтрие от платформата.",
        )
    db.delete(athlete)
    db.commit()
    return None


@router.put("/fees/athletes/{athlete_id}/transfer", response_model=AthleteRead)
def transfer_athlete_to_coach(
    athlete_id: int,
    coach_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    if not _is_head_coach(current_user):
        raise HTTPException(status_code=403, detail="Само главният треньор може да прехвърля състезатели.")
    athlete = _ensure_athlete_access(db, athlete_id, current_user)
    target = (
        db.query(User)
        .filter(
            User.id == coach_id,
            User.club_id == current_user.club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Треньорът не е намерен в този клуб.")
    athlete.coach_id = target.id
    athlete.club_id = target.club_id
    athlete.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(athlete)
    return athlete


@router.post("/fees/athletes/{athlete_id}/payments", response_model=AthletePaymentRead, status_code=status.HTTP_201_CREATED)
def save_month_payment(
    athlete_id: int,
    payload: AthletePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_access(db, athlete_id, current_user)
    month_key = _validate_month_key(payload.month_key)
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=422, detail="amount must be > 0")

    payment = (
        db.query(AthletePayment)
        .filter(AthletePayment.athlete_id == athlete.id, AthletePayment.month_key == month_key)
        .first()
    )
    if payment:
        raise HTTPException(
            status_code=409,
            detail=f"Вече има записано плащане за месец {month_key}. Редактирай съществуващия запис, вместо да създаваш нов.",
        )

    payment = AthletePayment(
        athlete_id=athlete.id,
        coach_id=current_user.id,
        month_key=month_key,
        amount=amount,
        note=(payload.note or "").strip() or None,
        paid_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    queue_fee_paid(athlete.id, month_key, amount)
    return payment


@router.get("/fees/athletes/{athlete_id}/payments", response_model=AthleteMonthlyReport)
def athlete_monthly_report(
    athlete_id: int,
    from_month: str = Query(...),
    to_month: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_access(db, athlete_id, current_user)
    months = _iter_months(from_month, to_month)
    payments = (
        db.query(AthletePayment)
        .filter(
            AthletePayment.athlete_id == athlete.id,
            AthletePayment.month_key >= months[0],
            AthletePayment.month_key <= months[-1],
        )
        .all()
    )
    by_month = {p.month_key: p for p in payments}

    rows: list[MonthStatusRow] = []
    total_paid = 0.0
    for month in months:
        p = by_month.get(month)
        if p:
            total_paid += float(p.amount or 0)
            rows.append(
                MonthStatusRow(
                    month_key=month,
                    paid=True,
                    amount=float(p.amount),
                    payment_id=p.id,
                    paid_at=p.paid_at,
                )
            )
        else:
            rows.append(MonthStatusRow(month_key=month, paid=False))

    return AthleteMonthlyReport(athlete=athlete, months=rows, total_paid=round(total_paid, 2))


@router.get("/fees/reports/period", response_model=PeriodReportResponse)
def period_report(
    from_month: str = Query(...),
    to_month: str = Query(...),
    coach_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    months = _iter_months(from_month, to_month)
    q = db.query(Athlete)
    if _is_head_coach(current_user):
        q = q.filter(Athlete.club_id == current_user.club_id)
        if coach_id:
            q = q.filter(Athlete.coach_id == coach_id)
    else:
        q = q.filter(Athlete.coach_id == current_user.id)
    athletes = q.order_by(Athlete.athlete_name.asc()).all()
    athlete_ids = [a.id for a in athletes]

    payments = []
    if athlete_ids:
        payments = (
            db.query(AthletePayment)
            .filter(
                AthletePayment.athlete_id.in_(athlete_ids),
                AthletePayment.month_key >= months[0],
                AthletePayment.month_key <= months[-1],
            )
            .all()
        )
    by_pair = {(p.athlete_id, p.month_key): p for p in payments}

    rows: list[PeriodAthleteReportRow] = []
    for athlete in athletes:
        month_rows: list[MonthStatusRow] = []
        paid_count = 0
        unpaid_count = 0
        total_paid = 0.0
        for month in months:
            p = by_pair.get((athlete.id, month))
            if p:
                paid_count += 1
                total_paid += float(p.amount or 0)
                month_rows.append(
                    MonthStatusRow(
                        month_key=month,
                        paid=True,
                        amount=float(p.amount),
                        payment_id=p.id,
                        paid_at=p.paid_at,
                    )
                )
            else:
                unpaid_count += 1
                month_rows.append(MonthStatusRow(month_key=month, paid=False))

        rows.append(
            PeriodAthleteReportRow(
                athlete_id=athlete.id,
                athlete_name=athlete.athlete_name,
                parent_name=athlete.parent_name,
                paid_months=paid_count,
                unpaid_months=unpaid_count,
                total_paid=round(total_paid, 2),
                months=month_rows,
            )
        )

    return PeriodReportResponse(
        from_month=months[0],
        to_month=months[-1],
        total_athletes=len(rows),
        months_count=len(months),
        rows=rows,
    )


@router.get("/fees/payments/{payment_id}/receipt.pdf")
def payment_receipt_pdf(
    payment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    try:
        payment_query = (
            db.query(AthletePayment)
            .join(Athlete, Athlete.id == AthletePayment.athlete_id)
            .filter(AthletePayment.id == payment_id)
        )
        if _is_head_coach(current_user):
            payment_query = payment_query.filter(Athlete.club_id == current_user.club_id)
        else:
            payment_query = payment_query.filter(Athlete.coach_id == current_user.id)
        payment = payment_query.first()
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")

        athlete = payment.athlete
        paid_dt = payment.paid_at or getattr(payment, "created_at", None) or datetime.utcnow()
        paid_on = paid_dt.strftime("%d.%m.%Y %H:%M") if hasattr(paid_dt, "strftime") else str(paid_dt)
        club_name = getattr(getattr(athlete, "club", None), "name", None) or "Не е посочен клуб"
        lines = [
            f"Номер на квитанция: {payment.id}",
            f"Клуб: {club_name}",
            f"Треньор: {current_user.name} ({current_user.email})",
            f"Дата и час на плащане: {paid_on}",
            "",
            f"Състезател: {athlete.athlete_name}",
            f"Година на раждане: {athlete.birth_year or '-'}",
            f"Телефон състезател: {athlete.athlete_phone or '-'}",
            f"Родител: {athlete.parent_name or '-'}",
            f"Телефон родител: {athlete.parent_phone or '-'}",
            "",
            f"Период (месец): {payment.month_key}",
            f"Основание: Месечна такса тренировки",
            f"Платена сума: {format_money_eur(payment.amount)}",
        ]
        if payment.note:
            lines.append(f"Бележка: {payment.note}")
        lines.append("")
        lines.append("Документът е генериран автоматично от Volley Coach Platform.")

        pdf_bytes = _build_receipt_pdf(lines)
        file_name = f"kvitanciya_{payment.id}_{payment.month_key}.pdf"
        headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
        return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("payment_receipt_pdf failed payment_id=%s", payment_id)
        raise HTTPException(
            status_code=500,
            detail="Грешка при генериране на PDF квитанция. Проверете логовете на сървъра или опитайте по-късно.",
        ) from exc


@router.get("/fees/payments/activity")
def recent_fee_payment_activity(
    limit: int = Query(default=15, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    if not _is_head_coach(current_user):
        return {"items": [], "unread_hint": 0}
    rows = (
        db.query(AthletePayment, Athlete, User)
        .join(Athlete, Athlete.id == AthletePayment.athlete_id)
        .join(User, User.id == AthletePayment.coach_id)
        .filter(Athlete.club_id == current_user.club_id, AthletePayment.coach_id != current_user.id)
        .order_by(AthletePayment.paid_at.desc())
        .limit(limit)
        .all()
    )
    items = [
        {
            "id": payment.id,
            "athlete_id": athlete.id,
            "athlete_name": athlete.athlete_name,
            "coach_id": coach.id,
            "coach_name": coach.name,
            "month_key": payment.month_key,
            "amount": float(payment.amount or 0),
            "paid_at": payment.paid_at,
        }
        for payment, athlete, coach in rows
    ]
    return {"items": items, "unread_hint": len(items)}

