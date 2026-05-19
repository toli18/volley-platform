from __future__ import annotations

import hashlib
import re
import secrets
from datetime import date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import AttendanceRecord, Club, Team, TeamAccessToken, TeamPortalItem, TeamPortalItemKind, TeamSession, User, UserRole
from app.routers.parent_portal import (
    _build_schedule_for_teams,
    _month_key_now,
    _month_last_day,
    _pick_next_by_kind,
)
from app.schemas.parent_portal import ParentAttendanceSummary, ParentScheduleItem
from app.routers.teams import _ensure_team_owner
from app.services.parent_portal_notify import queue_team_feed_post
from app.schemas.team_portal import (
    TeamAccessCreateResponse,
    TeamAccessStatusResponse,
    TeamPortalItemResponse,
    TeamPortalPublicResponse,
    TeamPortalTextCreate,
)

router = APIRouter()

_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")
_TEAM_ATTENDANCE_DAYS = 90
_UPCOMING_HORIZON_DAYS = 45

MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _token_preview(raw: str) -> str:
    if len(raw) <= 10:
        return raw
    return f"{raw[:6]}...{raw[-4:]}"


def _build_team_url(request: Request, token_raw: str) -> str:
    origin = (request.headers.get("origin") or "").strip().rstrip("/")
    if origin:
        return f"{origin}/team/{token_raw}"
    base = str(request.base_url).rstrip("/")
    return f"{base}/team/{token_raw}"


def _get_active_team_token(db: Session, team_id: int) -> TeamAccessToken | None:
    now = datetime.utcnow()
    row = (
        db.query(TeamAccessToken)
        .filter(TeamAccessToken.team_id == int(team_id), TeamAccessToken.is_active.is_(True))
        .order_by(TeamAccessToken.created_at.desc())
        .first()
    )
    if not row:
        return None
    if row.expires_at and row.expires_at < now:
        row.is_active = False
        db.commit()
        return None
    return row


