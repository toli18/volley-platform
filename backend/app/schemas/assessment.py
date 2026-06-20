# backend/app/schemas/assessment.py
"""Pydantic схеми за Methodical Assessment Layer v1."""
from __future__ import annotations

from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

TestCategoryLiteral = Literal["technical", "speed", "physical", "anthropometry"]
TestDirectionLiteral = Literal["higher_better", "lower_better", "context"]
WindowPhaseLiteral = Literal["baseline", "mid", "endline"]
SessionStatusLiteral = Literal["open", "finalized"]
SubjectTypeLiteral = Literal["team", "club", "national"]


# =========================
# Тестова батерия
# =========================
class TestDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    category: TestCategoryLiteral
    unit: str
    direction: TestDirectionLiteral
    protocol: Optional[str] = None
    video_url: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    battery_version: str = "v1.0"
    sort_order: int = 0
    is_active: bool = True


# =========================
# Прозорец
# =========================
class AssessmentWindowCreate(BaseModel):
    season: str = Field(..., examples=["2025/26"])
    phase: WindowPhaseLiteral
    cycle: str = "6м"
    club_id: Optional[int] = None
    label: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class AssessmentWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    season: str
    cycle: str
    phase: WindowPhaseLiteral
    club_id: Optional[int] = None
    label: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    created_at: Optional[datetime] = None


# =========================
# Сесия + резултати
# =========================
class AssessmentSessionCreate(BaseModel):
    window_id: int
    team_id: int
    conducted_on: Optional[date] = None


class AssessmentResultIn(BaseModel):
    athlete_id: int
    test_code: str
    raw_value: Optional[float] = None


class ResultBulkIn(BaseModel):
    results: list[AssessmentResultIn] = Field(default_factory=list)


class AssessmentResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    athlete_id: int
    test_code: str
    raw_value: Optional[float] = None
    normalized: Optional[float] = None
    percentile: Optional[float] = None
    is_indicative: bool = True


class AssessmentSessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    window_id: int
    team_id: int
    coach_id: Optional[int] = None
    conducted_on: Optional[date] = None
    status: SessionStatusLiteral
    created_at: Optional[datetime] = None
    results: list[AssessmentResultOut] = Field(default_factory=list)
    # Попълват се само когато сесията е finalized (виж GET / finalize endpoint-ите).
    development_scores: list["DevelopmentScoreOut"] = Field(default_factory=list)
    methodical_index: Optional["MethodicalIndexOut"] = None


# =========================
# Development Score
# =========================
class DevelopmentScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    athlete_id: int
    window_id: int
    technical_subindex: Optional[float] = None
    physical_subindex: Optional[float] = None
    development_score: Optional[float] = None
    delta: Optional[float] = None
    computed_at: Optional[datetime] = None


# =========================
# Методически Индекс
# =========================
class MethodicalIndexOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    subject_type: SubjectTypeLiteral
    subject_id: Optional[int] = None
    window_id: int
    adoption: Optional[float] = None
    measurement_discipline: Optional[float] = None
    development: Optional[float] = None
    methodical_index: Optional[float] = None
    computed_at: Optional[datetime] = None


# Разрешава forward-референциите в AssessmentSessionOut към схемите по-долу.
AssessmentSessionOut.model_rebuild()
