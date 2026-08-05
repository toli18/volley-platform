# backend/app/schemas/matches.py
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

MatchSystemLiteral = Literal["5-1", "6-2", "4-2", "6-3"]
MatchFormatLiteral = Literal["bo3", "bo5"]
MatchStatusLiteral = Literal["draft", "ready", "live", "finished", "cancelled"]
MatchPositionLiteral = Literal["S", "OH", "MB", "OPP", "L"]

MAX_MATCH_ROSTER = 14


class MatchCreate(BaseModel):
    opponent_name: Optional[str] = None
    match_date: Optional[date] = None
    venue: Optional[str] = None
    system: MatchSystemLiteral = "5-1"
    format: MatchFormatLiteral = "bo5"
    notes: Optional[str] = None


class MatchUpdate(BaseModel):
    opponent_name: Optional[str] = None
    match_date: Optional[date] = None
    venue: Optional[str] = None
    system: Optional[MatchSystemLiteral] = None
    format: Optional[MatchFormatLiteral] = None
    notes: Optional[str] = None
    status: Optional[MatchStatusLiteral] = None


class MatchRosterPlayerIn(BaseModel):
    athlete_id: int
    jersey_number: int = Field(..., ge=0, le=99)
    position: MatchPositionLiteral
    sort_order: int = 0


class MatchRosterPut(BaseModel):
    players: list[MatchRosterPlayerIn] = Field(default_factory=list)

    @field_validator("players")
    @classmethod
    def validate_players(cls, value: list[MatchRosterPlayerIn]) -> list[MatchRosterPlayerIn]:
        if len(value) > MAX_MATCH_ROSTER:
            raise ValueError(f"Максимум {MAX_MATCH_ROSTER} състезатели")
        athlete_ids = [p.athlete_id for p in value]
        if len(set(athlete_ids)) != len(athlete_ids):
            raise ValueError("Дублиран състезател в състава")
        jerseys = [p.jersey_number for p in value]
        if len(set(jerseys)) != len(jerseys):
            raise ValueError("Дублиран номер на екип")
        return value


class MatchRosterPlayerRead(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    jersey_number: int
    position: MatchPositionLiteral
    sort_order: int


class MatchLineupSlotIn(BaseModel):
    zone: int = Field(..., ge=1, le=6)
    athlete_id: int


class MatchLineupPut(BaseModel):
    slots: list[MatchLineupSlotIn]
    libero_athlete_id: Optional[int] = None

    @field_validator("slots")
    @classmethod
    def validate_slots(cls, value: list[MatchLineupSlotIn]) -> list[MatchLineupSlotIn]:
        if len(value) != 6:
            raise ValueError("Нужни са точно 6 зони за стартовата шестица")
        zones = [s.zone for s in value]
        if sorted(zones) != [1, 2, 3, 4, 5, 6]:
            raise ValueError("Зоните трябва да са 1–6 без повторение")
        athlete_ids = [s.athlete_id for s in value]
        if len(set(athlete_ids)) != 6:
            raise ValueError("Дублиран състезател в шестицата")
        return value


class MatchCourtPlayerRead(BaseModel):
    zone: int
    zone_label: str
    athlete_id: int
    athlete_name: str
    jersey_number: int
    position: MatchPositionLiteral
    role: Optional[str] = None  # A/O/P… или S1/S2… според схемата


class MatchLineupRead(BaseModel):
    slots: list[MatchCourtPlayerRead] = Field(default_factory=list)
    libero: Optional[MatchCourtPlayerRead] = None
    complete: bool = False


class MatchRotationRead(BaseModel):
    rotation: int
    slots: list[MatchCourtPlayerRead]
    libero: Optional[MatchCourtPlayerRead] = None


class MatchRead(BaseModel):
    id: int
    team_id: int
    opponent_name: Optional[str] = None
    match_date: Optional[date] = None
    venue: Optional[str] = None
    system: MatchSystemLiteral
    format: MatchFormatLiteral = "bo5"
    status: MatchStatusLiteral
    notes: Optional[str] = None
    roster_count: int = 0
    has_lineup: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class MatchDetailRead(MatchRead):
    roster: list[MatchRosterPlayerRead] = Field(default_factory=list)
    lineup: MatchLineupRead = Field(default_factory=MatchLineupRead)
    rotations: list[MatchRotationRead] = Field(default_factory=list)


MatchStatActionLiteral = Literal[
    "kill",
    "ace",
    "block",
    "attack_error",
    "error",
    "dig",
    "pass_0",
    "pass_1",
    "pass_2",
    "pass_3",
    "free_ball",
    "pass_error",
    "opp_point",
    "our_point",
    "opp_error",
]


class MatchLiveStart(BaseModel):
    we_serve: bool = True
    rotation: int = Field(default=1, ge=1, le=6)
    set_number: int = Field(default=1, ge=1, le=5)


class MatchLiveScoreIn(BaseModel):
    side: Literal["us", "opp"]


class MatchLiveStatIn(BaseModel):
    action: MatchStatActionLiteral
    athlete_id: Optional[int] = None
    apply_score: bool = True


class MatchLiveEventRead(BaseModel):
    id: int
    athlete_id: Optional[int] = None
    athlete_name: Optional[str] = None
    action: MatchStatActionLiteral
    rotation: int
    our_score: int
    opp_score: int
    we_serve: bool
    scored_for: Optional[str] = None
    created_at: Optional[datetime] = None


class MatchLiveSetRead(BaseModel):
    id: int
    set_number: int
    our_score: int
    opp_score: int
    rotation: int
    we_serve: bool
    start_rotation: int = 1
    start_we_serve: bool = True
    status: str


class MatchLiveSetSummary(BaseModel):
    set_number: int
    our_score: int
    opp_score: int
    status: str


class MatchLiveStateRead(BaseModel):
    match_id: int
    team_id: int
    opponent_name: Optional[str] = None
    system: MatchSystemLiteral
    format: MatchFormatLiteral = "bo5"
    status: MatchStatusLiteral
    phase: Literal["base", "serve", "receive"] = "serve"
    set: Optional[MatchLiveSetRead] = None
    sets: list[MatchLiveSetSummary] = Field(default_factory=list)
    sets_won_us: int = 0
    sets_won_opp: int = 0
    sets_to_win: int = 3
    max_sets: int = 5
    needs_set_start: bool = False
    can_edit_lineup: bool = False
    match_won_by: Optional[Literal["us", "opp"]] = None
    court: list[MatchCourtPlayerRead] = Field(default_factory=list)
    libero: Optional[MatchCourtPlayerRead] = None
    recent_events: list[MatchLiveEventRead] = Field(default_factory=list)
    can_undo: bool = False


class MatchLivePhaseIn(BaseModel):
    phase: Literal["base", "serve", "receive"]
