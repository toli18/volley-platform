import re
from datetime import datetime
from io import BytesIO
from pathlib import Path
import csv

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, AthletePayment, User, UserRole
from app.schemas.fees import (
    AthleteCreate,
    AthleteMonthlyReport,
    AthletePaymentCreate,
    AthletePaymentRead,
    AthleteRead,
    AthleteUpdate,
    MonthStatusRow,
    PeriodAthleteReportRow,
    PeriodReportResponse,
)

router = APIRouter()

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


def _ensure_athlete_owner(db: Session, athlete_id: int, user: User) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id, Athlete.coach_id == user.id).first()
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


PDF_FONT_NAME = "ReceiptFontBG"
PDF_FONT_REGISTERED = False


def _ensure_pdf_font() -> str:
    global PDF_FONT_REGISTERED
    if PDF_FONT_REGISTERED:
        return PDF_FONT_NAME

    font_candidates = [
        Path("C:/Windows/Fonts/arial.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
        Path("/usr/share/fonts/dejavu/DejaVuSans.ttf"),
    ]
    for candidate in font_candidates:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont(PDF_FONT_NAME, str(candidate)))
            PDF_FONT_REGISTERED = True
            return PDF_FONT_NAME

    raise HTTPException(status_code=500, detail="Не е намерен подходящ шрифт за PDF (кирилица).")


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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    q = db.query(Athlete).filter(Athlete.coach_id == current_user.id).order_by(Athlete.athlete_name.asc())
    if query and query.strip():
        search = f"%{query.strip()}%"
        q = q.filter(
            (Athlete.athlete_name.ilike(search))
            | (Athlete.parent_name.ilike(search))
            | (Athlete.athlete_phone.ilike(search))
            | (Athlete.parent_phone.ilike(search))
        )
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

    return athletes


@router.post("/fees/athletes", response_model=AthleteRead, status_code=status.HTTP_201_CREATED)
def create_athlete(
    payload: AthleteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    name = (payload.athlete_name or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="athlete_name is required")
    athlete = Athlete(
        coach_id=current_user.id,
        club_id=current_user.club_id,
        athlete_name=name,
        athlete_phone=(payload.athlete_phone or "").strip() or None,
        parent_name=(payload.parent_name or "").strip() or None,
        parent_phone=(payload.parent_phone or "").strip() or None,
        birth_year=payload.birth_year,
        notes=(payload.notes or "").strip() or None,
        is_active=bool(payload.is_active),
    )
    db.add(athlete)
    db.commit()
    db.refresh(athlete)
    return athlete


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

        birth_year = None
        if str(birth_year_raw).strip():
            try:
                birth_year = int(float(str(birth_year_raw).strip()))
            except Exception:
                birth_year = None

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
            birth_year=birth_year,
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
        "име на състезател,телефон състезател,име на родител,телефон родител,година на раждане,бележка,активен\n"
        "Иван Иванов,0888123456,Петър Иванов,0899123456,2010,Примерен запис,да\n"
    )
    data = csv_content.encode("utf-8-sig")
    headers = {
        "Content-Disposition": 'attachment; filename="shablon_sastezateli_import.csv"'
    }
    return Response(content=data, media_type="text/csv; charset=utf-8", headers=headers)


@router.put("/fees/athletes/{athlete_id}", response_model=AthleteRead)
def update_athlete(
    athlete_id: int,
    payload: AthleteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owner(db, athlete_id, current_user)
    data = payload.model_dump(exclude_unset=True)

    if "athlete_name" in data:
        name = (data.get("athlete_name") or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="athlete_name cannot be empty")
        athlete.athlete_name = name
    if "athlete_phone" in data:
        athlete.athlete_phone = (data.get("athlete_phone") or "").strip() or None
    if "parent_name" in data:
        athlete.parent_name = (data.get("parent_name") or "").strip() or None
    if "parent_phone" in data:
        athlete.parent_phone = (data.get("parent_phone") or "").strip() or None
    if "birth_year" in data:
        athlete.birth_year = data.get("birth_year")
    if "notes" in data:
        athlete.notes = (data.get("notes") or "").strip() or None
    if "is_active" in data:
        athlete.is_active = bool(data.get("is_active"))

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
    athlete = _ensure_athlete_owner(db, athlete_id, current_user)
    db.delete(athlete)
    db.commit()
    return None


@router.post("/fees/athletes/{athlete_id}/payments", response_model=AthletePaymentRead, status_code=status.HTTP_201_CREATED)
def save_month_payment(
    athlete_id: int,
    payload: AthletePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owner(db, athlete_id, current_user)
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
    return payment


@router.get("/fees/athletes/{athlete_id}/payments", response_model=AthleteMonthlyReport)
def athlete_monthly_report(
    athlete_id: int,
    from_month: str = Query(...),
    to_month: str = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    athlete = _ensure_athlete_owner(db, athlete_id, current_user)
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
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    months = _iter_months(from_month, to_month)
    athletes = db.query(Athlete).filter(Athlete.coach_id == current_user.id).order_by(Athlete.athlete_name.asc()).all()
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
    payment = (
        db.query(AthletePayment)
        .join(Athlete, Athlete.id == AthletePayment.athlete_id)
        .filter(AthletePayment.id == payment_id, Athlete.coach_id == current_user.id)
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    athlete = payment.athlete
    paid_on = payment.paid_at.strftime("%d.%m.%Y %H:%M")
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
        f"Платена сума: {payment.amount:.2f} лв.",
    ]
    if payment.note:
        lines.append(f"Бележка: {payment.note}")
    lines.append("")
    lines.append("Документът е генериран автоматично от Volley Coach Platform.")

    pdf_bytes = _build_receipt_pdf(lines)
    file_name = f"kvitanciya_{payment.id}_{payment.month_key}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{file_name}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)

