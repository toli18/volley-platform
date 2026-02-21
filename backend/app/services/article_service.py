from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Article,
    ArticleComment,
    ArticleLink,
    ArticleMedia,
    ArticleMediaType,
    ArticleStatus,
    User,
    UserRole,
)
from app.schemas.article import (
    ArticleCommentCreate,
    ArticleCommentUpdate,
    ArticleCreate,
    ArticleLinkCreate,
    ArticleUpdate,
)


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


def _is_admin(user: User) -> bool:
    return _role_value(user) == UserRole.platform_admin.value


def _is_author(article: Article, user: User) -> bool:
    return article.author_id == user.id


def _query_with_relations(db: Session):
    return db.query(Article).options(
        selectinload(Article.media_items),
        selectinload(Article.links),
        selectinload(Article.author).selectinload(User.club),
    )


def _decorate_author_meta(articles: list[Article], db: Session) -> None:
    if not articles:
        return

    club_ids = {
        a.author.club_id
        for a in articles
        if getattr(a, "author", None) is not None and getattr(a.author, "club_id", None) is not None
    }

    coaches_by_club: dict[int, list[int]] = {}
    if club_ids:
        coaches = (
            db.query(User)
            .filter(User.role == UserRole.coach, User.club_id.in_(club_ids))
            .order_by(User.club_id.asc(), User.id.asc())
            .all()
        )
        for coach in coaches:
            if coach.club_id is None:
                continue
            coaches_by_club.setdefault(coach.club_id, []).append(coach.id)

    for article in articles:
        author = getattr(article, "author", None)
        if author is None:
            article.author_name = None
            article.author_club_name = None
            article.author_coach_number = None
            article.author_display = f"Автор #{article.author_id}"
            continue

        article.author_name = getattr(author, "name", None)
        club = getattr(author, "club", None)
        article.author_club_name = getattr(club, "name", None)

        coach_number = None
        club_id = getattr(author, "club_id", None)
        if club_id is not None:
            coach_ids = coaches_by_club.get(club_id, [])
            if author.id in coach_ids:
                coach_number = coach_ids.index(author.id) + 1
        article.author_coach_number = coach_number

        if article.author_club_name and coach_number:
            article.author_display = f"{article.author_club_name} — Треньор №{coach_number}"
        elif article.author_name:
            article.author_display = article.author_name
        else:
            article.author_display = f"Автор #{article.author_id}"


def _decorate_comments(comments: list[ArticleComment]) -> None:
    for comment in comments:
        author = getattr(comment, "author", None)
        comment.author_name = getattr(author, "name", None) if author is not None else None


def create_article(db: Session, author: User, payload: ArticleCreate) -> Article:
    article = Article(
        title=payload.title,
        excerpt=payload.excerpt,
        content=payload.content,
        status=ArticleStatus.PENDING,
        author_id=author.id,
    )
    db.add(article)
    db.commit()
    return get_article_by_id(db, article.id, author)


def update_article(db: Session, article_id: int, user: User, payload: ArticleUpdate) -> Article:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not _is_author(article, user):
        raise HTTPException(status_code=403, detail="Only the author can edit this article")

    if article.status == ArticleStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Approved articles cannot be edited")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(article, field, value)

    article.updated_at = datetime.utcnow()
    db.commit()
    return get_article_by_id(db, article_id, user)


def get_articles(
    db: Session,
    user: User,
    status_filter: Optional[ArticleStatus] = None,
    admin_view: bool = False,
) -> list[Article]:
    query = _query_with_relations(db)

    if admin_view:
        if not _is_admin(user):
            raise HTTPException(status_code=403, detail="Only platform admin can access this endpoint")
        if status_filter is not None:
            query = query.filter(Article.status == status_filter)
        results = query.order_by(Article.created_at.desc()).all()
        _decorate_author_meta(results, db)
        return results

    query = query.filter(Article.status == ArticleStatus.APPROVED)
    results = query.order_by(Article.created_at.desc()).all()
    _decorate_author_meta(results, db)
    return results


def get_article_by_id(db: Session, article_id: int, user: User) -> Article:
    article = _query_with_relations(db).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    can_view = (
        article.status == ArticleStatus.APPROVED
        or _is_author(article, user)
        or _is_admin(user)
    )
    if not can_view:
        raise HTTPException(status_code=403, detail="Article is not visible")

    _decorate_author_meta([article], db)
    return article


def approve_article(db: Session, article_id: int, admin: User) -> Article:
    if not _is_admin(admin):
        raise HTTPException(status_code=403, detail="Only platform admin can approve")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    article.status = ArticleStatus.APPROVED
    article.approved_by = admin.id
    article.approved_at = datetime.utcnow()
    article.reject_reason = None
    article.needs_edit_comment = None
    article.updated_at = datetime.utcnow()
    db.commit()
    return get_article_by_id(db, article_id, admin)


def reject_article(db: Session, article_id: int, admin: User, reason: Optional[str]) -> Article:
    if not _is_admin(admin):
        raise HTTPException(status_code=403, detail="Only platform admin can reject")
    if not reason:
        raise HTTPException(status_code=400, detail="Reject reason is required")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    article.status = ArticleStatus.REJECTED
    article.approved_by = admin.id
    article.approved_at = datetime.utcnow()
    article.reject_reason = reason
    article.needs_edit_comment = None
    article.updated_at = datetime.utcnow()
    db.commit()
    return get_article_by_id(db, article_id, admin)


