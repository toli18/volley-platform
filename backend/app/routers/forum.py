from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.auth import get_current_user
from app.models import User, UserRole
from app.dependencies.roles import require_role
from app.schemas.forum import (
    ForumPostCreate,
    ForumPostModerationUpdate,
    ForumPostMediaResponse,
    ForumPostPageResponse,
    ForumPostResponse,
    ForumPostUpdate,
    ForumReplyCreate,
    ForumReplyResponse,
    ForumReplyUpdate,
)
from app.services.forum_service import (
    get_available_categories,
    get_available_tags,
    paginate_meta,
    create_post,
    create_reply,
    add_post_media,
    delete_post,
    delete_post_media,
    delete_reply,
    get_post,
    list_posts,
    moderate_post,
    update_post,
    update_reply,
)

router = APIRouter()


@router.get("/forum/posts", response_model=ForumPostPageResponse)
def list_forum_posts(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=50),
    category: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    query: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    items, total = list_posts(
        db=db,
        user=current_user,
        page=page,
        page_size=page_size,
        category=category,
        tag=tag,
        query=query,
    )
    meta = paginate_meta(page=page, page_size=page_size, total=total)
    return {"items": items, **meta}


@router.get("/forum/categories", response_model=list[str])
def list_forum_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return get_available_categories(db, current_user)


@router.get("/forum/tags", response_model=list[str])
def list_forum_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return get_available_tags(db, current_user)


@router.post("/forum/posts", response_model=ForumPostResponse, status_code=status.HTTP_201_CREATED)
def create_forum_post(
    payload: ForumPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return create_post(db, current_user, payload)


@router.get("/forum/posts/{post_id}", response_model=ForumPostResponse)
def get_forum_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return get_post(db, post_id, current_user)


@router.put("/forum/posts/{post_id}", response_model=ForumPostResponse)
def update_forum_post(
    post_id: int,
    payload: ForumPostUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return update_post(db, post_id, current_user, payload)


@router.patch("/forum/posts/{post_id}/moderation", response_model=ForumPostResponse)
def moderate_forum_post(
    post_id: int,
    payload: ForumPostModerationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    return moderate_post(db, post_id, current_user, payload)


@router.delete("/forum/posts/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_forum_post(
    post_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    delete_post(db, post_id, current_user)
    return None


@router.post("/forum/posts/{post_id}/media", response_model=ForumPostMediaResponse, status_code=status.HTTP_201_CREATED)
def upload_forum_post_media(
    post_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    content = file.file.read()
    return add_post_media(
        db=db,
        post_id=post_id,
        user=current_user,
        file_name=file.filename or "file",
        mime_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        content=content,
    )


@router.delete("/forum/posts/{post_id}/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_forum_post_media(
    post_id: int,
    media_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    delete_post_media(db, post_id, media_id, current_user)
    return None


@router.post("/forum/posts/{post_id}/replies", response_model=ForumReplyResponse, status_code=status.HTTP_201_CREATED)
def create_forum_reply(
    post_id: int,
    payload: ForumReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return create_reply(db, post_id, current_user, payload)


@router.put("/forum/posts/{post_id}/replies/{reply_id}", response_model=ForumReplyResponse)
def update_forum_reply(
    post_id: int,
    reply_id: int,
    payload: ForumReplyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return update_reply(db, post_id, reply_id, current_user, payload)


@router.delete("/forum/posts/{post_id}/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_forum_reply(
    post_id: int,
    reply_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    delete_reply(db, post_id, reply_id, current_user)
    return None

