from __future__ import annotations

import hashlib
import secrets
from datetime import date, datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Club, Team, TeamAccessToken, TeamPortalItem, TeamPortalItemKind, User, UserRole
from app.routers.parent_portal import _build_schedule_for_teams, _month_key_now, _month_last_day
from app.routers.teams import _ensure_team_owner
from app.schemas.team_portal import (
    TeamAccessCreateResponse,
    TeamAccessStatusResponse,
    TeamPortalItemResponse,
    TeamPortalPublicResponse,
    TeamPortalTextCreate,
)

router = APIRouter()

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


def _portal_payload(db: Session, team: Team) -> TeamPortalPublicResponse:
    mk = _month_key_now()
    from_date = f"{mk}-01"
    to_date = _month_last_day(mk)
    schedule = _build_schedule_for_teams(db, [team.id], from_date, to_date)
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
        monthly_schedule=schedule,
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


@router.get("/team-portal/{token}", response_model=TeamPortalPublicResponse)
def team_portal_public(token: str, db: Session = Depends(get_db)):
    team = _resolve_team_from_token(db, token)
    return _portal_payload(db, team)
