from pathlib import Path
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.dependencies.roles import require_role
from app.models import ArticleMedia, ArticleMediaType, ArticleStatus, User, UserRole
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
    update_article_comment,
    needs_edit_article,
    reject_article,
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


def _sanitize_filename(name: str) -> str:
    return Path(name).name.replace(" ", "_")


def _detect_media_type(file_name: str, mime_type: str) -> ArticleMediaType:
    extension = Path(file_name).suffix.lower()
    if extension in ALLOWED_IMAGE_EXTENSIONS and mime_type in ALLOWED_IMAGE_MIME_TYPES:
        return ArticleMediaType.IMAGE
    if extension in ALLOWED_FILE_EXTENSIONS and mime_type in ALLOWED_FILE_MIME_TYPES:
        return ArticleMediaType.FILE
    raise HTTPException(status_code=400, detail="Unsupported file type")


def _save_upload(article_id: int, upload: UploadFile) -> tuple[str, str, str, int, ArticleMediaType]:
    safe_name = _sanitize_filename(upload.filename or "file")
    mime_type = upload.content_type or "application/octet-stream"
    media_type = _detect_media_type(safe_name, mime_type)

    content = upload.file.read()
    size = len(content)
    if size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    file_name = f"{uuid4().hex}_{safe_name}"
    storage_dir = Path(__file__).resolve().parents[1] / "static" / "uploads" / "articles" / str(article_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / file_name
    file_path.write_bytes(content)

    public_url = f"/static/uploads/articles/{article_id}/{file_name}"
    return public_url, safe_name, mime_type, size, media_type


@router.get("/articles", response_model=list[ArticleListResponse])
def list_articles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_articles(db, current_user, admin_view=False)


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


@router.post("/articles/{article_id}/media", response_model=ArticleMediaResponse, status_code=status.HTTP_201_CREATED)
def upload_article_media(
    article_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    url, name, mime_type, size_bytes, media_type = _save_upload(article_id, file)
    return add_article_media(
        db=db,
        article_id=article_id,
        user=current_user,
        media_type=media_type,
        url=url,
        name=name,
        mime_type=mime_type,
        size=size_bytes,
    )


@router.delete("/articles/{article_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_article_media(
    article_id: int,
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.coach)),
):
    media = db.query(ArticleMedia).filter(ArticleMedia.id == media_id, ArticleMedia.article_id == article_id).first()
    if media and media.url.startswith("/static/"):
        local_path = Path(__file__).resolve().parents[1] / media.url.lstrip("/")
        if local_path.exists():
            local_path.unlink()

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

