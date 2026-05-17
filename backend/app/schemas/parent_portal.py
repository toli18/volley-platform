from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ParentAccessStatusResponse(BaseModel):
    has_active_token: bool = False
    token_preview: Optional[str] = None
    parent_url: Optional[str] = None
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None


class ParentAccessCreateResponse(BaseModel):
    parent_url: str
    token_preview: str
    expires_at: Optional[datetime] = None


class ParentScheduleItem(BaseModel):
    date: str
    start_time: str
    end_time: str
    location: str
    team_name: Optional[str] = None
    event_type: str = "training"
    competition_kind: Optional[str] = None
    competition_kind_label: Optional[str] = None


class ParentPaymentRow(BaseModel):
    month_key: str
    amount: float = 0
    paid: bool = False
    paid_at: Optional[datetime] = None


class ParentAttendanceRow(BaseModel):
    date: str
    team_name: Optional[str] = None
    status: str


class ParentAttendanceSummary(BaseModel):
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    total: int = 0
    attendance_rate_percent: float = 0.0


class ParentFeeCoachContact(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    club_name: Optional[str] = None
    club_phone: Optional[str] = None


class ParentCurrentMonthFee(BaseModel):
    month_key: str
    paid: bool = False
    amount: float = 0.0
    paid_at: Optional[datetime] = None
    due_day: int = 10
    due_date: Optional[str] = None  # YYYY-MM-DD for current month
    last_paid_at: Optional[datetime] = None
    last_paid_month_key: Optional[str] = None


class ParentAthleteProfileResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    birth_year: Optional[int] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    teams: list[str] = Field(default_factory=list)
    fee_coach: ParentFeeCoachContact = Field(default_factory=ParentFeeCoachContact)
    current_month_fee: ParentCurrentMonthFee
    next_event: Optional[ParentScheduleItem] = None
    next_training: Optional[ParentScheduleItem] = None
    next_competition: Optional[ParentScheduleItem] = None
    attendance_summary: ParentAttendanceSummary = Field(default_factory=ParentAttendanceSummary)
    last_attendance: list[ParentAttendanceRow] = Field(default_factory=list)
    schedule_month_key: Optional[str] = None
    monthly_schedule: list[ParentScheduleItem] = Field(default_factory=list)
    monthly_payments: list[ParentPaymentRow] = Field(default_factory=list)
    competitions_this_month: int = 0
    fee_due_day: int = 10
