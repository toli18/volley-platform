from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.competition_kinds import CompetitionKind

CompetitionEventType = Literal["training", "competition"]


class CompetitionEventBase(BaseModel):
    team_id: int
    coach_id: int
    date: str  # YYYY-MM-DD
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    location: str
    competition_kind: CompetitionKind
    notes: Optional[str] = None


class CompetitionEventCreate(CompetitionEventBase):
    pass


class CompetitionEventUpdate(BaseModel):
    team_id: Optional[int] = None
    coach_id: Optional[int] = None
    date: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    competition_kind: Optional[CompetitionKind] = None
    notes: Optional[str] = None
    is_cancelled: Optional[bool] = None


class CompetitionEventRead(CompetitionEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    competition_kind_label: str = ""
    is_cancelled: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    team_name: Optional[str] = None
    coach_name: Optional[str] = None
