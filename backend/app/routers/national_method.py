from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, List, Optional
import os

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    ClubCycleInstance,
    Drill,
    MethodArticle,
    MethodAssignment,
    MethodCycle,
    MethodGuideline,
    MethodSource,
    Team,
    User,
    UserRole,
)
from app.national_method.constants import AGE_BANDS, CONTENT_TYPES, CYCLE_TYPES, METHOD_CATEGORIES, PUBLISH_STATUSES
from app.national_method.cycle_article_links import find_cycles_for_article
from app.national_method.inventory import MATERIAL_INVENTORY

router = APIRouter(prefix="/api/national-method", tags=["National Method Library"])

ADMIN_ROLES = (UserRole.platform_admin, UserRole.federation_admin)
COACH_ROLES = (UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)
HEAD_ROLES = (UserRole.club_head_coach,)


def _utcnow():
    return datetime.utcnow()


def _ensure_head(user: User):
    if user.role != UserRole.club_head_coach:
        raise HTTPException(status_code=403, detail="Only club head coach")
    if not user.club_id:
        raise HTTPException(status_code=422, detail="Head coach has no club")


# ---------- Schemas ----------


class SourceIn(BaseModel):
    filename: str
    original_language: str = "it"
    content_type: str = "methodology"
    age_band: str = "all"
    rights_note: Optional[str] = None
    admin_notes: Optional[str] = None
    wave: int = 1
    extracted_text: Optional[str] = None


class SourceOut(SourceIn):
    id: int
    ingest_status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ArticleIn(BaseModel):
    source_id: Optional[int] = None
    title_bg: str
    body_bg: str
    category: str = "methodology"
    age_band: str = "all"
    status: str = "draft"
    sort_order: int = 0
    source_url: Optional[str] = None
    author: Optional[str] = None
    series: Optional[str] = None
    summary_bg: Optional[str] = None
    key_points: Optional[List[str]] = None
    content_origin: Optional[str] = None


class ArticleOut(ArticleIn):
    id: int
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GuidelineOut(BaseModel):
    id: int
    skill_element: str
    error_bg: str
    correction_bg: str
    age_band: str
    sort_order: int

    class Config:
        from_attributes = True


class CycleIn(BaseModel):
    source_id: Optional[int] = None
    title_bg: str
    summary_bg: Optional[str] = None
    cycle_type: str = "meso"
    weeks: int = 4
    age_band: str = "all"
    structure_json: dict = Field(default_factory=dict)
    status: str = "draft"
    sort_order: int = 0


class CycleOut(CycleIn):
    id: int
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class NationalDrillIn(BaseModel):
    title: str
    description: Optional[str] = None
    goal: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None
    method_source_id: Optional[int] = None
    skill_domains: Optional[List[str]] = None
    game_phases: Optional[List[str]] = None


class CycleInstanceIn(BaseModel):
    team_id: int
    cycle_id: int
    start_date: str
    customizations_json: Optional[dict] = None


class MethodAssignmentIn(BaseModel):
    assignee_ids: List[int]
    title_bg: str
    guidance_bg: Optional[str] = None
    cycle_id: Optional[int] = None
    club_cycle_instance_id: Optional[int] = None
    week_ref: Optional[int] = None
    drill_ids: Optional[List[int]] = None
    due_date: Optional[str] = None


# ---------- Meta / inventory ----------


@router.get("/meta")
def library_meta():
    return {
        "age_bands": AGE_BANDS,
        "content_types": CONTENT_TYPES,
        "cycle_types": CYCLE_TYPES,
        "categories": METHOD_CATEGORIES,
        "publish_statuses": PUBLISH_STATUSES,
        "material_inventory": MATERIAL_INVENTORY,
    }


# ---------- Admin: sources ----------


