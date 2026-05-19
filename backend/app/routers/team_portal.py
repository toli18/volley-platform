from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import TeamPortalItem, TeamPortalItemKind, User, UserRole
from app.routers.teams import _ensure_team_owner
from app.services.parent_portal_notify import queue_team_feed_post
from app.schemas.team_portal import TeamPortalItemResponse, TeamPortalTextCreate

router = APIRouter()

MAX_IMAGE_BYTES = 12 * 1024 * 1024
ALLOWED_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


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
    queue_team_feed_post(team_id, "Нова снимка в отбора")
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
