from pathlib import Path
from typing import Optional
import re
from uuid import uuid4

try:
    import cloudinary
    import cloudinary.uploader
except ModuleNotFoundError:
    cloudinary = None
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.roles import require_role
from app.models import ArticleMedia, ArticleMediaBlob, ArticleMediaType, ArticleStatus, User, UserRole
from app.settings import settings
from app.schemas.article import (
    ArticleCommentCreate,
    ArticleCommentResponse,
    ArticleCommentUpdate,
    ArticleCreate,
    ArticleLinkCreate,
    ArticleLinkResponse,
    ArticleListResponse,
    ArticleMediaResponse,
    ArticleModerationAction,
    ArticleResponse,
    ArticleUpdate,
)
from app.services.article_service import (
    add_article_link,
    add_article_media,
    admin_delete_article,
    admin_update_article,
    create_article_comment,
    delete_article_comment,
    approve_article,
    create_article,
    delete_article_link,
    delete_article_media,
    get_article_by_id,
    get_article_comments,
    get_articles,
    get_my_articles,
    update_article_comment,
    needs_edit_article,
    reject_article,
    resubmit_article,
    update_article,
)

router = APIRouter()

MAX_FILE_SIZE = 50 * 1024 * 1024
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_FILE_EXTENSIONS = {".pdf", ".docx", ".pptx", ".xlsx", ".zip"}
ALLOWED_FILE_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
}

_CLOUDINARY_CONFIGURED = False


def _sanitize_filename(name: str) -> str:
    return Path(name).name.replace(" ", "_")


def _detect_media_type(file_name: str, mime_type: str) -> ArticleMediaType:
    extension = Path(file_name).suffix.lower()
    if extension in ALLOWED_IMAGE_EXTENSIONS and mime_type in ALLOWED_IMAGE_MIME_TYPES:
        return ArticleMediaType.IMAGE
    if extension in ALLOWED_FILE_EXTENSIONS and mime_type in ALLOWED_FILE_MIME_TYPES:
        return ArticleMediaType.FILE
    raise HTTPException(status_code=400, detail="Unsupported file type")


def _is_cloudinary_enabled() -> bool:
    return bool(
        cloudinary is not None
        and getattr(cloudinary, "uploader", None) is not None
        and settings.cloudinary_cloud_name
        and settings.cloudinary_api_key
        and settings.cloudinary_api_secret
    )


def _ensure_cloudinary_configured() -> None:
    global _CLOUDINARY_CONFIGURED
    if _CLOUDINARY_CONFIGURED:
        return
    if not _is_cloudinary_enabled():
        return
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    _CLOUDINARY_CONFIGURED = True


def _upload_to_cloudinary(article_id: int, safe_name: str, content: bytes, media_type: ArticleMediaType) -> Optional[str]:
    if not _is_cloudinary_enabled():
        return None
    _ensure_cloudinary_configured()
    resource_type = "image" if media_type == ArticleMediaType.IMAGE else "raw"
    base_name = Path(safe_name).stem
    public_id = f"{uuid4().hex}_{base_name}"
    result = cloudinary.uploader.upload(
        content,
        resource_type=resource_type,
        folder=f"volley-platform/articles/{article_id}",
        public_id=public_id,
        overwrite=False,
        unique_filename=False,
        use_filename=False,
    )
    return result.get("secure_url") or result.get("url")


def _cloudinary_public_id_from_url(url: str) -> Optional[str]:
    match = re.search(r"/(?:image|raw|video)/upload/(?:v\d+/)?(.+)$", url or "")
    if not match:
        return None
    tail = match.group(1)
    # Drop extension from URL path to recover public_id.
    return tail.rsplit(".", 1)[0]


def _save_upload(article_id: int, upload: UploadFile) -> tuple[str, str, str, int, ArticleMediaType]:
    safe_name = _sanitize_filename(upload.filename or "file")
    mime_type = upload.content_type or "application/octet-stream"
    media_type = _detect_media_type(safe_name, mime_type)

    content = upload.file.read()
    size = len(content)
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    cloudinary_url = _upload_to_cloudinary(article_id, safe_name, content, media_type)
    if cloudinary_url:
        return cloudinary_url, safe_name, mime_type, size, media_type

    file_name = f"{uuid4().hex}_{safe_name}"
    storage_dir = Path(__file__).resolve().parents[1] / "static" / "uploads" / "articles" / str(article_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / file_name
    file_path.write_bytes(content)

    public_url = f"/static/uploads/articles/{article_id}/{file_name}"
    return public_url, safe_name, mime_type, size, media_type


def _persist_local_image_blob(db: Session, media: ArticleMedia) -> None:
    if media.type != ArticleMediaType.IMAGE:
        return
    if not str(media.url or "").startswith("/static/uploads/articles/"):
        return

    local_path = Path(__file__).resolve().parents[1] / str(media.url).lstrip("/")
    if not local_path.exists():
        return

    content = local_path.read_bytes()
    blob = db.query(ArticleMediaBlob).filter(ArticleMediaBlob.media_id == media.id).first()
    if blob is None:
        blob = ArticleMediaBlob(media_id=media.id, content=content)
        db.add(blob)
    else:
        blob.content = content

    media.url = f"/api/articles/media/{media.id}/image"
    db.add(media)
    db.commit()
    db.refresh(media)

    try:
        local_path.unlink()
    except Exception:
        # Keep flow resilient even if local cleanup fails.
        pass


@router.get("/articles", response_model=list[ArticleListResponse])
def list_articles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_articles(db, current_user, admin_view=False)


@router.get("/articles/mine", response_model=list[ArticleListResponse])
def list_my_articles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.federation_admin, UserRole.platform_admin)),
):
    return get_my_articles(db, current_user)


