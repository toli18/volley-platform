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


class BatteryAuditOut(BaseModel):
    """Запис от журнала на промените по батерията."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    test_code: str
    action: str
    changes: Optional[dict[str, Any]] = None
    actor_user_id: Optional[int] = None
    actor_name: Optional[str] = None
    created_at: Optional[datetime] = None


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
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    session_id: int
    athlete_id: int
    test_code: str
    raw_value: Optional[float] = None
    normalized: Optional[float] = None
    percentile: Optional[float] = None
    is_indicative: bool = True
    # Norm Resolver метаданни (ADR-002 UX Contract) — адитивни, optional.
    # Четат се от ORM полетата `norm_*`; старите клиенти ги игнорират.
    source: Optional[str] = Field(default=None, validation_alias="norm_source")
    confidence: Optional[str] = Field(default=None, validation_alias="norm_confidence")
    explanation: Optional[str] = Field(default=None, validation_alias="norm_explanation")


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
# Реални (сурови) стойности по прозорец
# =========================
class AthleteResultRow(BaseModel):
    """Един суров резултат на състезател за конкретен тест в даден прозорец."""
    test_code: str
    test_name: str
    category: TestCategoryLiteral
    unit: str
    direction: TestDirectionLiteral
    sort_order: int = 0
    raw_value: Optional[float] = None
    normalized: Optional[float] = None
    is_indicative: bool = True
    # Norm Resolver метаданни (ADR-002 UX Contract) — адитивни, optional.
    source: Optional[str] = None
    confidence: Optional[str] = None
    explanation: Optional[str] = None


class AthleteResultsWindowOut(BaseModel):
    """Сурови стойности на състезателя, групирани по прозорец, плюс изчисления
    производен показател „чист отскок" (отскок след засилване − разтег)."""
    window_id: int
    season: Optional[str] = None
    phase: Optional[WindowPhaseLiteral] = None
    results: list[AthleteResultRow] = Field(default_factory=list)
    net_jump: Optional[float] = None


# =========================
# Профил на таланта (надстроечен слой — НЕ променя официалните оценки)
# =========================
class TalentTestScoreOut(BaseModel):
    """Оценка на таланта за един тест спрямо референтния (по-голям) стандарт 2022."""
    test_code: str
    test_name: Optional[str] = None
    raw_value: float
    talent_score: float  # 0–100 спрямо горната летва
    talent_label: str  # Незадоволително…Отлично


class TalentProfileOut(BaseModel):
    """Профил на таланта на дете: число + дума спрямо стандарта на по-големите.

    Това е чисто индикативен, надстроечен изглед — не участва в официалната
    оценка, Development Score, нормализацията или Dashboard.
    """
    athlete_id: int
    athlete_name: Optional[str] = None
    gender: Optional[str] = None
    age_band: Optional[str] = None  # собствената възраст (контекст)
    reference_age_band: Optional[str] = None  # горната летва, спрямо която мерим
    covered: bool = False  # има ли изобщо стандарт 2022 за този пол
    is_aspirational: bool = False  # детето по-малко ли е от референтната възраст
    talent_index: Optional[float] = None
    talent_index_label: Optional[str] = None
    tests: list[TalentTestScoreOut] = Field(default_factory=list)


# =========================
# Мотивационен изглед за детето (надстроечен слой — НЕ променя оценките)
# =========================
class MotivationNextGoalOut(BaseModel):
    """Следваща „летва" (ниво 2022) за собствената възраст."""
    model_config = ConfigDict(from_attributes=True)
    target_raw: float
    next_level: str
    gap: float  # колко още в сурови единици


class MotivationTestOut(BaseModel):
    """Мотивационна картина за един тест (за самото дете)."""
    model_config = ConfigDict(from_attributes=True)
    test_code: str
    test_name: str
    unit: str
    higher_better: bool
    category: str

    latest: float
    personal_best: Optional[float] = None
    is_personal_best: bool = False
    is_new_record: bool = False

    prev: Optional[float] = None
    delta: Optional[float] = None
    improved: Optional[bool] = None

    next_goal: Optional[MotivationNextGoalOut] = None

    talent_score: Optional[float] = None
    talent_label: Optional[str] = None

    peer_percentile: Optional[float] = None
    peer_sample: int = 0
    peer_indicative: bool = False


class MotivationOut(BaseModel):
    """Цялостна мотивационна картина за дете (позитивна и проста)."""
    model_config = ConfigDict(from_attributes=True)
    athlete_id: int
    athlete_name: Optional[str] = None
    gender: Optional[str] = None
    age_band: Optional[str] = None
    reference_age_band: Optional[str] = None
    improved_count: int = 0
    personal_best_count: int = 0
    talent_index: Optional[float] = None
    talent_index_label: Optional[str] = None
    tests: list[MotivationTestOut] = Field(default_factory=list)


# =========================
# Възрастов еквивалент (на каква възраст отговаря представянето — само четене)
# =========================
class AgeEquivalentTestOut(BaseModel):
    test_code: str
    test_name: str
    unit: Optional[str] = None
    category: Optional[str] = None
    higher_better: bool = True
    latest: float
    equivalent_age: float
    status: str  # in_range | above_oldest | below_youngest
    points_used: int = 0
    delta_years: Optional[float] = None


class AgeEquivalentOut(BaseModel):
    athlete_id: int
    athlete_name: Optional[str] = None
    gender: Optional[str] = None
    age_band: Optional[str] = None
    own_age: Optional[float] = None
    tests: list[AgeEquivalentTestOut] = Field(default_factory=list)


