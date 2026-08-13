from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator

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
    carded_team_label: Optional[str] = None
    event_type: str = "training"
    competition_kind: Optional[str] = None
    competition_kind_label: Optional[str] = None
    is_cancelled: bool = False
    highlight_change: bool = False
    change_marker_key: Optional[str] = None
    athlete_participates: bool = False


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
    phone: Optional[str] = None
    club_name: Optional[str] = None
    club_phone: Optional[str] = None


class ParentCardedTeamBadge(BaseModel):
    """Картотечен отбор за сезона (може да са няколко)."""

    label: str
    year: int
    age_group: Optional[str] = None
    sex_label: Optional[str] = None


class ParentTeamFeedItem(TeamPortalItemResponse):
    team_name: Optional[str] = None


class ParentAbsenceNoticeRead(BaseModel):
    id: int
    notice_date: str
    end_date: Optional[str] = None
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class ParentAbsenceNoticeCreate(BaseModel):
    notice_date: str = Field(..., min_length=10, max_length=10)
    end_date: Optional[str] = Field(None, min_length=10, max_length=10)
    team_id: Optional[int] = None
    note: Optional[str] = Field(None, max_length=500)


class ParentMembershipConsentStatus(BaseModel):
    enabled: bool = False
    needs_consent: bool = False
    has_signed: bool = False
    signed_at: Optional[datetime] = None
    consent_id: Optional[int] = None
    club_name: Optional[str] = None


class ParentMembershipConsentForm(BaseModel):
    needs_consent: bool = True
    club_name: str
    club_logo_url: Optional[str] = None
    bvf_logo_url: Optional[str] = None
    addressee: str
    body_text: str
    gdpr_text: str
    fee_amount: int
    fee_due_day: int
    fee_currency: str = "€"
    prefill: dict = Field(default_factory=dict)


class ParentMembershipConsentSignRequest(BaseModel):
    parent_full_name: str = Field(..., min_length=2, max_length=255)
    parent_egn: str = Field(..., min_length=10, max_length=16)
    parent_address: str = Field(..., min_length=3, max_length=500)
    parent_phone: str = Field(..., min_length=6, max_length=50)
    child_first_name: str = Field(..., min_length=3, max_length=25, description="Собствено име")
    child_middle_name: str = Field(..., min_length=3, max_length=25, description="Бащино име")
    child_last_name: str = Field(..., min_length=3, max_length=25, description="Фамилия")
    child_egn: str = Field(..., min_length=10, max_length=16)
    child_place_of_birth: str = Field(
        ..., min_length=2, max_length=25, description="Град на раждане (за СЕК)"
    )
    child_address: Optional[str] = Field(None, max_length=500)
    child_phone: Optional[str] = Field(None, max_length=50)
    gdpr_accepted: bool = False
    signature_name: str = Field(..., min_length=2, max_length=255)

    @field_validator("child_first_name", "child_middle_name", "child_last_name", mode="before")
    @classmethod
    def _strip_child_name(cls, v):
        if v is None:
            raise ValueError("Трите имена на състезателя са задължителни")
        s = str(v).strip()
        if not s:
            raise ValueError("Трите имена на състезателя са задължителни (собствено, бащино и фамилия)")
        return s

    @model_validator(mode="after")
    def _require_three_child_names(self):
        parts = [
            (self.child_first_name or "").strip(),
            (self.child_middle_name or "").strip(),
            (self.child_last_name or "").strip(),
        ]
        if any(len(p) < 3 for p in parts):
            raise ValueError("Всяко от трите имена трябва да е поне 3 символа")
        if any(not any(ch.isalpha() for ch in p) for p in parts):
            raise ValueError("Всяко от трите имена трябва да съдържа букви")
        composed = " ".join(parts)
        if len([t for t in composed.split() if t]) < 3:
            raise ValueError(
                "Трите имена на състезателя са задължителни (собствено, бащино и фамилия)"
            )
        return self


class ParentMembershipConsentSignResponse(BaseModel):
    ok: bool = True
    consent_id: int
    signed_at: datetime
    needs_consent: bool = False


class ParentCardingFormStatus(BaseModel):
    enabled: bool = False
    needs_form: bool = False
    has_signed: bool = False
    season_year: Optional[int] = None
    season_label: Optional[str] = None
    form_kind: Optional[str] = None  # "03" | "03a"
    form_id: Optional[int] = None
    signed_at: Optional[datetime] = None
    club_name: Optional[str] = None


class ParentCardingFormMeta(BaseModel):
    needs_form: bool = True
    form_kind: str
    season_year: int
    season_label: str
    club_name: str
    club_logo_url: Optional[str] = None
    bvf_logo_url: Optional[str] = None
    prefill: dict = Field(default_factory=dict)


class ParentCardingFormSignRequest(BaseModel):
    parent1_full_name: str = Field(..., min_length=2, max_length=255)
    parent1_egn: str = Field(..., min_length=10, max_length=16)
    parent2_full_name: str = Field(..., min_length=2, max_length=255)
    parent2_egn: str = Field(..., min_length=10, max_length=16)
    athlete_first_name: str = Field(..., min_length=3, max_length=25)
    athlete_middle_name: str = Field(..., min_length=3, max_length=25)
    athlete_last_name: str = Field(..., min_length=3, max_length=25)
    athlete_egn: str = Field(..., min_length=10, max_length=16)
    city: Optional[str] = Field(None, max_length=120)
    rules_accepted: bool = False
    signature_parent1: str = Field(..., min_length=2, max_length=255)
    signature_parent2: str = Field(..., min_length=2, max_length=255)
    signature_athlete: Optional[str] = Field(None, max_length=255)
    # data:image/png;base64,... — canvas подпис (родител 1 задължителен; състезател при 03-А)
    signature_parent1_image: str = Field(..., min_length=32)
    signature_athlete_image: Optional[str] = Field(None, min_length=32)


class ParentCardingFormSignResponse(BaseModel):
    ok: bool = True
    form_id: int
    signed_at: datetime
    form_kind: str
    season_year: int
    needs_form: bool = False


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
    club_name: Optional[str] = None
    club_logo_url: Optional[str] = None
    teams: list[str] = Field(default_factory=list)  # тренировъчни групи
    carded_teams: list[ParentCardedTeamBadge] = Field(default_factory=list)
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
    membership_consent: ParentMembershipConsentStatus = Field(default_factory=ParentMembershipConsentStatus)
    carding_form: ParentCardingFormStatus = Field(default_factory=ParentCardingFormStatus)
