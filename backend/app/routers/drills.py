from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any
from datetime import datetime

import os
import time
import threading

import httpx

from ..database import get_db
from ..models import Drill, UserRole
from ..dependencies.roles import require_role
from ..services.external_video import is_allowed_video_url, resolve_stream_target

router = APIRouter()


# ========================
# Pydantic Schemas (ПЪЛНИ по drills.csv)
# ========================

class DrillBase(BaseModel):
    # Основни
    title: str
    description: Optional[str] = None
    goal: Optional[str] = None

    # Категоризация
    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    # Етикети/метрики
    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    # Възраст
    age_min: Optional[int] = None
    age_max: Optional[int] = None

    # Организация
    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    # Филтри за генератора (lists)
    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    # Тип / цел
    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    # Методика
    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    # Медия
    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None


class DrillCreate(DrillBase):
    pass


class DrillUpdate(BaseModel):
    # Всичко optional при PATCH
    title: Optional[str] = None
    description: Optional[str] = None
    goal: Optional[str] = None

    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    age_min: Optional[int] = None
    age_max: Optional[int] = None

    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None

    status: Optional[str] = Field(default=None, description="draft | pending | approved | rejected")
    rejection_reason: Optional[str] = None


class DrillDecision(BaseModel):
    action: str = Field(..., description="approve или reject")
    rejection_reason: Optional[str] = None


class DrillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int

    title: str
    description: Optional[str] = None
    goal: Optional[str] = None

    category: Optional[str] = None
    level: Optional[str] = None
    skill_focus: Optional[str] = None

    rpe: Optional[int] = None
    intensity_type: Optional[str] = None
    complexity_level: Optional[str] = None
    decision_level: Optional[str] = None

    age_min: Optional[int] = None
    age_max: Optional[int] = None

    players: Optional[str] = None
    equipment: Optional[str] = None
    duration_min: Optional[int] = None
    duration_max: Optional[int] = None
    variations: Optional[str] = None

    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None
    tactical_focus: Optional[List[str]] = None
    technical_focus: Optional[List[str]] = None
    position_focus: Optional[List[str]] = None
    zone_focus: Optional[List[str]] = None

    training_goal: Optional[str] = None
    type_of_drill: Optional[str] = None

    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    image_urls: Optional[List[str]] = None
    video_urls: Optional[List[str]] = None

    created_by: Optional[int] = None
    status: str
    rejection_reason: Optional[str] = None

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    scope: Optional[str] = "community"
    is_national_read_only: Optional[bool] = False
    method_source_id: Optional[int] = None


# ========================
# Helpers
# ========================

def _list_approved(db: Session):
    return (
        db.query(Drill)
        .filter(Drill.status == "approved")
        .order_by(Drill.scope.desc(), Drill.id.asc())
        .all()
    )


# ------------------------------------------------------------------
# Кеш на одобрените упражнения.
#
# Каталогът е еднакъв за всички и се променя рядко (само при админско
# одобрение/редакция/триене). Без кеш всеки потребител, който отвори
# AI генератора или списъка с упражнения, удря базата за целия каталог —
# при стотици едновременни треньори това сериализира единствения worker.
#
# Затова пазим валидирания списък в паметта на процеса за кратко време
# (TTL) и го инвалидираме при всяка промяна. Отговорът остава идентичен.
# ------------------------------------------------------------------
_APPROVED_CACHE: dict[str, Any] = {"data": None, "ts": 0.0}
_APPROVED_TTL = float(os.getenv("DRILLS_CACHE_TTL", "120"))
_APPROVED_LOCK = threading.Lock()


def _approved_drills_cached(db: Session) -> "List[DrillOut]":
    now = time.time()
    cached = _APPROVED_CACHE["data"]
    if cached is not None and (now - float(_APPROVED_CACHE["ts"])) < _APPROVED_TTL:
        return cached
    with _APPROVED_LOCK:
        # Повторна проверка след взимане на ключалката (друг thread може вече да е презаредил).
        cached = _APPROVED_CACHE["data"]
        if cached is not None and (time.time() - float(_APPROVED_CACHE["ts"])) < _APPROVED_TTL:
            return cached
        data = [DrillOut.model_validate(d) for d in _list_approved(db)]
        _APPROVED_CACHE["data"] = data
        _APPROVED_CACHE["ts"] = time.time()
        return data


def _invalidate_approved_cache() -> None:
    _APPROVED_CACHE["data"] = None
    _APPROVED_CACHE["ts"] = 0.0


