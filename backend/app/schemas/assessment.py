# backend/app/schemas/assessment.py
"""Pydantic схеми за Methodical Assessment Layer v1."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal, Optional

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


class TestDefinitionAdminOut(TestDefinitionOut):
    """Изглед за администриране: добавя дали тестът е „заключен" (вече използван
    в резултати) и колко резултата го реферират."""
    usage_count: int = 0
    is_locked: bool = False


class TestDefinitionCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=64)
    name: str = Field(..., min_length=2, max_length=255)
    category: TestCategoryLiteral
    unit: str = Field(..., min_length=1, max_length=32)
    direction: TestDirectionLiteral = "higher_better"
    protocol: Optional[str] = None
    video_url: Optional[str] = Field(None, max_length=512)
    age_min: Optional[int] = Field(None, ge=4, le=99)
    age_max: Optional[int] = Field(None, ge=4, le=99)
    battery_version: Optional[str] = Field(None, max_length=16)
    sort_order: int = 0


class TestDefinitionUpdate(BaseModel):
    """Всички полета по избор. `code` е immutable и не се приема тук.

    Критичните за сравнимостта полета (`category`, `unit`, `direction`) се
    приемат, но routerът ги отхвърля, ако тестът вече е използван."""
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    category: Optional[TestCategoryLiteral] = None
    unit: Optional[str] = Field(None, min_length=1, max_length=32)
    direction: Optional[TestDirectionLiteral] = None
    protocol: Optional[str] = None
    video_url: Optional[str] = Field(None, max_length=512)
    age_min: Optional[int] = Field(None, ge=4, le=99)
    age_max: Optional[int] = Field(None, ge=4, le=99)
    battery_version: Optional[str] = Field(None, max_length=16)
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


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


# =========================
# Bridge: диагноза → предписание (AI генератор)
# =========================
class DeficitOut(BaseModel):
    domain: str
    normalized: float
    is_deficit: bool


class TrainingRecommendationOut(BaseModel):
    athlete_id: int
    window_id: int
    main_focus: str
    secondary_focus: Optional[str] = None
    deficits: list[DeficitOut] = Field(default_factory=list)
    generate_request: dict[str, Any] = Field(default_factory=dict)
    # Попълва се само ако клиентът поиска директно генериране (generate=true).
    generated: Optional[dict[str, Any]] = None


# =========================
# Съгласие (родителско споделяне на Картата за развитие) + родителски изглед
# =========================
class ConsentIn(BaseModel):
    granted: bool
    note: Optional[str] = Field(None, max_length=500)


class ConsentOut(BaseModel):
    athlete_id: int
    is_granted: bool = False
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None
    granted_by_user_id: Optional[int] = None
    note: Optional[str] = None


class ParentWindowOut(BaseModel):
    id: int
    season: str
    phase: WindowPhaseLiteral


class ParentDevelopmentOut(BaseModel):
    """Родителски read-only изглед на Картата за развитие (зад съгласие)."""
    consent_granted: bool = False
    athlete_name: Optional[str] = None
    scores: list[DevelopmentScoreOut] = Field(default_factory=list)
    windows: list[ParentWindowOut] = Field(default_factory=list)
    deficits: list[DeficitOut] = Field(default_factory=list)
    main_focus: Optional[str] = None
    secondary_focus: Optional[str] = None


# =========================
# Федеративно табло v1 (6 агрегирани плочки — без лични данни на дете)
# =========================
class CoverageTile(BaseModel):
    """Покритие: колко са обхванати от диагностиката в прозореца."""
    athletes_tested: int = 0
    athletes_total: int = 0
    teams_tested: int = 0
    teams_total: int = 0
    coverage_pct: Optional[float] = None
    is_indicative: bool = True


class DevelopmentByAgeRow(BaseModel):
    age_band: str
    avg_delta: Optional[float] = None
    avg_score: Optional[float] = None
    sample: int = 0
    is_indicative: bool = True


class AdoptionTile(BaseModel):
    """Приемане: дял отбори с активна годишна програма."""
    avg_adoption: Optional[float] = None
    teams_with_program: int = 0
    teams_total: int = 0
    is_indicative: bool = True


class NormReperRow(BaseModel):
    """Национален репер: средна сурова стойност по тест × възраст × пол."""
    test_code: str
    test_name: str
    age_band: str
    gender: str
    mean_value: Optional[float] = None
    sample: int = 0
    is_indicative: bool = True


class MethodicalLeaderRow(BaseModel):
    team_id: int
    team_name: str
    methodical_index: Optional[float] = None


class LeadersRiskTile(BaseModel):
    leaders: list[MethodicalLeaderRow] = Field(default_factory=list)
    risk: list[MethodicalLeaderRow] = Field(default_factory=list)


class DisciplineTile(BaseModel):
    """Дисциплина на измерване: среден дял тествани от състава."""
    avg_discipline: Optional[float] = None
    sample: int = 0
    is_indicative: bool = True


class FederationDashboardOut(BaseModel):
    window_id: Optional[int] = None
    window_label: Optional[str] = None
    coverage: CoverageTile = Field(default_factory=CoverageTile)
    development_by_age: list[DevelopmentByAgeRow] = Field(default_factory=list)
    adoption: AdoptionTile = Field(default_factory=AdoptionTile)
    norms: list[NormReperRow] = Field(default_factory=list)
    leaders_risk: LeadersRiskTile = Field(default_factory=LeadersRiskTile)
    discipline: DisciplineTile = Field(default_factory=DisciplineTile)
    filters: dict[str, Any] = Field(default_factory=dict)


# Разрешава forward-референциите в AssessmentSessionOut към схемите по-долу.
AssessmentSessionOut.model_rebuild()
