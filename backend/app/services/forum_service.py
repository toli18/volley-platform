from datetime import datetime
import math
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session, selectinload

from app.models import ForumPost, ForumPostMedia, ForumReply, User, UserRole
from app.schemas.forum import (
    ForumPostCreate,
    ForumPostModerationUpdate,
    ForumPostUpdate,
    ForumReplyCreate,
    ForumReplyUpdate,
)


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _can_participate(user: User) -> bool:
    return _role_value(user) in {
        UserRole.coach.value,
        UserRole.platform_admin.value,
        UserRole.federation_admin.value,
    }


def _is_admin(user: User) -> bool:
    return _role_value(user) in {UserRole.platform_admin.value, UserRole.federation_admin.value}


def _query_posts(db: Session):
    return db.query(ForumPost).options(
        selectinload(ForumPost.author),
        selectinload(ForumPost.media_items),
        selectinload(ForumPost.replies).selectinload(ForumReply.author),
    )


def _normalize_tags(tags: list[str] | None) -> list[str]:
    if not tags:
        return []
    cleaned: list[str] = []
    for tag in tags:
        t = str(tag or "").strip().lower()
        if not t:
            continue
        if t not in cleaned:
            cleaned.append(t)
    return cleaned[:12]


def _decorate_post(post: ForumPost) -> None:
    post.author_name = post.author.name if getattr(post, "author", None) else None
    post.tags = _normalize_tags(getattr(post, "tags", []))
    post.media_count = len(getattr(post, "media_items", []) or [])
    replies = list(getattr(post, "replies", []) or [])
    post.replies_count = len(replies)

    last_reply_at = None
    for reply in replies:
        if getattr(reply, "author", None) is not None:
            reply.author_name = reply.author.name
        else:
            reply.author_name = None
        if reply.created_at and (last_reply_at is None or reply.created_at > last_reply_at):
            last_reply_at = reply.created_at

    post.last_activity_at = last_reply_at or post.updated_at or post.created_at


def list_posts(
    db: Session,
    user: User,
    page: int = 1,
    page_size: int = 20,
    category: str | None = None,
    tag: str | None = None,
    query: str | None = None,
) -> tuple[list[ForumPost], int]:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")

    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 50))

    q = _query_posts(db)
    if category:
        q = q.filter(ForumPost.category == category.strip())
    if query:
        search = f"%{query.strip()}%"
        q = q.filter((ForumPost.title.ilike(search)) | (ForumPost.content.ilike(search)))

    posts = q.order_by(ForumPost.is_pinned.desc(), ForumPost.updated_at.desc(), ForumPost.created_at.desc()).all()
    if tag:
        tag_value = tag.strip().lower()
        posts = [p for p in posts if tag_value in _normalize_tags(getattr(p, "tags", []))]

    total = len(posts)
    start = (safe_page - 1) * safe_page_size
    end = start + safe_page_size
    paged_items = posts[start:end]

    for post in paged_items:
        _decorate_post(post)

    return paged_items, total


def paginate_meta(page: int, page_size: int, total: int) -> dict:
    safe_page = max(1, int(page))
    safe_page_size = max(1, min(int(page_size), 50))
    total_pages = max(1, math.ceil(total / safe_page_size)) if total else 1
    if safe_page > total_pages:
        safe_page = total_pages
    return {
        "page": safe_page,
        "page_size": safe_page_size,
        "total": total,
        "total_pages": total_pages,
    }


def get_available_categories(db: Session, user: User) -> list[str]:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")
    rows = db.query(ForumPost.category).filter(ForumPost.category.isnot(None)).distinct().all()
    return sorted({str(r[0]).strip() for r in rows if r and r[0]})


def get_available_tags(db: Session, user: User) -> list[str]:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")
    posts = db.query(ForumPost.tags).all()
    tags: set[str] = set()
    for post in posts:
        raw_tags = post[0] if isinstance(post, tuple) else getattr(post, "tags", None)
        for t in _normalize_tags(raw_tags):
            tags.add(t)
    return sorted(tags)


def get_post(db: Session, post_id: int, user: User) -> ForumPost:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")

    post = _query_posts(db).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")

    _decorate_post(post)
    return post


def create_post(db: Session, user: User, payload: ForumPostCreate) -> ForumPost:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")

    title = payload.title.strip()
    content = payload.content.strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    category = (payload.category or "").strip() or None
    tags = _normalize_tags(payload.tags)
    post = ForumPost(title=title, content=content, category=category, tags=tags, author_id=user.id)
    db.add(post)
    db.commit()
    return get_post(db, post.id, user)