# =========================
# Скаутска таблица (всички деца × тестове, две сравнения — само четене)
# =========================
class ScoutCellOut(BaseModel):
    test_code: str
    raw_value: Optional[float] = None
    # Сравнение А — национален стандарт 2022 (за собствената възраст).
    score_2022: Optional[float] = None
    score_2022_label: Optional[str] = None
    # Сравнение Б — връстников процентил в системата.
    peer_percentile: Optional[float] = None
    peer_sample: int = 0
    peer_indicative: bool = False
    # Сравнение В — талант спрямо летвата на по-големите (2022).
    talent_score: Optional[float] = None
    talent_label: Optional[str] = None


class ScoutRowOut(BaseModel):
    athlete_id: int
    athlete_name: str
    age_band: Optional[str] = None
    gender: Optional[str] = None
    cells: list[ScoutCellOut] = Field(default_factory=list)


class ScoutTestOut(BaseModel):
    """Дефиниция на колона-тест (за хедъра на таблицата)."""
    code: str
    name: str
    category: TestCategoryLiteral
    unit: str
    direction: TestDirectionLiteral


class ScoutingTableOut(BaseModel):
    tests: list[ScoutTestOut] = Field(default_factory=list)
    rows: list[ScoutRowOut] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)


# =========================
# Машина за национални норми (Фаза 2 — само федерация/админ)
# =========================
class NationalNormCellOut(BaseModel):
    """Жива норма за клетка тест × възраст × пол, до стандарт 2022."""
    test_code: str
    test_name: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    higher_better: bool = True
    age_band: str
    gender: str

    n: int = 0
    mean: Optional[float] = None
    std: Optional[float] = None
    p20: Optional[float] = None
    p40: Optional[float] = None
    p60: Optional[float] = None
    p80: Optional[float] = None

    clubs_count: int = 0
    regions_count: int = 0
    coverage: float = 0.0
    season_count: int = 0
    eligible_athletes: int = 0

    display_ready: bool = False
    trust_ready: bool = False
    confidence: Optional[str] = None

    # Сравнение със стандарт 2022.
    has_2022: bool = False
    mean_score_2022: Optional[float] = None
    mean_label_2022: Optional[str] = None

    is_approved: bool = False


class NationalNormMachineOut(BaseModel):
    cells: list[NationalNormCellOut] = Field(default_factory=list)
    min_display_sample: int = 5
    min_trust_sample: int = 20
    filters: dict[str, Any] = Field(default_factory=dict)


class NationalNormActionIn(BaseModel):
    """Одобряване/оттегляне на жива норма за конкретна клетка."""
    test_code: str
    age_band: str
    gender: str


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
    # Позитивен мотивационен слой за детето/родителя (рекорди, следваща цел,
    # % връстници, талант). Надстроечен — не променя официалните оценки.
    motivation: Optional[MotivationOut] = None


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


class RegionIndexRow(BaseModel):
    """Регионален rollup на Методическия Индекс (6-те структури на БФВ)."""
    region: str
    avg_index: Optional[float] = None
    teams: int = 0
    is_indicative: bool = True


class ParticipationRow(BaseModel):
    """Участие по тест: от тестваните деца, колко имат измерен този тест."""
    test_code: str
    test_name: str
    category: Optional[str] = None
    measured: int = 0
    tested_total: int = 0
    participation_pct: Optional[float] = None
    is_low: bool = False


class TalentPyramidRow(BaseModel):
    """Пирамида на талантите: брой активни деца по възраст и пол + тествани."""
    age_band: str
    female: int = 0
    male: int = 0
    total: int = 0
    tested: int = 0


class NormsReadinessTile(BaseModel):
    """Готовност на националните норми (обобщение от Машината за норми)."""
    official: int = 0  # одобрени, вече основа за оценката
    ready: int = 0  # ≥20 деца, чакат одобрение
    indicative: int = 0  # 5–19 деца, показват се индикативно
    low_data: int = 0  # 1–4 деца, още не светят
    total_cells: int = 0


class TrendPoint(BaseModel):
    """Динамика по прозорци: ключови показатели във времето."""
    window_id: int
    window_label: str
    coverage_pct: Optional[float] = None
    avg_development: Optional[float] = None
    adoption_pct: Optional[float] = None


class FederationDashboardOut(BaseModel):
    window_id: Optional[int] = None
    window_label: Optional[str] = None
    coverage: CoverageTile = Field(default_factory=CoverageTile)
    development_by_age: list[DevelopmentByAgeRow] = Field(default_factory=list)
    adoption: AdoptionTile = Field(default_factory=AdoptionTile)
    norms: list[NormReperRow] = Field(default_factory=list)
    leaders_risk: LeadersRiskTile = Field(default_factory=LeadersRiskTile)
    discipline: DisciplineTile = Field(default_factory=DisciplineTile)
    regional_index: list[RegionIndexRow] = Field(default_factory=list)
    participation: list[ParticipationRow] = Field(default_factory=list)
    talent_pyramid: list[TalentPyramidRow] = Field(default_factory=list)
    norms_readiness: NormsReadinessTile = Field(default_factory=NormsReadinessTile)
    trend: list[TrendPoint] = Field(default_factory=list)
    filters: dict[str, Any] = Field(default_factory=dict)


# Разрешава forward-референциите в AssessmentSessionOut към схемите по-долу.
AssessmentSessionOut.model_rebuild()
