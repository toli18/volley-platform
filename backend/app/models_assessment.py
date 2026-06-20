# backend/app/models_assessment.py
"""Methodical Assessment Layer v1 — модели.

Дефинирани в отделен модул (а не в монолитния models.py), за по-малък diff и
по-лесна поддръжка. Регистрират се към общия Base/metadata чрез re-export от
`app.models` (виж края на models.py), така че `from app.models import TestDefinition`
продължава да работи.
"""
from __future__ import annotations

from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SqlEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


# =========================
# Enums
# =========================
class TestCategory(str, Enum):
    technical = "technical"
    speed = "speed"
    physical = "physical"
    anthropometry = "anthropometry"


class TestDirection(str, Enum):
    higher_better = "higher_better"
    lower_better = "lower_better"
    context = "context"


class AssessmentWindowPhase(str, Enum):
    baseline = "baseline"
    mid = "mid"
    endline = "endline"


class AssessmentSessionStatus(str, Enum):
    open = "open"
    finalized = "finalized"


# =========================
# 1. Тестова батерия (стандарт)
# =========================
class TestDefinition(Base):
    """Каноничен запис на един тест от националната батерия (живее в библиотеката)."""

    __tablename__ = "test_definitions"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(255), nullable=False)
    category = Column(SqlEnum(TestCategory, native_enum=False, length=24), nullable=False)
    unit = Column(String(32), nullable=False)  # "points" | "cm" | "sec" | "kg"
    direction = Column(
        SqlEnum(TestDirection, native_enum=False, length=24),
        nullable=False,
        default=TestDirection.higher_better,
    )
    protocol = Column(Text, nullable=True)
    video_url = Column(String(512), nullable=True)
    age_min = Column(Integer, nullable=True)
    age_max = Column(Integer, nullable=True)
    battery_version = Column(String(16), nullable=False, default="v1.0")
    sort_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


# =========================
# 2. Тестов прозорец (сезон + цикъл + фаза)
# =========================
class AssessmentWindow(Base):
    """6-месечен прозорец на измерване: baseline / mid / endline."""

    __tablename__ = "assessment_windows"

    id = Column(Integer, primary_key=True, index=True)
    season = Column(String(16), nullable=False)  # напр. "2025/26"
    cycle = Column(String(32), nullable=False, default="6м")
    phase = Column(SqlEnum(AssessmentWindowPhase, native_enum=False, length=24), nullable=False)
    # null club_id = национален прозорец; иначе клубно-специфичен.
    club_id = Column(Integer, ForeignKey("clubs.id", ondelete="CASCADE"), nullable=True, index=True)
    label = Column(String(120), nullable=True)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (Index("ix_assessment_windows_season_phase", "season", "phase"),)


# =========================
# 3. Диагностична сесия (тестване на отбор в прозорец)
# =========================
class AssessmentSession(Base):
    __tablename__ = "assessment_sessions"

    id = Column(Integer, primary_key=True, index=True)
    window_id = Column(
        Integer, ForeignKey("assessment_windows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    coach_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    conducted_on = Column(Date, nullable=True)
    status = Column(
        SqlEnum(AssessmentSessionStatus, native_enum=False, length=24),
        nullable=False,
        default=AssessmentSessionStatus.open,
    )

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    results = relationship(
        "AssessmentResult",
        cascade="all, delete-orphan",
        backref="session",
    )

    __table_args__ = (
        UniqueConstraint("window_id", "team_id", name="uq_assessment_session_window_team"),
    )


# =========================
# 4. Единичен резултат (сесия × състезател × тест)
# =========================
class AssessmentResult(Base):
    __tablename__ = "assessment_results"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer, ForeignKey("assessment_sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    test_code = Column(String(64), nullable=False, index=True)  # реф. към TestDefinition.code
    raw_value = Column(Float, nullable=True)
    normalized = Column(Float, nullable=True)  # 0–100 спрямо норма
    percentile = Column(Float, nullable=True)
    is_indicative = Column(Boolean, nullable=False, default=True)  # докато нормите узреят

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("session_id", "athlete_id", "test_code", name="uq_assessment_result_unique"),
        Index("ix_assessment_results_athlete_test", "athlete_id", "test_code"),
    )


# =========================
# 5. Норми/репери (тест × възраст × пол)
# =========================
class AssessmentNorm(Base):
    __tablename__ = "assessment_norms"

    id = Column(Integer, primary_key=True, index=True)
    test_code = Column(String(64), nullable=False, index=True)
    age_band = Column(String(16), nullable=False)  # напр. "U13"
    gender = Column(String(16), nullable=False)  # "male" | "female"
    sample_count = Column(Integer, nullable=False, default=0)
    mean_value = Column(Float, nullable=True)
    std_value = Column(Float, nullable=True)
    p20 = Column(Float, nullable=True)
    p40 = Column(Float, nullable=True)
    p60 = Column(Float, nullable=True)
    p80 = Column(Float, nullable=True)
    # "seed" = репер от методическия комитет (абсолютна скала за cold-start);
    # "computed" = норма, изчислена от реални данни (узрява и измества seed-а).
    source = Column(String(16), nullable=False, default="computed")
    battery_version = Column(String(16), nullable=False, default="v1.0")

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint(
            "test_code", "age_band", "gender", "battery_version", name="uq_assessment_norm_unique"
        ),
    )


# =========================
# 6. Development Score (състезател × прозорец)
# =========================
class DevelopmentScore(Base):
    __tablename__ = "development_scores"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    window_id = Column(
        Integer, ForeignKey("assessment_windows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    technical_subindex = Column(Float, nullable=True)  # 0–100
    physical_subindex = Column(Float, nullable=True)  # 0–100
    development_score = Column(Float, nullable=True)  # 0–100
    delta = Column(Float, nullable=True)  # спрямо предходния прозорец

    computed_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("athlete_id", "window_id", name="uq_development_score_unique"),
    )


# =========================
# 7. Методически Индекс (отбор/клуб/нация × прозорец)
# =========================
class MethodicalIndexSnapshot(Base):
    __tablename__ = "methodical_index_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    subject_type = Column(String(16), nullable=False)  # "team" | "club" | "national"
    subject_id = Column(Integer, nullable=True)  # team_id / club_id; null за национален
    window_id = Column(
        Integer, ForeignKey("assessment_windows.id", ondelete="CASCADE"), nullable=False, index=True
    )
    adoption = Column(Float, nullable=True)  # 0–100
    measurement_discipline = Column(Float, nullable=True)  # 0–100
    development = Column(Float, nullable=True)  # 0–100
    methodical_index = Column(Float, nullable=True)  # 0–100

    computed_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index("ix_methodical_index_subject_window", "subject_type", "subject_id", "window_id"),
    )


# =========================
# 8. Родителско съгласие за споделяне на Картата за развитие
# =========================
class AssessmentConsent(Base):
    """Маркер за съгласие индивидуалната Карта за развитие да е видима за родителя.

    Записва се от треньора (по искане на родителя). Един ред на състезател.
    """

    __tablename__ = "assessment_consents"

    id = Column(Integer, primary_key=True, index=True)
    athlete_id = Column(
        Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    is_granted = Column(Boolean, nullable=False, default=False)
    granted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    granted_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
