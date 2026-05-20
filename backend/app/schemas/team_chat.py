from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TeamChatMessageCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=2000)


class TeamChatMessagesReadPayload(BaseModel):
    message_ids: list[int] = Field(default_factory=list, max_length=300)


class TeamChatMessageReadAthlete(BaseModel):
    athlete_id: int
    athlete_name: str
    read_at: datetime


class TeamChatMessageResponse(BaseModel):
    id: int
    team_id: int
    sender_kind: str
    sender_label: str
    body: str
    created_at: datetime
    is_mine: bool = False
    read_count: int = 0
    roster_count: int = 0
    read_by: list[TeamChatMessageReadAthlete] = Field(default_factory=list)

    class Config:
        from_attributes = True


class TeamChatChannelResponse(BaseModel):
    team_id: int
    team_name: str
    last_message_preview: Optional[str] = None
    last_message_at: Optional[datetime] = None
    unread_count: int = 0


class TeamChatChannelsResponse(BaseModel):
    channels: list[TeamChatChannelResponse] = Field(default_factory=list)
    retention_days: int = 15
