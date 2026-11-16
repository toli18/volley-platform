"""Създава 3 закачени теми във форума (БФВолейбол / админ) с PDF и документи за сваляне.

Копира файлове от Desktop (или зададена папка) в static/forum-materials/ и създава темите,
ако още не съществуват (таг bfv-forum-seed-italy-2026).

Usage (от backend/):
  python -m app.scripts.seed_forum_federation_materials
  python -m app.scripts.seed_forum_federation_materials --dry-run
  python -m app.scripts.seed_forum_federation_materials --sources "C:/path/to/folder"
"""
from __future__ import annotations

import argparse
import mimetypes
import shutil
from pathlib import Path

from types import SimpleNamespace

from sqlalchemy import select, text

from app.database import SessionLocal
from app.models import ForumPost, ForumPostMedia, ForumPostSubscription, UserRole
from app.services.forum_service import _normalize_tags, add_post_media

SEED_TAG = "bfv-forum-seed-italy-2026"

STATIC_REL = Path("forum-materials")

# (dest_filename, default_desktop_basename)
FILE_SPECS: list[tuple[str, str]] = [
    ("abbonanza-blok-2026.pdf", "Абонданца блок.pdf"),
    ("lekciya-blok-razvitie-igracha.rtf", "Лекция Техника на блока в развитието на играча.rtf"),
    ("abbonanza-zashtita-2026.pdf", "Абонданца защита.pdf"),
    ("posreshtane-turino-2026.docx", "ПРЕВОД_ЛЕКЦИЯ_27.10.2026_Посрещане_Турино_Абонданца_BG.docx"),
    ("prestoy-italia-2026-izvodi.pdf", "обратна връзка Анатоли Пенев.pdf"),
    ("fenerbahce-playbook-2025-26.pdf", "FENERBAHCE 2025-26_playbook.pdf"),
    (
        "prandi-coaches-seminar-2020.pdf",
        "Coaches Seminar - Silvano Prandi 01.08.2020 v3 - no videos.pdf",
    ),
]

PRANDI_SUBFOLDER = ("биофит", "Coaches Seminar - Silvano Prandi 01.08.2020 v3 - no videos.pdf")

TOPICS: list[dict] = [
    {
        "title": "Техника на блока в развитието на играча · лекция (21.10.2026)",
        "category": "Техника",
        "tags": ["блок", "методика", "абонданца", "федерация", SEED_TAG],
        "is_pinned": True,
        "content": """\
<p>Публикувани материали от <strong>учебно-методическия престой · Италия, октомври 2026</strong>, от името на администрацията на БФВолейбол.</p>
<p><strong>Фокус:</strong> блокът като тактическо приспособяване, не само „правилна техника“; ролята на характеристиките на играча; връзка с видео анализ и практика в зала.</p>
<h3>Материали за изтегляне</h3>
<ul>
  <li><a href="/static/forum-materials/abbonanza-blok-2026.pdf" target="_blank" rel="noreferrer">Презентация · блок (PDF)</a></li>
  <li><a href="/static/forum-materials/lekciya-blok-razvitie-igracha.rtf" target="_blank" rel="noreferrer">Текст на лекцията · структуриран препис (RTF)</a></li>
</ul>
<p>Споделете в отговорите: как адаптирате идеите за вашия възрастов градус и състав.</p>
""",
        "attachments": [
            "abbonanza-blok-2026.pdf",
            "lekciya-blok-razvitie-igracha.rtf",
        ],
    },
    {
        "title": "Защита и организация · презентация Абонданца",
        "category": "Тактика",
        "tags": ["защита", "блок", "методика", "абонданца", SEED_TAG],
        "is_pinned": True,
        "content": """\
<p>Материал от същия цикъл на престоя: <strong>организация на защитата</strong>, позиции, четения на блок и първи стъпки след блока.</p>
<h3>Материал за изтегляне</h3>
<ul>
  <li><a href="/static/forum-materials/abbonanza-zashtita-2026.pdf" target="_blank" rel="noreferrer">Презентация · защита (PDF)</a></li>
</ul>
<p>Препоръка: комбинирайте с клиповете за блок и защита в електронния учебник, ако тренирате с млади състави.</p>
""",
        "attachments": ["abbonanza-zashtita-2026.pdf"],
    },
    {
        "title": "Престой Италия 2026 · посрещане, изводи и международни playbook-и",
        "category": "Мачова подготовка",
        "tags": ["посрещане", "playbook", "семинар", "федерация", "методика", SEED_TAG],
        "is_pinned": True,
        "content": """\
<p>Обединен пакет за треньори: <strong>практика по посрещане</strong> (Турино / Абонданца), <strong>официален доклад с изводи</strong> от престоя, плюс две международни методически справки за самостоятелна работа.</p>
<h3>Материали за изтегляне</h3>
<ul>
  <li><a href="/static/forum-materials/posreshtane-turino-2026.docx" target="_blank" rel="noreferrer">Практическа лекция · посрещане (DOCX, BG)</a></li>
  <li><a href="/static/forum-materials/prestoy-italia-2026-izvodi.pdf" target="_blank" rel="noreferrer">Обратна връзка от учебно-методическия престой · Италия 2026 (PDF)</a></li>
  <li><a href="/static/forum-materials/fenerbahce-playbook-2025-26.pdf" target="_blank" rel="noreferrer">Fenerbahçe 2025–26 · playbook (PDF)</a></li>
  <li><a href="/static/forum-materials/prandi-coaches-seminar-2020.pdf" target="_blank" rel="noreferrer">Семинар за треньори · Silvano Prandi (PDF)</a></li>
</ul>
<p><em>Докладът по престоя е методически и организационен; авторските права върху чуждите playbook-и остават при издателите.</em></p>
""",
        "attachments": [
            "posreshtane-turino-2026.docx",
            "prestoy-italia-2026-izvodi.pdf",
            "fenerbahce-playbook-2025-26.pdf",
            "prandi-coaches-seminar-2020.pdf",
        ],
    },
]


