"""
Кои източници са допустими в националната библиотека (след почистване на EN/GTP/PDF/bundle).
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import ClubCycleInstance, Drill, MethodArticle, MethodCycle, MethodGuideline, MethodSource

ALLOWED_SOURCE_FILENAMES = frozenset(
    {
        "bvf-textbook-bg",
        "bvf-textbook-annual-program",
        "bvf-national-drills",
    }
)

LEGACY_CYCLE_SOURCE_FILENAMES = frozenset(
    {
        "Programmazione-Macrociclo-4-Settimane.xls",
        "bvf-content",
    }
)

BLOCKED_CONTENT_ORIGINS = frozenset({"volleycomment"})

BLOCKED_SOURCE_FILENAMES = frozenset(
    {
        "getthepancake-archive",
        "bvf-drills-bundle",
    }
)

IMPORT_MARKER = "BVF_LIBRARY_FULL_IMPORT_V2"


def _explicitly_allowed_source(source: MethodSource) -> bool:
    fn = (source.filename or "").strip()
    return fn in ALLOWED_SOURCE_FILENAMES


def is_annual_program_cycle(cycle: MethodCycle) -> bool:
    return bool((cycle.structure_json or {}).get("annual_program_key"))


def is_legacy_method_source(source: MethodSource | None) -> bool:
    if source is None:
        return False
    if _explicitly_allowed_source(source):
        return False
    fn = (source.filename or "").strip()
    fn_lower = fn.lower()
    if fn in BLOCKED_SOURCE_FILENAMES or fn_lower in BLOCKED_SOURCE_FILENAMES:
        return True
    if source.original_language in ("en", "unknown"):
        return True
    notes = source.admin_notes or ""
    if IMPORT_MARKER in notes:
        return True
    if fn_lower.endswith(".pdf") or fn_lower.endswith(".md"):
        return True
    if fn_lower.startswith("gtp:"):
        return True
    return False


def is_allowed_method_source(source: MethodSource | None) -> bool:
    if source is None:
        return False
    return _explicitly_allowed_source(source) and not is_legacy_method_source(source)


def is_allowed_federation_drill(drill: Drill, source: MethodSource | None = None) -> bool:
    if drill.scope != "federation":
        return False
    if source is None:
        return False
    return is_allowed_method_source(source)


def is_allowed_method_article(article: MethodArticle, source: MethodSource | None = None) -> bool:
    origin = (article.content_origin or "").strip().lower()
    if origin in BLOCKED_CONTENT_ORIGINS:
        return False
    if origin == "textbook":
        return True
    title = (article.title_bg or "").strip()
    if title.startswith("PDF:"):
        return False
    if source and is_allowed_method_source(source):
        return True
    return False


def drill_allowed_in_generator_with_source(drill: Drill, source: MethodSource | None) -> bool:
    if drill.status != "approved":
        return False
    if drill.scope != "federation":
        return True
    return is_allowed_federation_drill(drill, source)


def purge_volleycomment_content(db: Session, *, dry_run: bool = False) -> dict:
    """Премахва Volley Comment статии и източника от библиотеката."""
    stats = {"articles_deleted": 0, "sources_deleted": 0, "dry_run": dry_run}
    q = db.query(MethodArticle).filter(MethodArticle.content_origin == "volleycomment")
    stats["articles_deleted"] = q.count()
    if not dry_run:
        q.delete(synchronize_session=False)
        db.flush()
        src = db.query(MethodSource).filter(MethodSource.filename == "volleycomment.bg").first()
        if src:
            has_art = db.query(MethodArticle).filter(MethodArticle.source_id == src.id).first()
            if not has_art:
                db.delete(src)
                stats["sources_deleted"] = 1
    return stats


def _migrate_federation_drills_source(db: Session, *, dry_run: bool = False) -> int:
    """Премества нац. упражнения към bvf-national-drills източник."""
    from app.seed.seed_national_method import NATIONAL_DRILLS_SOURCE, _ensure_drills_source

    new_src = _ensure_drills_source(db)
    old_names = LEGACY_CYCLE_SOURCE_FILENAMES | {"Programmazione-Macrociclo-4-Settimane.xls"}
    n = 0
    for fn in old_names:
        old = db.query(MethodSource).filter(MethodSource.filename == fn).first()
        if not old or old.id == new_src.id:
            continue
        q = db.query(Drill).filter(Drill.scope == "federation", Drill.method_source_id == old.id)
        count = q.count()
        n += count
        if not dry_run and count:
            q.update({Drill.method_source_id: new_src.id}, synchronize_session=False)
    if not dry_run:
        db.flush()
    return n


def purge_pre_textbook_method(db: Session, *, dry_run: bool = False) -> dict:
    """Премахва legacy цикли (без годишна програма), VC насоки и стари източници."""
    stats = {
        "legacy_cycles_deleted": 0,
        "cycle_instances_deleted": 0,
        "guidelines_deleted": 0,
        "legacy_sources_deleted": 0,
        "drills_migrated": 0,
        "dry_run": dry_run,
    }

    stats["drills_migrated"] = _migrate_federation_drills_source(db, dry_run=dry_run)

    for cycle in db.query(MethodCycle).all():
        if is_annual_program_cycle(cycle):
            continue
        stats["legacy_cycles_deleted"] += 1
        if not dry_run:
            n = (
                db.query(ClubCycleInstance)
                .filter(ClubCycleInstance.cycle_id == cycle.id)
                .delete(synchronize_session=False)
            )
            stats["cycle_instances_deleted"] += n
            db.delete(cycle)

    stats["guidelines_deleted"] = db.query(MethodGuideline).count()
    if not dry_run and stats["guidelines_deleted"]:
        db.query(MethodGuideline).delete(synchronize_session=False)

    if not dry_run:
        db.flush()

    for src in db.query(MethodSource).all():
        fn = (src.filename or "").strip()
        if fn in ALLOWED_SOURCE_FILENAMES:
            continue
        if fn in LEGACY_CYCLE_SOURCE_FILENAMES or is_legacy_method_source(src):
            has_art = db.query(MethodArticle).filter(MethodArticle.source_id == src.id).first()
            has_drill = db.query(Drill).filter(Drill.method_source_id == src.id).first()
            has_cycle = db.query(MethodCycle).filter(MethodCycle.source_id == src.id).first()
            if has_art or has_drill or has_cycle:
                continue
            stats["legacy_sources_deleted"] += 1
            if not dry_run:
                db.delete(src)

    if not dry_run:
        db.flush()
    return stats


def purge_legacy_library(db: Session, *, dry_run: bool = False) -> dict:
    """Изтрива legacy съдържание; запазва учебник, годишна програма и нац. упражнения."""
    stats = {
        "articles_deleted": 0,
        "drills_deleted": 0,
        "sources_deleted": 0,
        "dry_run": dry_run,
    }

    pre = purge_pre_textbook_method(db, dry_run=dry_run)
    stats.update(pre)

    vc_stats = purge_volleycomment_content(db, dry_run=dry_run)
    stats["volleycomment_articles_deleted"] = vc_stats.get("articles_deleted", 0)

    articles = db.query(MethodArticle).all()
    for art in articles:
        src = db.query(MethodSource).filter(MethodSource.id == art.source_id).first() if art.source_id else None
        if is_allowed_method_article(art, src):
            continue
        stats["articles_deleted"] += 1
        if not dry_run:
            db.delete(art)

    drills = db.query(Drill).filter(Drill.scope == "federation").all()
    for d in drills:
        src = (
            db.query(MethodSource).filter(MethodSource.id == d.method_source_id).first()
            if d.method_source_id
            else None
        )
        if is_allowed_federation_drill(d, src):
            continue
        stats["drills_deleted"] += 1
        if not dry_run:
            db.delete(d)

    if not dry_run:
        db.flush()

    sources = db.query(MethodSource).all()
    for src in sources:
        if is_legacy_method_source(src) or _explicitly_allowed_source(src):
            continue
        has_art = db.query(MethodArticle).filter(MethodArticle.source_id == src.id).first()
        has_drill = db.query(Drill).filter(Drill.method_source_id == src.id).first()
        if has_art or has_drill:
            continue
        stats["sources_deleted"] += 1
        if not dry_run:
            db.delete(src)

    if not dry_run:
        db.commit()
        try:
            from app.seed.seed_national_method import ensure_national_drills

            stats["national_drills_restored"] = ensure_national_drills(db)
            db.commit()
        except Exception as exc:
            stats["national_drills_restore_error"] = str(exc)
    return stats


def query_drills_for_ai(db: Session) -> list[Drill]:
    rows = db.query(Drill).filter(Drill.status == "approved").all()
    out: list[Drill] = []
    for d in rows:
        if d.scope != "federation":
            out.append(d)
            continue
        src = None
        if d.method_source_id:
            src = db.query(MethodSource).filter(MethodSource.id == d.method_source_id).first()
        if drill_allowed_in_generator_with_source(d, src):
            out.append(d)
    return out