@router.get("/articles/{article_id}", response_model=ArticleResponse)
def article_details(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_article_by_id(db, article_id, current_user)


@router.post("/articles", response_model=ArticleResponse, status_code=status.HTTP_201_CREATED)
def create_article_endpoint(
    payload: ArticleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    return create_article(db, current_user, payload)


@router.put("/articles/{article_id}", response_model=ArticleResponse)
def update_article_endpoint(
    article_id: int,
    payload: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    return update_article(db, article_id, current_user, payload)


@router.post("/articles/{article_id}/resubmit", response_model=ArticleResponse)
def resubmit_article_endpoint(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    return resubmit_article(db, article_id, current_user)


@router.post("/articles/{article_id}/media", response_model=ArticleMediaResponse, status_code=status.HTTP_201_CREATED)
def upload_article_media(
    article_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    url, name, mime_type, size_bytes, media_type = _save_upload(article_id, file)
    media = add_article_media(
        db=db,
        article_id=article_id,
        user=current_user,
        media_type=media_type,
        url=url,
        name=name,
        mime_type=mime_type,
        size=size_bytes,
    )
    _persist_local_image_blob(db, media)
    return media


@router.get("/articles/media/{media_id}/image")
def serve_article_media_image(
    media_id: int,
    db: Session = Depends(get_db),
):
    media = db.query(ArticleMedia).filter(ArticleMedia.id == media_id).first()
    if not media or media.type != ArticleMediaType.IMAGE:
        raise HTTPException(status_code=404, detail="Image media not found")

    blob = db.query(ArticleMediaBlob).filter(ArticleMediaBlob.media_id == media_id).first()
    if not blob:
        raise HTTPException(status_code=404, detail="Image binary not found")

    return Response(
        content=blob.content,
        media_type=media.mime_type or "image/jpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.delete("/articles/{article_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_article_media(
    article_id: int,
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    media = db.query(ArticleMedia).filter(ArticleMedia.id == media_id, ArticleMedia.article_id == article_id).first()
    if media:
        blob = db.query(ArticleMediaBlob).filter(ArticleMediaBlob.media_id == media.id).first()
        if blob is not None:
            db.delete(blob)
            db.commit()
        if media.url.startswith("/static/"):
            local_path = Path(__file__).resolve().parents[1] / media.url.lstrip("/")
            if local_path.exists():
                local_path.unlink()
        elif "res.cloudinary.com" in media.url and _is_cloudinary_enabled():
            _ensure_cloudinary_configured()
            public_id = _cloudinary_public_id_from_url(media.url)
            if public_id:
                resource_type = "image" if media.type == ArticleMediaType.IMAGE else "raw"
                try:
                    cloudinary.uploader.destroy(public_id, resource_type=resource_type, invalidate=True)
                except Exception:
                    # Keep delete flow resilient even if remote media cleanup fails.
                    pass

    delete_article_media(db, article_id, media_id, current_user)
    return None


@router.post("/articles/{article_id}/links", response_model=ArticleLinkResponse, status_code=status.HTTP_201_CREATED)
def create_article_link_endpoint(
    article_id: int,
    payload: ArticleLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    return add_article_link(db, article_id, current_user, payload)


@router.get("/articles/{article_id}/comments", response_model=list[ArticleCommentResponse])
def list_article_comments(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_article_comments(db, article_id, current_user)


@router.post("/articles/{article_id}/comments", response_model=ArticleCommentResponse, status_code=status.HTTP_201_CREATED)
def create_article_comment_endpoint(
    article_id: int,
    payload: ArticleCommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    return create_article_comment(db, article_id, current_user, payload)


@router.put("/articles/{article_id}/comments/{comment_id}", response_model=ArticleCommentResponse)
def update_article_comment_endpoint(
    article_id: int,
    comment_id: int,
    payload: ArticleCommentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    return update_article_comment(db, article_id, comment_id, current_user, payload)


@router.delete("/articles/{article_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_article_comment_endpoint(
    article_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)),
):
    delete_article_comment(db, article_id, comment_id, current_user)
    return None


@router.delete("/articles/{article_id}/links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_article_link(
    article_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    delete_article_link(db, article_id, link_id, current_user)
    return None


@router.get("/admin/articles", response_model=list[ArticleListResponse])
def admin_list_articles(
    status_filter: Optional[ArticleStatus] = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    return get_articles(db, current_user, status_filter=status_filter, admin_view=True)


@router.post("/admin/articles/{article_id}/approve", response_model=ArticleResponse)
def admin_approve_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    return approve_article(db, article_id, current_user)


@router.post("/admin/articles/{article_id}/reject", response_model=ArticleResponse)
def admin_reject_article(
    article_id: int,
    action: ArticleModerationAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    return reject_article(db, article_id, current_user, action.reason)


@router.post("/admin/articles/{article_id}/needs-edit", response_model=ArticleResponse)
def admin_needs_edit_article(
    article_id: int,
    action: ArticleModerationAction,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    return needs_edit_article(db, article_id, current_user, action.comment)


@router.put("/admin/articles/{article_id}", response_model=ArticleResponse)
def admin_update_article_endpoint(
    article_id: int,
    payload: ArticleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    return admin_update_article(db, article_id, current_user, payload)


@router.delete("/admin/articles/{article_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_article_endpoint(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin)),
):
    admin_delete_article(db, article_id, current_user)
    return None