def _static_dir() -> Path:
    return Path(__file__).resolve().parents[1] / "static" / STATIC_REL


def _resolve_desktop_sources(sources_root: Path | None) -> dict[str, Path]:
    desktop = Path.home() / "Desktop"
    root = sources_root or desktop
    out: dict[str, Path] = {}
    for dest, basename in FILE_SPECS:
        if dest == "prandi-coaches-seminar-2020.pdf":
            candidate = root / PRANDI_SUBFOLDER[0] / PRANDI_SUBFOLDER[1]
            if not candidate.is_file() and sources_root is None:
                candidate = desktop / PRANDI_SUBFOLDER[0] / PRANDI_SUBFOLDER[1]
        else:
            candidate = root / basename
            if not candidate.is_file() and sources_root is None:
                candidate = desktop / basename
        out[dest] = candidate
    return out


def copy_materials(sources_root: Path | None, dry_run: bool) -> tuple[list[str], list[str]]:
    dest_dir = _static_dir()
    missing: list[str] = []
    copied: list[str] = []
    if not dry_run:
        dest_dir.mkdir(parents=True, exist_ok=True)
    for dest, src in _resolve_desktop_sources(sources_root).items():
        if not src.is_file():
            missing.append(f"{dest} <= {src}")
            continue
        target = dest_dir / dest
        if dry_run:
            copied.append(f"(dry-run) {src} -> {target}")
            continue
        shutil.copy2(src, target)
        copied.append(str(target))
    return missing, copied


def _find_admin(db) -> SimpleNamespace | None:
    """Avoid loading full User ORM row (works even if local SQLite lags migrations)."""
    row = db.execute(
        text(
            """
            SELECT id, email, name, role FROM users
            WHERE role IN ('federation_admin', 'platform_admin')
            ORDER BY CASE role WHEN 'federation_admin' THEN 0 ELSE 1 END
            LIMIT 1
            """
        )
    ).first()
    if not row:
        return None
    role = UserRole.federation_admin if row.role == "federation_admin" else UserRole.platform_admin
    return SimpleNamespace(id=row.id, email=row.email, name=row.name, role=role)


def _post_exists(db, title: str) -> ForumPost | None:
    row = db.query(ForumPost).filter(ForumPost.title == title).first()
    if row:
        return row
    return (
        db.query(ForumPost)
        .filter(ForumPost.tags.isnot(None))
        .filter(ForumPost.tags.contains([SEED_TAG]))
        .filter(ForumPost.title == title)
        .first()
    )


def _attach_static_files(db, post: ForumPost, user: User, filenames: list[str]) -> None:
    static_base = _static_dir()
    for name in filenames:
        path = static_base / name
        if not path.is_file():
            print(f"  skip attachment (missing): {path}")
            continue
        already = (
            db.query(ForumPostMedia)
            .filter(ForumPostMedia.post_id == post.id, ForumPostMedia.name == name)
            .first()
        )
        if already:
            continue
        data = path.read_bytes()
        mime, _ = mimetypes.guess_type(name)
        add_post_media(
            db=db,
            post_id=post.id,
            user=user,
            file_name=name,
            mime_type=mime or "application/octet-stream",
            size_bytes=len(data),
            content=data,
        )


def seed_topics(dry_run: bool) -> int:
    db = SessionLocal()
    try:
        admin = _find_admin(db)
        if not admin:
            print("ERROR: no federation_admin or platform_admin user in database")
            return 1

        created = 0
        for spec in TOPICS:
            title = spec["title"]
            existing = _post_exists(db, title)
            if existing:
                print(f"exists: [{existing.id}] {title}")
                if not dry_run:
                    _attach_static_files(db, existing, admin, spec.get("attachments") or [])
                continue
            if dry_run:
                print(f"would create: {title}")
                created += 1
                continue

            post = ForumPost(
                title=title,
                content=spec["content"].strip(),
                category=spec.get("category"),
                tags=_normalize_tags(spec.get("tags")),
                author_id=admin.id,
                is_pinned=bool(spec.get("is_pinned")),
                is_locked=False,
            )
            db.add(post)
            db.commit()
            db.refresh(post)
            db.add(ForumPostSubscription(post_id=post.id, user_id=admin.id))
            db.commit()
            _attach_static_files(db, post, admin, spec.get("attachments") or [])
            print(f"created: [{post.id}] {title}")
            created += 1

        print(f"done; new_topics={created}, author={admin.email} ({admin.name})")
        return 0
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--sources",
        type=str,
        default="",
        help="Root folder with source files (default: user Desktop)",
    )
    parser.add_argument("--skip-copy", action="store_true", help="Only create DB rows; files already in static/")
    args = parser.parse_args()

    sources = Path(args.sources).expanduser() if args.sources.strip() else None
    if not args.skip_copy:
        missing, copied = copy_materials(sources, args.dry_run)
        for line in copied:
            print(line)
        if missing:
            print("MISSING sources:")
            for m in missing:
                print(f"  {m}")
            if not args.dry_run:
                print("WARN: continuing; some downloads may be broken until files are copied")

    return seed_topics(args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())