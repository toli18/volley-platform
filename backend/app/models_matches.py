# backend/app/models_matches.py
"""Match / Rotations module — модели за мачове, състав и (по-късно) live статистика.

Регистрират се към общия Base чрез re-export от `app.models`.
"""
from __future__ import annotations

from enum import Enum

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Enum as SqlEnum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.sql import func

from .database import Base


class MatchStatus(str, Enum):
    draft = "draft"  # състав / схема
    ready = "ready"  # готов за live
    live = "live"
    finished = "finished"
    cancelled = "cancelled"


class MatchSystem(str, Enum):
    five_one = "5-1"
    six_two = "6-2"
    four_two = "4-2"


class MatchPosition(str, Enum):
    """Канонични кодове; UI показва Р/П/Ц/Д/Л."""

    S = "S"  # Разпределител
    OH = "OH"  # Посрещач
    MB = "MB"  # Централен блокировач
    OPP = "OPP"  # Диагонал
    L = "L"  # Либеро


class Match(Base):
    __tablename__ = "matches"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    opponent_name = Column(String(255), nullable=True)
    match_date = Column(Date, nullable=True)
    venue = Column(String(255), nullable=True)
    system = Column(
        SqlEnum(MatchSystem, native_enum=False, length=8, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MatchSystem.five_one,
    )
    status = Column(
        SqlEnum(MatchStatus, native_enum=False, length=16, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MatchStatus.draft,
        index=True,
    )
    notes = Column(Text, nullable=True)
    libero_athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class MatchRosterPlayer(Base):
    """Избрани състезатели за мача (макс. 14) с № екип и позиция."""

    __tablename__ = "match_roster_players"
    __table_args__ = (
        UniqueConstraint("match_id", "athlete_id", name="uq_match_roster_athlete"),
        UniqueConstraint("match_id", "jersey_number", name="uq_match_roster_jersey"),
    )

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False, index=True)
    jersey_number = Column(Integer, nullable=False)
    position = Column(
        SqlEnum(MatchPosition, native_enum=False, length=8, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    sort_order = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class MatchLineupSlot(Base):
    """Стартова шестица (R1): зона 1–6 → състезател. R2–R6 се изчисляват."""

    __tablename__ = "match_lineup_slots"
    __table_args__ = (UniqueConstraint("match_id", "zone", name="uq_match_lineup_zone"),)

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    zone = Column(Integer, nullable=False)  # 1..6
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
