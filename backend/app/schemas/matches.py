# backend/app/schemas/matches.py
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

MatchSystemLiteral = Literal["5-1", "6-2", "4-2"]
MatchStatusLiteral = Literal["draft", "ready", "live", "finished", "cancelled"]
MatchPositionLiteral = Literal["S", "OH", "MB", "OPP", "L"]

MAX_MATCH_ROSTER = 14


class MatchCreate(BaseModel):
    opponent_name: Optional[str] = None
    match_date: Optional[date] = None
    venue: Optional[str] = None
    system: MatchSystemLiteral = "5-1"
    notes: Optional[str] = None


class MatchUpdate(BaseModel):
    opponent_name: Optional[str] = None
    match_date: Optional[date] = None
    venue: Optional[str] = None
    system: Optional[MatchSystemLiteral] = None
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
