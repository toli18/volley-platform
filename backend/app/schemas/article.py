from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.models import ArticleMediaType, ArticleStatus


class ArticleCreate(BaseModel):
    title: str
    excerpt: Optional[str] = None
    content: str


class ArticleUpdate(BaseModel):
    title: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None


class ArticleModerationAction(BaseModel):
    reason: Optional[str] = None
    comment: Optional[str] = None


class ArticleCommentCreate(BaseModel):
    content: str


class ArticleCommentUpdate(BaseModel):
    content: str


class ArticleCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    article_id: int
    author_id: int
    author_name: Optional[str] = None
    content: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ArticleMediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: ArticleMediaType
    url: str
    name: str
    mime_type: str
    size: int
    created_at: Optional[datetime] = None


class ArticleLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: Optional[str] = None
    url: HttpUrl


class ArticleListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    excerpt: Optional[str] = None
    status: ArticleStatus
    author_id: int
    author_name: Optional[str] = None
    author_club_name: Optional[str] = None
    author_coach_number: Optional[int] = None
    author_display: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ArticleResponse(ArticleListResponse):
    content: str
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    reject_reason: Optional[str] = None
    needs_edit_comment: Optional[str] = None
    media_items: list[ArticleMediaResponse] = Field(default_factory=list)
    links: list[ArticleLinkResponse] = Field(default_factory=list)


class ArticleLinkCreate(BaseModel):
    title: Optional[str] = None
    url: HttpUrl