@router.get("/admin/sources", response_model=List[SourceOut])
def admin_list_sources(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    return db.query(MethodSource).order_by(MethodSource.id.desc()).all()


@router.post("/admin/sources", response_model=SourceOut)
def admin_create_source(
    payload: SourceIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = MethodSource(**payload.model_dump(), created_by=user.id, ingest_status="pending")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/admin/sources/{source_id}", response_model=SourceOut)
def admin_update_source(
    source_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = db.query(MethodSource).filter(MethodSource.id == source_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
    for k, v in payload.items():
        if hasattr(row, k):
            setattr(row, k, v)
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.post("/admin/sources/{source_id}/extract")
def admin_extract_source(
    source_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    """Маркира извличане: ако има extracted_text — преминава към extracted."""
    row = db.query(MethodSource).filter(MethodSource.id == source_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
    if not (row.extracted_text or "").strip():
        raise HTTPException(status_code=422, detail="Поставете извлечен текст преди extract")
    row.ingest_status = "extracted"
    row.updated_at = _utcnow()
    db.commit()
    return {"ok": True, "ingest_status": row.ingest_status}


# ---------- Admin: articles ----------


@router.get("/admin/articles", response_model=List[ArticleOut])
def admin_list_articles(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    q = db.query(MethodArticle).order_by(MethodArticle.sort_order.asc(), MethodArticle.id.asc())
    if status:
        q = q.filter(MethodArticle.status == status)
    return q.all()


@router.post("/admin/articles", response_model=ArticleOut)
def admin_create_article(
    payload: ArticleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = MethodArticle(**payload.model_dump(), created_by=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/admin/articles/{article_id}", response_model=ArticleOut)
def admin_update_article(
    article_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = db.query(MethodArticle).filter(MethodArticle.id == article_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    for k, v in payload.items():
        if hasattr(row, k):
            setattr(row, k, v)
    if payload.get("status") == "published" and not row.published_at:
        row.published_at = _utcnow()
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/articles/{article_id}")
def admin_delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = db.query(MethodArticle).filter(MethodArticle.id == article_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---------- Admin: cycles ----------


@router.get("/admin/cycles", response_model=List[CycleOut])
def admin_list_cycles(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    q = db.query(MethodCycle).order_by(MethodCycle.sort_order.asc(), MethodCycle.id.asc())
    if status:
        q = q.filter(MethodCycle.status == status)
    return q.all()


@router.post("/admin/cycles", response_model=CycleOut)
def admin_create_cycle(
    payload: CycleIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = MethodCycle(**payload.model_dump(), created_by=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/admin/cycles/{cycle_id}", response_model=CycleOut)
def admin_update_cycle(
    cycle_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = db.query(MethodCycle).filter(MethodCycle.id == cycle_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cycle not found")
    for k, v in payload.items():
        if hasattr(row, k):
            setattr(row, k, v)
    if payload.get("status") == "published" and not row.published_at:
        row.published_at = _utcnow()
    row.updated_at = _utcnow()
    db.commit()
    db.refresh(row)
    return row


@router.delete("/admin/cycles/{cycle_id}")
def admin_delete_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    row = db.query(MethodCycle).filter(MethodCycle.id == cycle_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cycle not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# ---------- Admin: national drills ----------


@router.post("/admin/import-library")
def admin_import_bvf_library(
    force: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    from pathlib import Path as _Path

    from app.scripts.ingest_volleycomment import EXPORT_PATH, import_to_db

    if EXPORT_PATH.is_file():
        out = {"volleycomment": import_to_db(force=force)}
        from app.national_method.cycle_article_links import sync_all_cycle_links

        out["cycle_links"] = sync_all_cycle_links(db)
    else:
        out = {
            "error": "Липсва bvf_volleycomment_bg.json — python -m app.scripts.ingest_volleycomment --export",
            "skipped": True,
        }
    db.commit()
    out["totals"] = library_stats(db)
    return out


@router.get("/admin/drills")
def admin_list_national_drills(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    rows = db.query(Drill).filter(Drill.scope == "federation").order_by(Drill.id.asc()).all()
    return [_drill_dict(d) for d in rows]


@router.post("/admin/drills")
def admin_create_national_drill(
    payload: NationalDrillIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    data = payload.model_dump(exclude_unset=True)
    drill = Drill(
        **data,
        scope="federation",
        is_national_read_only=True,
        status="approved",
        created_by=user.id,
        created_at=_utcnow(),
        updated_at=_utcnow(),
    )
    db.add(drill)
    db.commit()
    db.refresh(drill)
    return _drill_dict(drill)


@router.patch("/admin/drills/{drill_id}")
def admin_patch_national_drill(
    drill_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    drill = db.query(Drill).filter(Drill.id == drill_id, Drill.scope == "federation").first()
    if not drill:
        raise HTTPException(status_code=404, detail="National drill not found")
    for k, v in payload.items():
        if hasattr(drill, k) and k not in ("scope", "is_national_read_only", "status"):
            setattr(drill, k, v)
    drill.updated_at = _utcnow()
    db.commit()
    db.refresh(drill)
    return _drill_dict(drill)


def _drill_dict(d: Drill) -> dict:
    return {
        "id": d.id,
        "title": d.title,
        "description": d.description,
        "goal": d.goal,
        "category": d.category,
        "level": d.level,
        "age_min": d.age_min,
        "age_max": d.age_max,
        "setup": d.setup,
        "instructions": d.instructions,
        "coaching_points": d.coaching_points,
        "scope": d.scope,
        "is_national_read_only": d.is_national_read_only,
        "method_source_id": d.method_source_id,
        "status": d.status,
    }


# ---------- Coach read (published only) ----------


@router.get("/library")
def coach_library(
    age_band: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    # Фаза A: основно съдържание от Volley Comment (БФВ), без PDF/GTP архив
    aq = db.query(MethodArticle).filter(MethodArticle.status == "published")
    vc_count = aq.filter(MethodArticle.content_origin == "volleycomment").count()
    if vc_count > 0:
        aq = aq.filter(MethodArticle.content_origin == "volleycomment")
    else:
        aq = aq.filter(
            (MethodArticle.title_bg.is_(None)) | (~MethodArticle.title_bg.like("PDF:%")),
            (MethodArticle.content_origin.is_(None)) | (MethodArticle.content_origin != "legacy_pdf"),
        )
    cq = db.query(MethodCycle).filter(MethodCycle.status == "published")
    dq = db.query(Drill).filter(Drill.scope == "federation", Drill.status == "approved")
    if age_band and age_band != "all":
        aq = aq.filter(MethodArticle.age_band.in_([age_band, "all"]))
        cq = cq.filter(MethodCycle.age_band.in_([age_band, "all"]))
        lo, hi = _age_band_range(age_band)
        dq = dq.filter(
            (Drill.age_min.is_(None)) | (Drill.age_min <= hi),
            (Drill.age_max.is_(None)) | (Drill.age_max >= lo),
        )
    articles = aq.order_by(MethodArticle.sort_order.asc()).all()
    cycles_out = []
    for c in cq.order_by(MethodCycle.sort_order.asc()).all():
        s = c.structure_json or {}
        link_n = sum(len(w.get("related_articles") or []) for w in (s.get("weeks") or []))
        link_n += len(s.get("program_articles") or [])
        row = CycleOut.model_validate(c).model_dump()
        row["linked_articles_count"] = link_n
        cycles_out.append(row)
    # Упражнения: ограничен брой, докато не са подбрани от БФВ методика
    drills = dq.order_by(Drill.id.asc()).limit(40).all()
    guidelines = (
        db.query(MethodGuideline)
        .filter(MethodGuideline.status == "published")
        .order_by(MethodGuideline.sort_order.asc())
        .all()
    )
    return {
        "articles": [ArticleOut.model_validate(a) for a in articles],
        "cycles": cycles_out,
        "drills": [_drill_dict(d) for d in drills],
        "guidelines": [GuidelineOut.model_validate(g) for g in guidelines],
    }


def _age_band_range(band: str) -> tuple[int, int]:
    mapping = {
        "U13": (12, 13),
        "U14": (13, 14),
        "U15": (14, 15),
        "U16": (15, 16),
        "U17": (16, 17),
        "U18": (17, 18),
        "senior": (18, 99),
    }
    return mapping.get(band, (0, 99))


@router.get("/articles/{article_id}", response_model=ArticleOut)
def coach_get_article(
    article_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    row = db.query(MethodArticle).filter(
        MethodArticle.id == article_id, MethodArticle.status == "published"
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Article not found")
    return row


@router.get("/cycles/{cycle_id}")
def coach_get_cycle(
    cycle_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    row = db.query(MethodCycle).filter(MethodCycle.id == cycle_id, MethodCycle.status == "published").first()
    if not row:
        raise HTTPException(status_code=404, detail="Cycle not found")
    base = CycleOut.model_validate(row).model_dump()
    s = row.structure_json or {}
    base["program_articles"] = s.get("program_articles") or []
    base["bvf_series"] = s.get("bvf_series")
    return base


@router.get("/articles/{article_id}/cycles")
def coach_article_cycles(
    article_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    return find_cycles_for_article(db, article_id)


@router.get("/drills/{drill_id}")
def coach_get_national_drill(
    drill_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    drill = db.query(Drill).filter(
        Drill.id == drill_id, Drill.scope == "federation", Drill.status == "approved"
    ).first()
    if not drill:
        raise HTTPException(status_code=404, detail="Drill not found")
    return _drill_dict(drill)


# ---------- Club head: cycle instances ----------


@router.get("/club/cycle-instances")
def head_list_cycle_instances(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(user)
    rows = (
        db.query(ClubCycleInstance)
        .filter(ClubCycleInstance.club_id == user.club_id)
        .order_by(ClubCycleInstance.id.desc())
        .all()
    )
    out = []
    for r in rows:
        cycle = db.query(MethodCycle).filter(MethodCycle.id == r.cycle_id).first()
        team = db.query(Team).filter(Team.id == r.team_id).first()
        out.append(
            {
                "id": r.id,
                "team_id": r.team_id,
                "team_name": team.name if team else None,
                "cycle_id": r.cycle_id,
                "cycle_title": cycle.title_bg if cycle else None,
                "start_date": r.start_date,
                "status": r.status,
                "customizations_json": r.customizations_json,
            }
        )
    return out


@router.post("/club/cycle-instances")
def head_create_cycle_instance(
    payload: CycleInstanceIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(user)
    team = db.query(Team).filter(Team.id == payload.team_id, Team.club_id == user.club_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    cycle = db.query(MethodCycle).filter(
        MethodCycle.id == payload.cycle_id, MethodCycle.status == "published"
    ).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Published cycle not found")
    row = ClubCycleInstance(
        club_id=user.club_id,
        team_id=payload.team_id,
        cycle_id=payload.cycle_id,
        start_date=payload.start_date,
        customizations_json=payload.customizations_json,
        created_by=user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id}


@router.patch("/club/cycle-instances/{instance_id}")
def head_update_cycle_instance(
    instance_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(user)
    row = (
        db.query(ClubCycleInstance)
        .filter(ClubCycleInstance.id == instance_id, ClubCycleInstance.club_id == user.club_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Instance not found")
    for k in ("start_date", "customizations_json", "status"):
        if k in payload:
            setattr(row, k, payload[k])
    row.updated_at = _utcnow()
    db.commit()
    return {"ok": True}


# ---------- Club head: method assignments ----------


@router.get("/club/method-assignments")
def head_list_method_assignments(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(user)
    rows = (
        db.query(MethodAssignment)
        .filter(MethodAssignment.club_id == user.club_id)
        .order_by(MethodAssignment.id.desc())
        .all()
    )
    return [_assignment_dict(db, r) for r in rows]


@router.post("/club/method-assignments")
def head_create_method_assignments(
    payload: MethodAssignmentIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    _ensure_head(user)
    assignee_ids = sorted(set(int(x) for x in payload.assignee_ids if x))
    coaches = (
        db.query(User)
        .filter(
            User.id.in_(assignee_ids),
            User.club_id == user.club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .all()
    )
    if len(coaches) != len(assignee_ids):
        raise HTTPException(status_code=422, detail="Invalid assignees")
    created = 0
    for coach_id in assignee_ids:
        row = MethodAssignment(
            club_id=user.club_id,
            assigned_by=user.id,
            assigned_to=coach_id,
            cycle_id=payload.cycle_id,
            club_cycle_instance_id=payload.club_cycle_instance_id,
            week_ref=payload.week_ref,
            title_bg=payload.title_bg.strip(),
            guidance_bg=(payload.guidance_bg or "").strip() or None,
            drill_ids=payload.drill_ids,
            due_date=(payload.due_date or "").strip() or None,
            status="new",
        )
        db.add(row)
        created += 1
    db.commit()
    return {"created": created}


@router.get("/method-assignments/my")
def coach_my_method_assignments(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    rows = (
        db.query(MethodAssignment)
        .filter(MethodAssignment.assigned_to == user.id)
        .order_by(MethodAssignment.id.desc())
        .all()
    )
    return [_assignment_dict(db, r) for r in rows]


@router.patch("/method-assignments/{assignment_id}")
def update_method_assignment(
    assignment_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.coach, UserRole.club_head_coach)),
):
    row = db.query(MethodAssignment).filter(MethodAssignment.id == assignment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")
    is_assignee = row.assigned_to == user.id
    is_head = user.role == UserRole.club_head_coach and row.club_id == user.club_id
    if not is_assignee and not is_head:
        raise HTTPException(status_code=403, detail="Forbidden")
    if is_assignee:
        if "status" in payload:
            row.status = payload["status"]
        if "completion_note" in payload:
            row.completion_note = payload["completion_note"]
    if is_head and user.role == UserRole.club_head_coach:
        for k in ("title_bg", "guidance_bg", "due_date", "drill_ids", "week_ref"):
            if k in payload:
                setattr(row, k, payload[k])
    row.updated_at = _utcnow()
    db.commit()
    return _assignment_dict(db, row)


def _assignment_dict(db: Session, r: MethodAssignment) -> dict:
    assignee = db.query(User).filter(User.id == r.assigned_to).first()
    return {
        "id": r.id,
        "club_id": r.club_id,
        "assigned_to": r.assigned_to,
        "assignee_name": assignee.name if assignee else None,
        "cycle_id": r.cycle_id,
        "club_cycle_instance_id": r.club_cycle_instance_id,
        "week_ref": r.week_ref,
        "title_bg": r.title_bg,
        "guidance_bg": r.guidance_bg,
        "drill_ids": r.drill_ids or [],
        "due_date": r.due_date,
        "status": r.status,
        "completion_note": r.completion_note,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }
