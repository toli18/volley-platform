# backend/app/schemas/training.py
from typing import Optional, Dict, List, Any
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

from ..models import TrainingSource, TrainingStatus


def _normalize_source(v: Any) -> TrainingSource:
    if v is None:
        return TrainingSource.manual

    if isinstance(v, TrainingSource):
        return v

    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("manual", "man", "ръчна", "ruchna", "rъchna"):
            return TrainingSource.manual
        if s in ("generator", "generated", "gen", "генерирана", "generirana"):
            return TrainingSource.generator

    try:
        return TrainingSource(v)
    except Exception:
        raise ValueError("Input should be 'ръчна'/'генерирана' (или aliases: manual/generator).")


def _normalize_status(v: Any) -> TrainingStatus:
    """
    Приемаме:
      - "чернова" / "запазена"
      - "draft" / "saved"
      - TrainingStatus enum
    """
    if v is None:
        return TrainingStatus.draft

    if isinstance(v, TrainingStatus):
        return v

    if isinstance(v, str):
        s = v.strip().lower()
        if s in ("чернова", "draft"):
            return TrainingStatus.draft
        if s in ("запазена", "saved", "save"):
            return TrainingStatus.saved

    try:
        return TrainingStatus(v)
    except Exception:
        raise ValueError("Input should be 'чернова'/'запазена' (или aliases: draft/saved).")


def _normalize_plan(v: Any) -> Dict[str, List[int]]:
    """
    plan: dict[str, list[int]]
    Пример:
      { "warmup": [1,2], "game": [5] }
    """
    if v is None:
        return {}

    if not isinstance(v, dict):
        raise ValueError("plan must be an object (dict) with sections -> list[int].")

    out: Dict[str, List[int]] = {}
    for k, arr in v.items():
        if not k:
            continue
        if arr is None:
            continue
        if not isinstance(arr, list):
            raise ValueError(f"plan['{k}'] must be a list of drill IDs.")
        cleaned: List[int] = []
        for x in arr:
            try:
                cleaned.append(int(x))
            except Exception:
                continue
        # държим само непразните секции
        if cleaned:
            out[str(k)] = cleaned
    return out


class TrainingBase(BaseModel):
    title: str
    club_id: Optional[int] = None
    source: TrainingSource = TrainingSource.manual
    status: TrainingStatus = TrainingStatus.draft

    plan: Dict[str, List[int]] = {}
    notes: Optional[str] = None

    @field_validator("source", mode="before")
    @classmethod
    def validate_source(cls, v):
        return _normalize_source(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        return _normalize_status(v)

    @field_validator("plan", mode="before")
    @classmethod
    def validate_plan(cls, v):
        return _normalize_plan(v)


class TrainingCreate(TrainingBase):
    pass


class TrainingUpdate(BaseModel):
    title: Optional[str] = None
    club_id: Optional[int] = None
    source: Optional[TrainingSource] = None
    status: Optional[TrainingStatus] = None
    plan: Optional[Dict[str, List[int]]] = None
    notes: Optional[str] = None

    @field_validator("source", mode="before")
    @classmethod
    def validate_source(cls, v):
        if v is None:
            return v
        return _normalize_source(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        if v is None:
            return v
        return _normalize_status(v)

    @field_validator("plan", mode="before")
    @classmethod
    def validate_plan(cls, v):
        if v is None:
            return v
        return _normalize_plan(v)


class TrainingRead(TrainingBase):
    id: int
    coach_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# --- Детайлна схема ---
class DrillMini(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    level: Optional[str] = None
    equipment: Optional[str] = None
    image_urls: Optional[list] = None
    video_urls: Optional[list] = None

    model_config = ConfigDict(from_attributes=True)


class TrainingReadDetailed(TrainingRead):
    drills: Dict[int, DrillMini] = {}
