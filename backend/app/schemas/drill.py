# backend/app/schemas/drills.py
from typing import Optional, List, Union
from enum import Enum
from datetime import datetime
from pydantic import BaseModel, Field


class DrillStatus(str, Enum):
    draft = "draft"
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class DrillBase(BaseModel):
    # ✅ Нормализирано към DB модела: models.Drill.title
    title: str = Field(..., min_length=1)

    # Основни
    description: Optional[str] = None

    # Категоризация
    category: Optional[str] = None
    skill_focus: Optional[str] = None
    level: Optional[str] = None
    intensity: Optional[str] = None

    # Организация
    duration_minutes: Optional[int] = None
    players_min: Optional[int] = None
    players_max: Optional[int] = None
    equipment: Optional[str] = None

    # Методика
    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    # Медия (в DB е JSON; поддържаме и string за backward compatibility)
    image_urls: Optional[Union[List[str], str]] = None
    video_urls: Optional[Union[List[str], str]] = None

    # Workflow
    status: Optional[DrillStatus] = None
    rejection_reason: Optional[str] = None


class DrillCreate(DrillBase):
    # при създаване не изискваме status; backend ще го зададе (pending)
    status: Optional[DrillStatus] = None
    rejection_reason: Optional[str] = None


class DrillUpdate(BaseModel):
    # Partial update – всичко optional
    title: Optional[str] = None
    description: Optional[str] = None

    category: Optional[str] = None
    skill_focus: Optional[str] = None
    level: Optional[str] = None
    intensity: Optional[str] = None

    duration_minutes: Optional[int] = None
    players_min: Optional[int] = None
    players_max: Optional[int] = None
    equipment: Optional[str] = None

    setup: Optional[str] = None
    instructions: Optional[str] = None
    coaching_points: Optional[str] = None
    common_mistakes: Optional[str] = None
    progressions: Optional[str] = None
    regressions: Optional[str] = None

    image_urls: Optional[Union[List[str], str]] = None
    video_urls: Optional[Union[List[str], str]] = None

    status: Optional[DrillStatus] = None
    rejection_reason: Optional[str] = None


class CreatorInfo(BaseModel):
    id: int
    name: str
    email: str

    class Config:
        from_attributes = True


class DrillRead(DrillBase):
    id: int
    status: DrillStatus
    created_by: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
