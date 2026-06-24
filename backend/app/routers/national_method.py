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
from app.national_method.bvf_ai_knowledge import get_age_knowledge, resolve_age_band, week_context
from app.national_method.coach_hub import get_coach_section, list_coach_hub
from app.national_method.content_policy import is_allowed_federation_drill, is_allowed_method_article, purge_legacy_library
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
    include_legacy: bool = Query(False, description="Включи PDF/GTP/преведени архивни статии"),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    q = db.query(MethodArticle).order_by(MethodArticle.sort_order.asc(), MethodArticle.id.asc())
    if status:
        q = q.filter(MethodArticle.status == status)
    rows = q.all()
    if include_legacy:
        return rows
    out = []
    for art in rows:
        src = (
            db.query(MethodSource).filter(MethodSource.id == art.source_id).first()
            if art.source_id
            else None
        )
        if is_allowed_method_article(art, src):
            out.append(art)
    return out


@router.post("/admin/purge-legacy-library")
def admin_purge_legacy_library(
    dry_run: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    """Премахва EN/GTP/PDF и машинно преведени bundle от БД."""
    stats = purge_legacy_library(db, dry_run=dry_run)
    return stats


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

    from app.scripts.ingest_bvf_textbook import EXPORT_PATH, import_to_db

    if EXPORT_PATH.is_file() or (EXPORT_PATH.parent / "bvf_textbook_bg.txt").is_file():
        out = {"textbook": import_to_db(force=force, replace_vc=True)}
        from app.scripts.build_bvf_ai_knowledge import main as build_ai_knowledge

        build_ai_knowledge()
        out["ai_knowledge"] = "rebuilt"
    else:
        out = {
            "error": "Липсва bvf_textbook_bg.txt — python -m app.scripts.ingest_bvf_textbook --export",
            "skipped": True,
        }
    db.commit()
    out["totals"] = library_stats(db)
    return out


@router.post("/admin/seed-annual-program")
def admin_seed_annual_program(
    replace: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    """Обновява мезо/макро циклите на годишната програма в БД (без CLI)."""
    from app.scripts.seed_annual_program import seed_annual_program

    stats = seed_annual_program(db, replace=replace)
    db.commit()
    total = db.query(MethodCycle).filter(MethodCycle.status == "published").count()
    return {"ok": True, "stats": stats, "published_cycles": total}


@router.get("/admin/drills")
def admin_list_national_drills(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*ADMIN_ROLES)),
):
    rows = db.query(Drill).filter(Drill.scope == "federation").order_by(Drill.id.asc()).all()
    out = []
    for d in rows:
        src = (
            db.query(MethodSource).filter(MethodSource.id == d.method_source_id).first()
            if d.method_source_id
            else None
        )
        if is_allowed_federation_drill(d, src):
            out.append(_drill_dict(d))
    return out


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


