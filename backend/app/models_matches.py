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
    six_three = "6-3"


class MatchFormat(str, Enum):
    """Best-of format: first to 2 (bo3) or first to 3 (bo5)."""

    bo3 = "bo3"
    bo5 = "bo5"


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
    format = Column(
        SqlEnum(MatchFormat, native_enum=False, length=8, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MatchFormat.bo5,
    )
    status = Column(
        SqlEnum(MatchStatus, native_enum=False, length=16, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MatchStatus.draft,
        index=True,
    )
    notes = Column(Text, nullable=True)
    libero_athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True)
    live_input_locked = Column(Integer, nullable=False, default=0)
    # Публичен spectator линк (без login); изтрива се при край на мача
    live_share_token = Column(String(64), nullable=True, unique=True, index=True)

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


class MatchSetStatus(str, Enum):
    in_progress = "in_progress"
    finished = "finished"


class MatchStatAction(str, Enum):
    kill = "kill"
    ace = "ace"
    block = "block"
    attack_error = "attack_error"
    error = "error"
    dig = "dig"
    pass_0 = "pass_0"
    pass_1 = "pass_1"
    pass_2 = "pass_2"
    pass_3 = "pass_3"
    free_ball = "free_ball"
    pass_error = "pass_error"
    opp_point = "opp_point"
    our_point = "our_point"
    opp_error = "opp_error"  # грешка на противника → точка за нас


class MatchSet(Base):
    __tablename__ = "match_sets"
    __table_args__ = (UniqueConstraint("match_id", "set_number", name="uq_match_set_number"),)

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    set_number = Column(Integer, nullable=False, default=1)
    our_score = Column(Integer, nullable=False, default=0)
    opp_score = Column(Integer, nullable=False, default=0)
    rotation = Column(Integer, nullable=False, default=1)
    we_serve = Column(Integer, nullable=False, default=1)
    start_rotation = Column(Integer, nullable=False, default=1)
    start_we_serve = Column(Integer, nullable=False, default=1)
    status = Column(
        SqlEnum(MatchSetStatus, native_enum=False, length=16, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=MatchSetStatus.in_progress,
    )

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class MatchStatEvent(Base):
    __tablename__ = "match_stat_events"

    id = Column(Integer, primary_key=True, index=True)
    match_id = Column(Integer, ForeignKey("matches.id", ondelete="CASCADE"), nullable=False, index=True)
    set_id = Column(Integer, ForeignKey("match_sets.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id = Column(Integer, ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(
        SqlEnum(MatchStatAction, native_enum=False, length=24, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    rotation = Column(Integer, nullable=False, default=1)
    our_score = Column(Integer, nullable=False, default=0)
    opp_score = Column(Integer, nullable=False, default=0)
    we_serve = Column(Integer, nullable=False, default=1)
    scored_for = Column(String(8), nullable=True)
    undone = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, server_default=func.now(), nullable=False)
