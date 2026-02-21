from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ForumPostCreate(BaseModel):
    title: str
    content: str
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)


class ForumPostUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[list[str]] = None


class ForumPostModerationUpdate(BaseModel):
    is_pinned: Optional[bool] = None
    is_locked: Optional[bool] = None


class ForumReplyCreate(BaseModel):
    content: str


class ForumReplyUpdate(BaseModel):
    content: str


class ForumReplyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    author_id: int
    author_name: Optional[str] = None
    content: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ForumPostMediaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    post_id: int
    url: str
    name: str
    mime_type: str
    size: int
    created_at: Optional[datetime] = None


class ForumPostListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    content: str
    author_id: int
    category: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    is_pinned: bool = False
    is_locked: bool = False
    media_count: int = 0
    author_name: Optional[str] = None
    replies_count: int = 0
    last_activity_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ForumPostResponse(ForumPostListResponse):
    media_items: list[ForumPostMediaResponse] = Field(default_factory=list)
    replies: list[ForumReplyResponse] = Field(default_factory=list)


class ForumPostPageResponse(BaseModel):
    items: list[ForumPostListResponse] = Field(default_factory=list)
    page: int
    page_size: int
    total: int
    total_pages: int

