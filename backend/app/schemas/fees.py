from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class AthleteCreate(BaseModel):
    athlete_name: str
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_year: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True


class AthleteUpdate(BaseModel):
    athlete_name: Optional[str] = None
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_year: Optional[int] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class AthleteRecentPayment(BaseModel):
    month_key: str
    amount: float
    paid_at: Optional[datetime] = None
    payment_id: Optional[int] = None


class AthleteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coach_id: int
    club_id: Optional[int] = None
    athlete_name: str
    athlete_phone: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_year: Optional[int] = None
    notes: Optional[str] = None
    is_active: bool = True
    recent_payments: list[AthleteRecentPayment] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


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

