from datetime import datetime, date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class AthleteCreate(BaseModel):
    first_name: str
    middle_name: str
    last_name: str
    # Legacy single-field create still accepted if name parts missing (import / old clients)
    athlete_name: Optional[str] = None
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_date: date
    birth_year: Optional[int] = None
    place_of_birth: str
    nationality: Optional[str] = None
    gender: Literal["male", "female"]
    notes: Optional[str] = None
    is_active: bool = True
    egn: Optional[str] = None
    bvf_player_id: Optional[int] = None
    bvf_player_number: Optional[int] = None
    # Тренировъчна група при създаване (TeamMember)
    team_id: Optional[int] = None

    @field_validator("first_name", "middle_name", "last_name", "place_of_birth")
    @classmethod
    def strip_required(cls, v: str) -> str:
        s = (v or "").strip()
        if not s:
            raise ValueError("задължително поле")
        return s


class AthleteUpdate(BaseModel):
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    athlete_name: Optional[str] = None
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_date: Optional[date] = None
    birth_year: Optional[int] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    egn: Optional[str] = None
    bvf_player_id: Optional[int] = None
    bvf_player_number: Optional[int] = None


class AthleteRecentPayment(BaseModel):
    month_key: str
    amount: float
    paid_at: Optional[datetime] = None
    payment_id: Optional[int] = None


class CardedTeamBadge(BaseModel):
    label: str
    year: Optional[int] = None
    age_group: Optional[str] = None
    sex_label: Optional[str] = None


class AthleteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coach_id: int
    club_id: Optional[int] = None
    athlete_name: str
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_year: Optional[int] = None
    birth_date: Optional[date] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    notes: Optional[str] = None
    is_active: bool = True
    egn: Optional[str] = None
    bvf_player_id: Optional[int] = None
    bvf_player_number: Optional[int] = None
    bvf_photo_id: Optional[str] = None
    bvf_synced_at: Optional[datetime] = None
    bvf_identity_locked: bool = False
    has_photo: bool = False
    team_names: list[str] = Field(default_factory=list)
    carded_teams: list[CardedTeamBadge] = Field(default_factory=list)
    recent_payments: list[AthleteRecentPayment] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @model_validator(mode="after")
    def _lock_flag(self):
        if self.bvf_player_id and not self.bvf_identity_locked:
            self.bvf_identity_locked = True
        return self


class FeesMonthCoachRow(BaseModel):
    coach_id: int
    coach_name: str
    total_collected: float = 0
    paid_count: int = 0
    unpaid_count: int = 0


class FeesMonthSummary(BaseModel):
    month_key: str
    total_collected: float = 0
    paid_count: int = 0
    unpaid_count: int = 0
    athlete_count: int = 0
    by_coach: list[FeesMonthCoachRow] = Field(default_factory=list)


class AthletePaymentCreate(BaseModel):
    month_key: str  # YYYY-MM
    amount: float
    note: Optional[str] = None


class AthletePaymentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    athlete_id: int
    coach_id: int
    month_key: str
    amount: float
    paid_at: datetime
    note: Optional[str] = None
    created_at: Optional[datetime] = None


class MonthStatusRow(BaseModel):
    month_key: str
    paid: bool
    amount: Optional[float] = None
    payment_id: Optional[int] = None
    paid_at: Optional[datetime] = None


class FeeReminderResponse(BaseModel):
    month_key: str
    targeted: int = 0
    notified: int = 0
    skipped_no_push: int = 0
    errors: list[str] = Field(default_factory=list)


class AthleteMonthlyReport(BaseModel):
    athlete: AthleteRead
    months: list[MonthStatusRow] = Field(default_factory=list)
    total_paid: float = 0.0


class PeriodAthleteReportRow(BaseModel):
    athlete_id: int
    athlete_name: str
    parent_name: Optional[str] = None
    paid_months: int
    unpaid_months: int
    total_paid: float
    months: list[MonthStatusRow] = Field(default_factory=list)


class PeriodReportResponse(BaseModel):
    from_month: str
    to_month: str
    total_athletes: int
    months_count: int
    rows: list[PeriodAthleteReportRow] = Field(default_factory=list)

