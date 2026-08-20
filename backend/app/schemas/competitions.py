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
    opponent_name: Optional[str] = None
    notes: Optional[str] = None
    card_index_id: Optional[int] = None


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
    opponent_name: Optional[str] = None
    notes: Optional[str] = None
    is_cancelled: Optional[bool] = None
    card_index_id: Optional[int] = None


class CompetitionEventRead(CompetitionEventBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    club_id: int
    competition_kind_label: str = ""
    is_cancelled: bool = False
    roster_status: str = "pending"
    roster_edit_count: int = 0
    roster_locked: bool = False
    roster_selected_count: int = 0
    roster_candidate_count: int = 0
    needs_roster: bool = False
    roster_action: Optional[str] = None  # generate | review
    days_until: Optional[int] = None
    can_edit_event: bool = False
    can_edit_roster: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    team_name: Optional[str] = None
    coach_name: Optional[str] = None
    carded_team_label: Optional[str] = None


class CompetitionRosterSaveIn(BaseModel):
    athlete_ids: list[int] = Field(default_factory=list)


class CompetitionRosterRead(BaseModel):
    competition_id: int
    status: str
    locked: bool
    edit_count: int
    edits_remaining: int
    max_athletes: int
    candidate_count: int
    selected_count: int
    needs_roster: bool
    auto_eligible: bool
    days_until: Optional[int] = None
    roster_action: Optional[str] = None
    athlete_ids: list[int] = Field(default_factory=list)
    candidates: list[dict] = Field(default_factory=list)
