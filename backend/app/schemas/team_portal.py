from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.parent_portal import ParentScheduleItem


class TeamAccessStatusResponse(BaseModel):
    has_active_token: bool = False
    token_preview: Optional[str] = None
    team_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None


class TeamAccessCreateResponse(BaseModel):
    team_url: str
    token_preview: str
    expires_at: Optional[datetime] = None


class TeamPortalTextCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)


class TeamPortalItemResponse(BaseModel):
    id: int
    kind: str
    body: Optional[str] = None
    url: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TeamPortalPublicResponse(BaseModel):
    team_name: str
    club_name: Optional[str] = None
    schedule_month_key: str
    monthly_schedule: list[ParentScheduleItem] = Field(default_factory=list)
    items: list[TeamPortalItemResponse] = Field(default_factory=list)