def add_post_media(
    db: Session,
    post_id: int,
    user: User,
    file_name: str,
    mime_type: str,
    size_bytes: int,
    content: bytes,
) -> ForumPostMedia:
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")
    if post.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can upload files")

    safe_name = Path(file_name or "file").name.replace(" ", "_")
    if size_bytes <= 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if size_bytes > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    ext = Path(safe_name).suffix.lower()
    allowed_ext = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".gif",
        ".mp4",
        ".webm",
        ".mov",
        ".avi",
        ".pdf",
        ".docx",
        ".pptx",
        ".xlsx",
        ".zip",
    }
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail="Unsupported file type")

    final_name = f"{uuid4().hex}_{safe_name}"
    storage_dir = Path(__file__).resolve().parents[1] / "static" / "uploads" / "forum" / str(post_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / final_name
    file_path.write_bytes(content)

    public_url = f"/static/uploads/forum/{post_id}/{final_name}"
    media = ForumPostMedia(
        post_id=post_id,
        url=public_url,
        name=safe_name,
        mime_type=mime_type or "application/octet-stream",
        size=size_bytes,
    )
    db.add(media)
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(media)
    return media


def delete_post_media(db: Session, post_id: int, media_id: int, user: User) -> None:
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")
    if post.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can delete files")

    media = db.query(ForumPostMedia).filter(ForumPostMedia.id == media_id, ForumPostMedia.post_id == post_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Forum media not found")

    if media.url.startswith("/static/"):
        local_path = Path(__file__).resolve().parents[1] / media.url.lstrip("/")
        if local_path.exists():
            local_path.unlink()

    db.delete(media)
    post.updated_at = datetime.utcnow()
    db.commit()


def update_post(db: Session, post_id: int, user: User, payload: ForumPostUpdate) -> ForumPost:
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")

    if post.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can edit this topic")

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        post.title = title
    if "content" in data:
        content = (data.get("content") or "").strip()
        if not content:
            raise HTTPException(status_code=400, detail="Content cannot be empty")
        post.content = content
    if "category" in data:
        category = (data.get("category") or "").strip()
        post.category = category or None
    if "tags" in data:
        post.tags = _normalize_tags(data.get("tags"))

    post.updated_at = datetime.utcnow()
    db.commit()
    return get_post(db, post_id, user)


def delete_post(db: Session, post_id: int, user: User) -> None:
    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")

    if post.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can delete this topic")

    db.delete(post)
    db.commit()


def create_reply(db: Session, post_id: int, user: User, payload: ForumReplyCreate) -> ForumReply:
    if not _can_participate(user):
        raise HTTPException(status_code=403, detail="Forum access is allowed only for coaches and admins")

    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")
    if bool(getattr(post, "is_locked", False)):
        raise HTTPException(status_code=400, detail="Topic is locked and does not accept new replies")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Reply content is required")

    reply = ForumReply(post_id=post_id, content=content, author_id=user.id)
    db.add(reply)
    post.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(reply)
    reply.author_name = user.name
    return reply


def update_reply(db: Session, post_id: int, reply_id: int, user: User, payload: ForumReplyUpdate) -> ForumReply:
    reply = db.query(ForumReply).filter(ForumReply.id == reply_id, ForumReply.post_id == post_id).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Forum reply not found")

    if reply.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can edit this reply")

    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if post and bool(getattr(post, "is_locked", False)) and not _is_admin(user):
        raise HTTPException(status_code=400, detail="Topic is locked")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Reply content is required")

    reply.content = content
    reply.updated_at = datetime.utcnow()

    if post:
        post.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(reply)
    reply.author_name = reply.author.name if getattr(reply, "author", None) else None
    return reply


def delete_reply(db: Session, post_id: int, reply_id: int, user: User) -> None:
    reply = db.query(ForumReply).filter(ForumReply.id == reply_id, ForumReply.post_id == post_id).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Forum reply not found")

    if reply.author_id != user.id and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only the author or admin can delete this reply")

    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if post and bool(getattr(post, "is_locked", False)) and not _is_admin(user):
        raise HTTPException(status_code=400, detail="Topic is locked")

    db.delete(reply)

    if post:
        post.updated_at = datetime.utcnow()

    db.commit()


def moderate_post(db: Session, post_id: int, user: User, payload: ForumPostModerationUpdate) -> ForumPost:
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admin can moderate forum topics")

    post = db.query(ForumPost).filter(ForumPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Forum topic not found")

    data = payload.model_dump(exclude_unset=True)
    if "is_pinned" in data:
        post.is_pinned = bool(data["is_pinned"])
    if "is_locked" in data:
        post.is_locked = bool(data["is_locked"])
    post.updated_at = datetime.utcnow()

    db.commit()
    return get_post(db, post_id, user)

