from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


ScheduleExceptionKind = Literal["cancelled", "override"]


class ScheduleRuleBase(BaseModel):
    team_id: int
    coach_id: int
    location: str
    weekday: int = Field(ge=0, le=6)
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    effective_from: str  # YYYY-MM-DD
    effective_to: Optional[str] = None  # YYYY-MM-DD
    is_active: bool = True


class ScheduleRuleCreate(ScheduleRuleBase):
    pass


class ScheduleRuleUpdate(BaseModel):
    team_id: Optional[int] = None
    coach_id: Optional[int] = None
    location: Optional[str] = None
    weekday: Optional[int] = Field(default=None, ge=0, le=6)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    is_active: Optional[bool] = None


class ScheduleRuleRead(ScheduleRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ScheduleExceptionCreate(BaseModel):
    date: str  # YYYY-MM-DD
    kind: ScheduleExceptionKind

    # Overrides (optional, used when kind=override)
    location: Optional[str] = None
    coach_id: Optional[int] = None
    team_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None


class ScheduleExceptionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    rule_id: int
    date: str
    kind: ScheduleExceptionKind
    location: Optional[str] = None
    coach_id: Optional[int] = None
    team_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ScheduleOccurrence(BaseModel):
    """Materialized calendar entry for a specific date (rule + exceptions applied)."""

    date: str  # YYYY-MM-DD
    weekday: int

    event_type: str = "training"  # training | competition
    rule_id: Optional[int] = None
    exception_id: Optional[int] = None
    competition_id: Optional[int] = None
    competition_kind: Optional[str] = None
    competition_kind_label: Optional[str] = None
    card_index_id: Optional[int] = None
    carded_team_label: Optional[str] = None
    is_cancelled: bool = False

    location: str
    start_time: str
    end_time: str

    coach_id: int
    coach_name: Optional[str] = None
    team_id: int
    team_name: Optional[str] = None

    # Тимов лист (само за competition)
    roster_status: Optional[str] = None
    needs_roster: bool = False
    roster_count: Optional[int] = None
    roster_action: Optional[str] = None  # generate | review
    days_until: Optional[int] = None


class ScheduleOccurrencesResponse(BaseModel):
    items: list[ScheduleOccurrence] = Field(default_factory=list)