def _list_pending(db: Session):
    return db.query(Drill).filter(Drill.status == "pending").order_by(Drill.id.desc()).all()


# ========================
# Public list (approved)
# ========================

@router.get("", response_model=List[DrillOut])
def list_drills(response: Response, db: Session = Depends(get_db)):
    # Позволяваме на браузъра да преизползва списъка за кратко, за да не тегли
    # целия каталог при всяко прещракване между екрани. Данните са общи и
    # рядко се менят, затова кратко кеширане е безопасно.
    response.headers["Cache-Control"] = "public, max-age=60"
    return _approved_drills_cached(db)


# ========================
# Coach submit (pending)
# ========================

@router.post("", response_model=DrillOut)
def coach_submit_drill(
    payload: DrillCreate,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.coach)),
):
    drill = Drill(**payload.model_dump(exclude_unset=True))
    drill.scope = "community"
    drill.is_national_read_only = False
    drill.created_by = user.id
    drill.status = "pending"
    drill.created_at = datetime.utcnow()
    drill.updated_at = datetime.utcnow()

    db.add(drill)
    db.commit()
    db.refresh(drill)
    return drill


# ========================
# Coach my drills
# ========================

@router.get("/my", response_model=List[DrillOut])
def coach_my_drills(
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.coach)),
):
    return db.query(Drill).filter(Drill.created_by == user.id).order_by(Drill.id.desc()).all()


# ========================
# Admin pending list
# ========================

@router.get("/admin/pending", response_model=List[DrillOut])
def admin_list_pending(
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    return _list_pending(db)


# ========================
# Admin decision approve/reject
# ========================

@router.post("/admin/{drill_id}/decision", response_model=DrillOut)
def admin_decide(
    drill_id: int,
    decision: DrillDecision,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    action = decision.action.lower().strip()
    if action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be approve or reject")

    if action == "approve":
        drill.status = "approved"
        drill.rejection_reason = None
    else:
        drill.status = "rejected"
        drill.rejection_reason = decision.rejection_reason

    drill.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(drill)
    _invalidate_approved_cache()
    return drill


# ========================
# Admin update / delete
# ========================

@router.patch("/{drill_id}", response_model=DrillOut)
def admin_update_drill(
    drill_id: int,
    payload: DrillUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(drill, k, v)

    drill.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(drill)
    _invalidate_approved_cache()
    return drill


@router.delete("/{drill_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_drill(
    drill_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")

    db.delete(drill)
    db.commit()
    _invalidate_approved_cache()
    return None


# ========================
# Embedded video stream (Google Drive proxy)
# ========================


@router.get("/video/stream")
async def stream_drill_video(request: Request, url: str):
    """
    Proxy a publicly shared external video for in-app HTML5 playback.
    Supports Google Drive (anyone-with-link), Dropbox raw links, and direct video URLs.
    """
    if not url or not is_allowed_video_url(url):
        raise HTTPException(status_code=400, detail="Invalid or unsupported video URL")

    try:
        target = await resolve_stream_target(url)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid or unsupported video URL")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not resolve video from source")

    forward_headers: dict[str, str] = {}
    range_header = request.headers.get("range")
    if range_header:
        forward_headers["Range"] = range_header

    client = httpx.AsyncClient(follow_redirects=True, timeout=120.0)
    try:
        req = client.build_request("GET", target, headers=forward_headers)
        upstream = await client.send(req, stream=True)
    except Exception:
        await client.aclose()
        raise HTTPException(status_code=502, detail="Upstream video unavailable")

    if upstream.status_code >= 400:
        await upstream.aclose()
        await client.aclose()
        raise HTTPException(status_code=502, detail="Upstream video unavailable")

    out_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
    }
    if upstream.headers.get("content-type"):
        out_headers["Content-Type"] = upstream.headers.get("content-type")
    if upstream.headers.get("content-length"):
        out_headers["Content-Length"] = upstream.headers.get("content-length")
    if upstream.headers.get("content-range"):
        out_headers["Content-Range"] = upstream.headers.get("content-range")

    async def body_iter():
        try:
            async for chunk in upstream.aiter_bytes(65536):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        body_iter(),
        status_code=upstream.status_code,
        headers=out_headers,
        media_type=upstream.headers.get("content-type", "video/mp4"),
    )


# ========================
# Drill details
# ========================

@router.get("/{drill_id}", response_model=DrillOut)
def get_drill(drill_id: int, db: Session = Depends(get_db)):
    drill = db.query(Drill).filter(Drill.id == drill_id).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    return drill
