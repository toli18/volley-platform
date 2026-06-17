from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.team_portal import TeamPortalItemResponse


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


class ParentLoginRequest(BaseModel):
    parent_phone: str = Field(..., min_length=6, max_length=32)
    birth_year: int = Field(..., ge=1990, le=2025, description="Year of birth (PIN)")
    athlete_id: Optional[int] = None


class ParentLoginCandidate(BaseModel):
    athlete_id: int
    athlete_name: str
    teams: list[str] = Field(default_factory=list)
    birth_year: Optional[int] = None


class ParentLoginResponse(BaseModel):
    access_token: Optional[str] = None
    needs_selection: bool = False
    candidates: list[ParentLoginCandidate] = Field(default_factory=list)


class ParentPushVapidResponse(BaseModel):
    public_key: str
    configured: bool = True


class ParentPushKeys(BaseModel):
    p256dh: str
    auth: str


class ParentPushSubscribeRequest(BaseModel):
    endpoint: str = Field(..., min_length=8)
    keys: ParentPushKeys


class ParentPushStatusResponse(BaseModel):
    subscribed: bool = False
    push_available: bool = False


class ParentPushTestResponse(BaseModel):
    sent: int = 0
    subscriptions: int = 0
    configured: bool = False
    errors: list[str] = Field(default_factory=list)


class ParentScheduleItem(BaseModel):
    date: str
    start_time: str
    end_time: str
    location: str
    team_name: Optional[str] = None
    event_type: str = "training"
    competition_kind: Optional[str] = None
    competition_kind_label: Optional[str] = None
    is_cancelled: bool = False
    highlight_change: bool = False
    change_marker_key: Optional[str] = None


class ParentPortalAckBody(BaseModel):
    marker_key: Optional[str] = None
    date: Optional[str] = None
    scope: Optional[str] = None  # fee | all


class ParentPaymentRow(BaseModel):
    month_key: str
    amount: float = 0
    paid: bool = False
    paid_at: Optional[datetime] = None


class ParentAttendanceRow(BaseModel):
    date: str
    team_name: Optional[str] = None
    team_id: Optional[int] = None
    status: str
    is_cancelled: bool = False


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


class ParentTeamFeedItem(TeamPortalItemResponse):
    team_name: Optional[str] = None


class ParentAbsenceNoticeRead(BaseModel):
    id: int
    notice_date: str
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class ParentAbsenceNoticeCreate(BaseModel):
    notice_date: str = Field(..., min_length=10, max_length=10)
    team_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)


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
    pending_schedule_dates: list[str] = Field(default_factory=list)
    fee_change_highlight: bool = False
    team_feed: list[ParentTeamFeedItem] = Field(default_factory=list)
    absence_notices: list[ParentAbsenceNoticeRead] = Field(default_factory=list)