@router.get("/coach-hub")
def coach_method_hub(
    age_band: str = Query("U14"),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Навигация за методически насоки."""
    return list_coach_hub(age_band)


@router.get("/coach-hub/{slug}")
def coach_method_hub_section(
    slug: str,
    age_band: str = Query("U14"),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Съдържание на една секция от методическите насоки."""
    data = get_coach_section(db, slug, age_band)
    if not data:
        raise HTTPException(status_code=404, detail="Section not found")
    return data


@router.get("/library")
def coach_library(
    age_band: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    cq = db.query(MethodCycle).filter(MethodCycle.status == "published")
    dq = db.query(Drill).filter(Drill.scope == "federation", Drill.status == "approved")
    band = resolve_age_band({"ageBand": age_band or "U14"})
    from app.national_method.annual_program import ensure_annual_program_seeded, library_tree, resolve_annual_program_band

    ensure_annual_program_seeded(db)
    db.commit()

    program_band = resolve_annual_program_band(band)
    if program_band:
        cq = cq.filter(MethodCycle.age_band.in_([program_band, "all"]))
    if age_band and age_band != "all":
        lo, hi = _age_band_range(band)
        dq = dq.filter(
            (Drill.age_min.is_(None)) | (Drill.age_min <= hi),
            (Drill.age_max.is_(None)) | (Drill.age_max >= lo),
        )
    k = get_age_knowledge(band)
    method_principles = {
        "age_band": band,
        "note": "Кратки принципи от методиката БФВ — пълният контекст се подава на AI генератора.",
        "principles": (k.get("principles") or [])[:10],
        "focus_priority": k.get("focus_priority") or [],
    }
    from app.national_method.content_policy import is_annual_program_cycle

    cycles_rows = [
        c for c in cq.order_by(MethodCycle.sort_order.asc()).all() if is_annual_program_cycle(c)
    ]

    cycles_out = []
    for c in cycles_rows:
        s = c.structure_json or {}
        link_n = sum(len(w.get("related_articles") or []) for w in (s.get("weeks") or []))
        link_n += len(s.get("program_articles") or [])
        row = CycleOut.model_validate(c).model_dump()
        row["linked_articles_count"] = link_n
        s_meta = c.structure_json or {}
        if s_meta.get("annual_program_key"):
            row["annual_program_key"] = s_meta.get("annual_program_key")
            row["meso_number"] = s_meta.get("meso_number")
            row["macro_id"] = s_meta.get("macro_id")
            row["period"] = s_meta.get("period")
            row["period_label"] = s_meta.get("period_label")
        cycles_out.append(row)
    drills_all = dq.order_by(Drill.id.asc()).all()
    drills = []
    for d in drills_all:
        src = (
            db.query(MethodSource).filter(MethodSource.id == d.method_source_id).first()
            if d.method_source_id
            else None
        )
        if is_allowed_federation_drill(d, src):
            drills.append(d)
    return {
        "method_principles": method_principles,
        "cycles": cycles_out,
        "annual_program": {
            **library_tree(cycles_rows, program_band),
            "requested_age_band": band,
            "program_age_band": program_band,
            "age_band_note": (
                f"Годишната програма в учебника е за {program_band}; използва се като най-близка група за {band}."
                if program_band != band
                else None
            ),
        },
        "drills": [_drill_dict(d) for d in drills],
    }


@router.get("/annual-cycles")
def coach_annual_cycles(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Всички публикувани годишни цикли (макро + мезо) по всички възрасти —
    за избор: възраст → макроцикъл → мезо шаблон."""
    from app.national_method.annual_program import ensure_annual_program_seeded
    from app.national_method.content_policy import is_annual_program_cycle

    ensure_annual_program_seeded(db)
    db.commit()

    rows = (
        db.query(MethodCycle)
        .filter(MethodCycle.status == "published")
        .order_by(MethodCycle.sort_order.asc())
        .all()
    )
    out = []
    for c in rows:
        s = c.structure_json or {}
        if not s.get("annual_program_key") or not is_annual_program_cycle(c):
            continue
        out.append(
            {
                "id": c.id,
                "title_bg": c.title_bg,
                "summary_bg": c.summary_bg,
                "age_band": c.age_band,
                "cycle_type": c.cycle_type,
                "macro_id": s.get("macro_id"),
                "macro_label": s.get("macro_label"),
                "meso_number": s.get("meso_number"),
                "period_label": s.get("period_label"),
                "months_bg": s.get("months_bg"),
            }
        )
    return out


@router.get("/textbook")
def coach_textbook_index(
    q: Optional[str] = Query(None),
    age_band: Optional[str] = Query(None),
    part: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    kind: Optional[str] = Query(None),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Навигация и търсене в учебника БФВ."""
    from app.national_method.textbook_index import search_sections, textbook_navigation

    base = textbook_navigation()
    if q or age_band or part or category or kind:
        base["search_results"] = search_sections(
            q or "",
            age_band=age_band,
            part=part,
            category=category,
            kind=kind,
        )
        base["search_query"] = q
    return base


@router.get("/textbook/{slug}")
def coach_textbook_section(
    slug: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    from app.national_method.textbook_index import get_section

    detail = get_section(slug, db)
    if not detail:
        raise HTTPException(status_code=404, detail="Section not found")
    return detail


@router.get("/method-context")
def coach_method_context(
    age_band: str = Query("U14"),
    cycle_week: Optional[int] = Query(None),
    cycle_day: Optional[int] = Query(None),
    cycle_id: Optional[int] = Query(None),
    textbook_slug: Optional[str] = Query(None),
    session_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Контекст за AI генератор — структурирана методика, не статии."""
    from app.national_method.cycle_days import merge_week_day_context, week_day_from_cycle

    from app.national_method.bvf_ai_knowledge import build_session_review, coach_principles_for_plan

    band = age_band if age_band != "all" else "U14"
    k = get_age_knowledge(band)
    wc = week_context(band, cycle_week)
    day_ctx = None
    row = None

    if cycle_id:
        row = db.query(MethodCycle).filter(MethodCycle.id == cycle_id, MethodCycle.status == "published").first()
        if row:
            wk, dy = week_day_from_cycle(
                row.structure_json,
                cycle_week,
                cycle_day,
                cycle_type=row.cycle_type,
                age_band=row.age_band,
            )
            if wk:
                wc = merge_week_day_context(wk, dy)
                day_ctx = dy

    from app.national_method.annual_program import annual_context_from_structure, textbook_slug_for_day

    annual_ctx = None
    tb_slug_resolved = textbook_slug
    if cycle_id and row:
        annual_ctx = annual_context_from_structure(row.structure_json)
        if not tb_slug_resolved and row.cycle_type == "meso":
            wk_raw, dy_raw = week_day_from_cycle(
                row.structure_json,
                cycle_week,
                cycle_day,
                cycle_type=row.cycle_type,
                age_band=row.age_band,
            )
            tb_slug_resolved = textbook_slug_for_day(row.structure_json, wk_raw, dy_raw)

    from app.national_method.textbook_index import resolve_textbook_for_ai

    tb_ctx = (
        resolve_textbook_for_ai(tb_slug_resolved, session_code, db)
        if (tb_slug_resolved or session_code)
        else None
    )
    if tb_ctx and tb_ctx.get("age_band") and tb_ctx["age_band"] != "all":
        band = tb_ctx["age_band"]
        k = get_age_knowledge(band)

    cues = (k.get("coach_cues") or [])[:4]
    if tb_ctx and tb_ctx.get("coach_cues"):
        cues = tb_ctx["coach_cues"][:6]

    session_review = build_session_review(
        age_band=band,
        week_ctx=wc,
        day_ctx=day_ctx,
        annual_ctx=annual_ctx,
        textbook_ctx=tb_ctx,
    )

    return {
        "age_band": band,
        "principles": coach_principles_for_plan(k.get("principles"), band),
        "session_structure": k.get("session_structure", []),
        "meso_weeks": k.get("meso_weeks", []),
        "week": wc,
        "day": day_ctx,
        "coach_cues": cues,
        "focus_priority": k.get("focus_priority", []),
        "textbook": tb_ctx,
        "annual_program": annual_ctx,
        "recommended": session_review.get("recommended"),
        "sessionReview": session_review,
    }


@router.get("/health")
def bvf_method_health(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Проверка на ключови BVF данни (учебник, годишна програма, упражнения)."""
    from app.models import Drill, MethodCycle
    from app.national_method.textbook_index import textbook_navigation

    idx = textbook_navigation()
    session_plans = sum(len(v or []) for v in (idx.get("session_plans_by_age") or {}).values())
    meso_cycles = (
        db.query(MethodCycle)
        .filter(MethodCycle.cycle_type == "meso", MethodCycle.status == "published")
        .count()
    )
    federation_drills = db.query(Drill).filter(Drill.scope == "federation").count()
    ok = session_plans >= 20 and meso_cycles >= 30 and federation_drills >= 50
    return {
        "ok": ok,
        "textbook_sections": int(idx.get("section_count") or 0),
        "session_plans": session_plans,
        "meso_cycles_published": meso_cycles,
        "federation_drills": federation_drills,
        "hint": None if ok else "Run seed scripts: ingest_bvf_textbook, seed_annual_program, seed_national_method",
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
    from app.national_method.annual_program import annual_context_from_structure
    from app.national_method.cycle_days import enrich_structure, sessions_per_week

    base = CycleOut.model_validate(row).model_dump()
    s = enrich_structure(
        row.structure_json or {},
        cycle_type=row.cycle_type,
        age_band=row.age_band,
    )
    annual_ctx = annual_context_from_structure(s)
    if annual_ctx:
        base["annual_program"] = annual_ctx
    weeks = []
    for w in s.get("weeks") or []:
        weeks.append(
            {
                "week": w.get("week"),
                "theme": w.get("theme"),
                "load": w.get("load"),
                "focus": w.get("focus"),
                "session_goals": w.get("session_goals"),
                "textbook_slug": w.get("textbook_slug"),
                "session_code": w.get("session_code"),
                "days": w.get("days") or [],
            }
        )
    base["weeks_detail"] = weeks
    base["sessions_per_week"] = s.get("sessions_per_week") or sessions_per_week(
        row.cycle_type, row.age_band, len(weeks)
    )
    base["ai_hint"] = (
        "Изберете седмица и тренировка в таблицата → AI генератор с контекст за конкретния ден."
    )
    return base


class ProgramWeekDayOut(BaseModel):
    date: Optional[str] = None
    weekday_label: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    is_cancelled: bool = False
    execution_status: Optional[str] = None
    training_id: Optional[int] = None
    training_status: Optional[str] = None
    has_program_day: bool = False
    day_label: Optional[str] = None
    theme: Optional[str] = None
    focus: List[str] = Field(default_factory=list)
    session_goal: Optional[str] = None
    intensity: Optional[str] = None
    textbook_slug: Optional[str] = None


class ProgramProgressOut(BaseModel):
    started: bool = False
    planned: int = 0
    executed: int = 0
    rate_pct: int = 0
    weeks_elapsed: int = 0
    meso_index: Optional[int] = None
    total_mesos: Optional[int] = None


class ProgramUnmappedDayOut(BaseModel):
    day_label: Optional[str] = None
    theme: Optional[str] = None
    focus: List[str] = Field(default_factory=list)
    session_goal: Optional[str] = None
    intensity: Optional[str] = None
    textbook_slug: Optional[str] = None


class ProgramWeekWindowOut(BaseModel):
    from_date: str
    to_date: str
    week_offset: int = 0


class ProgramTeamOptionOut(BaseModel):
    id: int
    name: Optional[str] = None
    has_program: bool = False


class ProgramWeekOut(BaseModel):
    has_program: bool = False
    team_id: int
    team_name: Optional[str] = None
    available_teams: List[ProgramTeamOptionOut] = Field(default_factory=list)
    cycle_title: Optional[str] = None
    age_band: Optional[str] = None
    start_date: Optional[str] = None
    meso_number: Optional[int] = None
    meso_index: Optional[int] = None
    total_mesos: Optional[int] = None
    meso_theme: Optional[str] = None
    period: Optional[str] = None
    period_label: Optional[str] = None
    months_bg: Optional[str] = None
    week_in_meso: int = 0
    weeks_per_meso: int = 4
    week_theme: Optional[str] = None
    week_focus: List[str] = Field(default_factory=list)
    week_load: Optional[str] = None
    week_done: int = 0
    week_mapped: int = 0
    started: bool = False
    completed: bool = False
    window: ProgramWeekWindowOut
    days: List[ProgramWeekDayOut] = Field(default_factory=list)
    unmapped_days: List[ProgramUnmappedDayOut] = Field(default_factory=list)
    extra_trainings: int = 0
    progress: Optional[ProgramProgressOut] = None
    message: Optional[str] = None


def _accessible_program_teams(db: Session, user: User) -> list[Team]:
    """Отборите, достъпни за текущия потребител според ролята.

    - coach: само неговите отбори;
    - club_head_coach: всички отбори на клуба;
    - federation_admin / platform_admin: всички активни отбори.
    """
    q = db.query(Team).filter(Team.is_active.is_(True))
    if user.role == UserRole.coach:
        q = q.filter(Team.coach_id == user.id)
    elif user.role == UserRole.club_head_coach:
        if not user.club_id:
            raise HTTPException(status_code=422, detail="Head coach has no club")
        q = q.filter(Team.club_id == user.club_id)
    # federation_admin / platform_admin: без допълнителен филтър.
    return q.order_by(Team.name.asc(), Team.id.asc()).all()


def _resolve_program_team(db: Session, user: User, team_id: Optional[int]) -> Team:
    """Намира отбор, достъпен за текущия треньор (или зададения team_id)."""
    from app.services.program_week_service import _active_instance_for_team

    teams = _accessible_program_teams(db, user)

    if team_id is not None:
        team = next((t for t in teams if t.id == team_id), None)
        if not team and user.role in (UserRole.federation_admin, UserRole.platform_admin):
            team = db.query(Team).filter(Team.id == team_id, Team.is_active.is_(True)).first()
        if not team:
            raise HTTPException(status_code=404, detail="Team not found")
        return team

    if not teams:
        raise HTTPException(status_code=404, detail="No teams available")
    for t in teams:
        if _active_instance_for_team(db, t.id) is not None:
            return t
    return teams[0]


@router.get("/program-week", response_model=ProgramWeekOut)
def coach_program_week(
    team_id: Optional[int] = Query(None),
    week_offset: int = Query(0, ge=-26, le=26),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(*COACH_ROLES)),
):
    """Read-only изглед „Моята програмна седмица" за отбор на треньора."""
    from app.services.program_week_service import build_program_week, _active_instance_for_team

    team = _resolve_program_team(db, user, team_id)
    data = build_program_week(db, team, week_offset=week_offset)
    data["available_teams"] = [
        {
            "id": t.id,
            "name": t.name,
            "has_program": _active_instance_for_team(db, t.id) is not None,
        }
        for t in _accessible_program_teams(db, user)
    ]
    return ProgramWeekOut.model_validate(data)


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


def _instance_position_summary(cycle, start_date_str, custom):
    """Резюме на текущата позиция (мезо/седмица) за инстанция — за списък и preview."""
    from datetime import date as _date

    from app.national_method import program_position as pos
    from app.national_method.annual_program import (
        meso_definitions_for,
        resolve_annual_program_band,
    )

    if not cycle:
        return None
    band = resolve_annual_program_band(cycle.age_band)
    defs = meso_definitions_for(band)
    if not defs:
        return None
    start_date = pos.parse_iso_date(start_date_str) or _date.today()
    custom = custom or {}
    override = custom.get("start_meso")
    cs = cycle.structure_json or {}
    if override is None and cs.get("meso_number"):
        override = cs.get("meso_number")
    p = pos.resolve_position(defs, start_date, _date.today(), start_meso_override=override)
    meso_number = p.get("meso_number")
    defn = (
        next((d for d in defs if int(d["meso_number"]) == int(meso_number)), None)
        if meso_number
        else None
    )
    return {
        "meso_number": meso_number,
        "meso_index": p.get("meso_index"),
        "total_mesos": p.get("total_mesos"),
        "week_in_meso": p.get("week_in_meso"),
        "started": p.get("started"),
        "completed": p.get("completed"),
        "meso_theme": (defn or {}).get("theme"),
        "age_band": band,
        "resolved_start_meso": pos.resolve_start_meso(defs, start_date, override=override),
    }


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
                "start_meso": (r.customizations_json or {}).get("start_meso"),
                "customizations_json": r.customizations_json,
                "position": _instance_position_summary(cycle, r.start_date, r.customizations_json),
            }
        )
    return out


@router.get("/club/cycle-instances/preview")
def head_preview_cycle_instance(
    cycle_id: int = Query(...),
    start_date: str = Query(...),
    start_meso: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    """Жив преглед: към коя позиция (мезо/седмица) ще стартира програмата."""
    _ensure_head(user)
    cycle = db.query(MethodCycle).filter(
        MethodCycle.id == cycle_id, MethodCycle.status == "published"
    ).first()
    if not cycle:
        raise HTTPException(status_code=404, detail="Published cycle not found")
    custom = {"start_meso": int(start_meso)} if start_meso else {}
    return _instance_position_summary(cycle, start_date, custom) or {}


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


class CycleInstanceUpdateIn(BaseModel):
    start_date: Optional[str] = None
    status: Optional[str] = None
    start_meso: Optional[int] = None  # 0 → изчиства override-а


@router.patch("/club/cycle-instances/{instance_id}")
def head_update_cycle_instance(
    instance_id: int,
    payload: CycleInstanceUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(UserRole.club_head_coach)),
):
    """Редакция на инстанция: старт дата, статус (active/paused/completed), стартов мезо."""
    _ensure_head(user)
    row = (
        db.query(ClubCycleInstance)
        .filter(ClubCycleInstance.id == instance_id, ClubCycleInstance.club_id == user.club_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Instance not found")

    if payload.status is not None:
        if payload.status not in ("active", "paused", "completed"):
            raise HTTPException(status_code=422, detail="Invalid status")
        row.status = payload.status

    if payload.start_date is not None:
        from app.national_method import program_position as pos

        if pos.parse_iso_date(payload.start_date) is None:
            raise HTTPException(status_code=422, detail="Invalid start_date (YYYY-MM-DD)")
        row.start_date = payload.start_date

    if payload.start_meso is not None:
        custom = dict(row.customizations_json or {})
        if int(payload.start_meso) <= 0:
            custom.pop("start_meso", None)
        else:
            custom["start_meso"] = int(payload.start_meso)
        row.customizations_json = custom

    db.commit()
    db.refresh(row)
    cycle = db.query(MethodCycle).filter(MethodCycle.id == row.cycle_id).first()
    return {
        "id": row.id,
        "team_id": row.team_id,
        "status": row.status,
        "start_date": row.start_date,
        "start_meso": (row.customizations_json or {}).get("start_meso"),
        "position": _instance_position_summary(cycle, row.start_date, row.customizations_json),
    }


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
    cycle = db.query(MethodCycle).filter(MethodCycle.id == r.cycle_id).first() if r.cycle_id else None
    week_theme = None
    if cycle and r.week_ref and cycle.structure_json:
        for w in cycle.structure_json.get("weeks") or []:
            if int(w.get("week", 0)) == int(r.week_ref):
                week_theme = w.get("theme")
                break
    return {
        "id": r.id,
        "club_id": r.club_id,
        "assigned_to": r.assigned_to,
        "assignee_name": assignee.name if assignee else None,
        "cycle_id": r.cycle_id,
        "cycle_title": cycle.title_bg if cycle else None,
        "cycle_age_band": cycle.age_band if cycle else None,
        "week_theme": week_theme,
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