def _resolve_team_from_token(db: Session, token: str) -> Team:
    row = (
        db.query(TeamAccessToken)
        .filter(TeamAccessToken.token_hash == _token_hash(token), TeamAccessToken.is_active.is_(True))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invalid team access link")
    if row.expires_at and row.expires_at < datetime.utcnow():
        row.is_active = False
        db.commit()
        raise HTTPException(status_code=410, detail="Team access link expired")
    team = db.query(Team).filter(Team.id == row.team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    row.last_used_at = datetime.utcnow()
    db.commit()
    return team


def _item_to_response(item: TeamPortalItem) -> TeamPortalItemResponse:
    return TeamPortalItemResponse(
        id=item.id,
        kind=item.kind.value if hasattr(item.kind, "value") else str(item.kind),
        body=item.body,
        url=item.url,
        file_name=item.file_name,
        mime_type=item.mime_type,
        created_at=item.created_at,
    )


def _monday_of_week_iso(iso_date: str | None = None) -> str:
    d = date.fromisoformat(iso_date or date.today().isoformat())
    d -= timedelta(days=d.weekday())
    return d.isoformat()


def _team_attendance_summary(db: Session, team_id: int, days: int = _TEAM_ATTENDANCE_DAYS) -> ParentAttendanceSummary:
    today = date.today()
    start = (today - timedelta(days=days)).isoformat()
    end = today.isoformat()
    session_ids = [
        sid
        for (sid,) in db.query(TeamSession.id)
        .filter(
            TeamSession.team_id == int(team_id),
            TeamSession.date >= start,
            TeamSession.date <= end,
        )
        .all()
    ]
    present = late = absent = excused = 0
    if session_ids:
        for (status,) in db.query(AttendanceRecord.status).filter(AttendanceRecord.session_id.in_(session_ids)).all():
            st = str(status or "").lower()
            if st == "present":
                present += 1
            elif st == "late":
                late += 1
            elif st == "absent":
                absent += 1
            elif st == "excused":
                excused += 1
    total = present + late + absent + excused
    rate = round(((present + late) / total) * 100.0, 1) if total else 0.0
    return ParentAttendanceSummary(
        present=present,
        late=late,
        absent=absent,
        excused=excused,
        total=total,
        attendance_rate_percent=rate,
    )


def _schedule_for_team_month(db: Session, team_id: int, month_key: str) -> list[ParentScheduleItem]:
    from_date = f"{month_key}-01"
    to_date = _month_last_day(month_key)
    return _build_schedule_for_teams(db, [team_id], from_date, to_date)


def _portal_payload(db: Session, team: Team, month_key: str | None = None) -> TeamPortalPublicResponse:
    mk = (month_key or _month_key_now()).strip()
    if not _MONTH_KEY_RE.match(mk):
        mk = _month_key_now()
    schedule = _schedule_for_team_month(db, team.id, mk)
    today = date.today()
    upcoming_pool = _build_schedule_for_teams(
        db,
        [team.id],
        today.isoformat(),
        (today + timedelta(days=_UPCOMING_HORIZON_DAYS)).isoformat(),
    )
    next_competition = _pick_next_by_kind(upcoming_pool, competition=True)
    club_name = None
    if team.club_id:
        club = db.query(Club).filter(Club.id == team.club_id).first()
        club_name = club.name if club else None
    items = (
        db.query(TeamPortalItem)
        .filter(TeamPortalItem.team_id == team.id)
        .order_by(TeamPortalItem.created_at.desc())
        .limit(80)
        .all()
    )
    return TeamPortalPublicResponse(
        team_name=team.name,
        club_name=club_name,
        schedule_month_key=mk,
        week_start=_monday_of_week_iso(),
        monthly_schedule=schedule,
        attendance_summary=_team_attendance_summary(db, team.id),
        next_competition=next_competition,
        items=[_item_to_response(i) for i in items],
    )


@router.get("/teams/{team_id}/team-access", response_model=TeamAccessStatusResponse)
def team_access_status(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    token_row = _get_active_team_token(db, team_id)
    if not token_row:
        return TeamAccessStatusResponse(has_active_token=False)
    return TeamAccessStatusResponse(
        has_active_token=True,
        token_preview=f"{token_row.token_prefix}...",
        expires_at=token_row.expires_at,
        last_used_at=token_row.last_used_at,
    )


@router.post("/teams/{team_id}/team-access", response_model=TeamAccessCreateResponse)
def create_team_access(
    team_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    db.query(TeamAccessToken).filter(TeamAccessToken.team_id == team_id).update(
        {TeamAccessToken.is_active: False}, synchronize_session=False
    )
    raw = secrets.token_urlsafe(32)
    row = TeamAccessToken(
        team_id=team_id,
        token_hash=_token_hash(raw),
        token_prefix=raw[:10],
        created_by_user_id=current_user.id,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return TeamAccessCreateResponse(team_url=_build_team_url(request, raw), token_preview=_token_preview(raw), expires_at=row.expires_at)


@router.post("/teams/{team_id}/team-access/rotate", response_model=TeamAccessCreateResponse)
def rotate_team_access(
    team_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    return create_team_access(team_id, request, db, current_user)


@router.delete("/teams/{team_id}/team-access", status_code=204)
def revoke_team_access(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    db.query(TeamAccessToken).filter(TeamAccessToken.team_id == team_id).update(
        {TeamAccessToken.is_active: False}, synchronize_session=False
    )
    db.commit()


@router.get("/teams/{team_id}/team-portal/items", response_model=list[TeamPortalItemResponse])
def list_team_portal_items_coach(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    items = (
        db.query(TeamPortalItem)
        .filter(TeamPortalItem.team_id == team_id)
        .order_by(TeamPortalItem.created_at.desc())
        .limit(80)
        .all()
    )
    return [_item_to_response(i) for i in items]


@router.post("/teams/{team_id}/team-portal/items/text", response_model=TeamPortalItemResponse, status_code=201)
def create_team_portal_text(
    team_id: int,
    payload: TeamPortalTextCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=400, detail="Text is required")
    item = TeamPortalItem(
        team_id=team_id,
        kind=TeamPortalItemKind.text,
        body=body,
        created_by_user_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    queue_team_feed_post(team_id, body)
    return _item_to_response(item)


@router.post("/teams/{team_id}/team-portal/items/image", response_model=TeamPortalItemResponse, status_code=201)
async def create_team_portal_image(
    team_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    safe_name = Path(file.filename or "image.jpg").name.replace(" ", "_")
    ext = Path(safe_name).suffix.lower()
    if ext not in ALLOWED_IMAGE_EXT:
        raise HTTPException(status_code=400, detail="Unsupported image type")
    content = await file.read()
    if len(content) <= 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="File too large (max 12MB)")

    final_name = f"{uuid4().hex}_{safe_name}"
    storage_dir = Path(__file__).resolve().parents[1] / "static" / "uploads" / "team-portal" / str(team_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / final_name
    file_path.write_bytes(content)
    public_url = f"/static/uploads/team-portal/{team_id}/{final_name}"

    item = TeamPortalItem(
        team_id=team_id,
        kind=TeamPortalItemKind.image,
        url=public_url,
        file_name=safe_name,
        mime_type=file.content_type or "image/jpeg",
        size_bytes=len(content),
        created_by_user_id=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_to_response(item)


@router.delete("/teams/{team_id}/team-portal/items/{item_id}", status_code=204)
def delete_team_portal_item(
    team_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    _ensure_team_owner(db, team_id, current_user)
    item = db.query(TeamPortalItem).filter(TeamPortalItem.id == item_id, TeamPortalItem.team_id == team_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.kind == TeamPortalItemKind.image and item.url and item.url.startswith("/static/"):
        rel = item.url.replace("/static/", "", 1)
        disk = Path(__file__).resolve().parents[1] / "static" / rel
        if disk.is_file():
            try:
                disk.unlink()
            except OSError:
                pass
    db.delete(item)
    db.commit()


@router.get("/team-portal/{token}/schedule", response_model=list[ParentScheduleItem])
def team_portal_schedule(
    token: str,
    month: str = Query(..., description="YYYY-MM"),
    db: Session = Depends(get_db),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    team = _resolve_team_from_token(db, token)
    return _schedule_for_team_month(db, team.id, month.strip())


@router.get("/team-portal/{token}", response_model=TeamPortalPublicResponse)
def team_portal_public(
    token: str,
    month: str | None = Query(None, description="YYYY-MM for initial schedule month"),
    db: Session = Depends(get_db),
):
    team = _resolve_team_from_token(db, token)
    month_key = None
    if month is not None:
        mk = month.strip()
        if not _MONTH_KEY_RE.match(mk):
            raise HTTPException(status_code=422, detail="month must be YYYY-MM")
        month_key = mk
    return _portal_payload(db, team, month_key)
