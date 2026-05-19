from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


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