def needs_edit_article(db: Session, article_id: int, admin: User, comment: Optional[str]) -> Article:
    if not _is_admin(admin):
        raise HTTPException(status_code=403, detail="Only platform admin can request edits")
    if not comment:
        raise HTTPException(status_code=400, detail="Needs-edit comment is required")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    article.status = ArticleStatus.NEEDS_EDIT
    article.approved_by = admin.id
    article.approved_at = datetime.utcnow()
    article.needs_edit_comment = comment
    article.updated_at = datetime.utcnow()
    db.commit()
    return get_article_by_id(db, article_id, admin)


def add_article_media(
    db: Session,
    article_id: int,
    user: User,
    media_type: ArticleMediaType,
    url: str,
    name: str,
    mime_type: str,
    size: int,
) -> ArticleMedia:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if not _is_author(article, user):
        raise HTTPException(status_code=403, detail="Only the author can manage article media")
    if article.status == ArticleStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Approved articles cannot be edited")

    media = ArticleMedia(
        article_id=article_id,
        type=media_type,
        url=url,
        name=name,
        mime_type=mime_type,
        size=size,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


def delete_article_media(db: Session, article_id: int, media_id: int, user: User) -> None:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if not _is_author(article, user):
        raise HTTPException(status_code=403, detail="Only the author can manage article media")
    if article.status == ArticleStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Approved articles cannot be edited")

    media = db.query(ArticleMedia).filter(ArticleMedia.id == media_id, ArticleMedia.article_id == article_id).first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    db.delete(media)
    db.commit()


def add_article_link(db: Session, article_id: int, user: User, payload: ArticleLinkCreate) -> ArticleLink:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if not _is_author(article, user):
        raise HTTPException(status_code=403, detail="Only the author can manage article links")
    if article.status == ArticleStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Approved articles cannot be edited")

    link = ArticleLink(
        article_id=article_id,
        title=payload.title,
        url=str(payload.url),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def delete_article_link(db: Session, article_id: int, link_id: int, user: User) -> None:
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    if not _is_author(article, user):
        raise HTTPException(status_code=403, detail="Only the author can manage article links")
    if article.status == ArticleStatus.APPROVED:
        raise HTTPException(status_code=400, detail="Approved articles cannot be edited")

    link = db.query(ArticleLink).filter(ArticleLink.id == link_id, ArticleLink.article_id == article_id).first()
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()


def admin_update_article(db: Session, article_id: int, admin: User, payload: ArticleUpdate) -> Article:
    if not _is_admin(admin):
        raise HTTPException(status_code=403, detail="Only platform admin can edit articles")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(article, field, value)

    article.updated_at = datetime.utcnow()
    db.commit()
    return get_article_by_id(db, article_id, admin)


def admin_delete_article(db: Session, article_id: int, admin: User) -> None:
    if not _is_admin(admin):
        raise HTTPException(status_code=403, detail="Only platform admin can delete articles")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    db.delete(article)
    db.commit()


def _can_manage_comment(comment: ArticleComment, user: User) -> bool:
    role_value = _role_value(user)
    return (
        comment.author_id == user.id
        or role_value == UserRole.platform_admin.value
        or role_value == UserRole.federation_admin.value
    )


def get_article_comments(db: Session, article_id: int, user: User) -> list[ArticleComment]:
    # Reuse visibility rules from article details.
    get_article_by_id(db, article_id, user)
    comments = (
        db.query(ArticleComment)
        .options(selectinload(ArticleComment.author))
        .filter(ArticleComment.article_id == article_id)
        .order_by(ArticleComment.created_at.asc())
        .all()
    )
    _decorate_comments(comments)
    return comments


def create_article_comment(
    db: Session,
    article_id: int,
    user: User,
    payload: ArticleCommentCreate,
) -> ArticleComment:
    get_article_by_id(db, article_id, user)
    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    comment = ArticleComment(
        article_id=article_id,
        author_id=user.id,
        content=content,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    comment = (
        db.query(ArticleComment)
        .options(selectinload(ArticleComment.author))
        .filter(ArticleComment.id == comment.id)
        .first()
    )
    _decorate_comments([comment])
    return comment


def update_article_comment(
    db: Session,
    article_id: int,
    comment_id: int,
    user: User,
    payload: ArticleCommentUpdate,
) -> ArticleComment:
    get_article_by_id(db, article_id, user)
    comment = (
        db.query(ArticleComment)
        .options(selectinload(ArticleComment.author))
        .filter(ArticleComment.id == comment_id, ArticleComment.article_id == article_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _can_manage_comment(comment, user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Comment content is required")

    comment.content = content
    comment.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(comment)
    _decorate_comments([comment])
    return comment


def delete_article_comment(db: Session, article_id: int, comment_id: int, user: User) -> None:
    get_article_by_id(db, article_id, user)
    comment = (
        db.query(ArticleComment)
        .filter(ArticleComment.id == comment_id, ArticleComment.article_id == article_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if not _can_manage_comment(comment, user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db.delete(comment)
    db.commit()

