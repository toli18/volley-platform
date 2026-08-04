from datetime import date, datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class TeamCreate(BaseModel):
    name: str
    age_group: Optional[str] = None
    season: Optional[str] = None
    gender: Literal["male", "female"]
    is_active: bool = True


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    age_group: Optional[str] = None
    season: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    is_active: Optional[bool] = None


class TeamAssignCoach(BaseModel):
    coach_id: int


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    coach_id: int
    club_id: Optional[int] = None
    name: str
    age_group: Optional[str] = None
    season: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class TeamMemberUpdate(BaseModel):
    athlete_ids: list[int] = Field(default_factory=list)


class TeamMemberAthleteRead(BaseModel):
    athlete_id: int
    athlete_name: str
    fee_coach_id: Optional[int] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    athlete_phone: Optional[str] = None
    gender: Optional[str] = None
    is_active: bool = True


class TeamMembersResponse(BaseModel):
    team: TeamRead
    members: list[TeamMemberAthleteRead] = Field(default_factory=list)


class AttendanceItemPayload(BaseModel):
    athlete_id: int
    status: str
    note: Optional[str] = None


class AttendanceSavePayload(BaseModel):
    date: str  # YYYY-MM-DD
    title: Optional[str] = None
    notes: Optional[str] = None
    items: list[AttendanceItemPayload] = Field(default_factory=list)


class AttendanceItemRead(BaseModel):
    athlete_id: int
    athlete_name: str
    status: str
    note: Optional[str] = None
    parent_absence_notice: bool = False
    parent_absence_note: Optional[str] = None


class CoachAbsenceNoticeRead(BaseModel):
    id: int
    notice_date: str
    end_date: Optional[str] = None
    athlete_id: int
    athlete_name: str
    team_id: Optional[int] = None
    team_name: Optional[str] = None
    note: Optional[str] = None
    created_at: datetime


class AttendanceResponse(BaseModel):
    team_id: int
    session_id: Optional[int] = None
    date: str
    title: Optional[str] = None
    notes: Optional[str] = None
    items: list[AttendanceItemRead] = Field(default_factory=list)


class AthleteAttendanceSummary(BaseModel):
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    total: int = 0
    attendance_rate_percent: float = 0.0


class AthletePaymentMini(BaseModel):
    """Ред за такса по месец (платени и неплатени в последните N месеца)."""

    month_key: str
    amount: float = 0
    paid_at: Optional[datetime] = None
    paid: bool = False
    recorded_by_name: Optional[str] = None


class AthleteTimelineEvent(BaseModel):
    """Събитие за история — сортирани по данни descending в API."""

    at: datetime
    kind: str
    label: str
    detail: Optional[str] = None
    actor_name: Optional[str] = None


class AthleteProfileResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    birth_year: Optional[int] = None
    birth_date: Optional[date] = None
    place_of_birth: Optional[str] = None
    nationality: Optional[str] = None
    parent_name: Optional[str] = None
    parent_phone: Optional[str] = None
    athlete_phone: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    egn: Optional[str] = None
    bvf_player_id: Optional[int] = None
    bvf_player_number: Optional[int] = None
    bvf_photo_id: Optional[str] = None
    has_photo: bool = False
    bvf_identity_locked: bool = False
    bvf_ready: bool = False
    bvf_missing: list[str] = Field(default_factory=list)
    sek_task_code: Optional[str] = None
    sek_task_detail: Optional[str] = None
    sek_task_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    teams: list[str] = Field(default_factory=list)
    attendance_summary: AthleteAttendanceSummary
    last_attendance: list[dict] = Field(default_factory=list)
    monthly_payments: list[AthletePaymentMini] = Field(default_factory=list)
    timeline: list[AthleteTimelineEvent] = Field(default_factory=list)


class TeamSheetRequest(BaseModel):
    competition: Optional[str] = None
    venue_city: Optional[str] = None
    age_group: Optional[str] = None
    sheet_date: Optional[str] = None  # DD.MM.YYYY or YYYY-MM-DD
    jersey_color: Optional[str] = None
    head_coach: Optional[str] = None
    assistant_1: Optional[str] = None
    assistant_2: Optional[str] = None
    manager: Optional[str] = None
    athlete_ids: list[int] = Field(default_factory=list)


class TeamAttendanceReportRow(BaseModel):
    athlete_id: int
    athlete_name: str
    present: int = 0
    late: int = 0
    absent: int = 0
    excused: int = 0
    total: int = 0
    attendance_rate_percent: float = 0.0


class TeamAttendanceReportResponse(BaseModel):
    team_id: int
    from_date: str
    to_date: str
    sessions_count: int
    rows: list[TeamAttendanceReportRow] = Field(default_factory=list)


class TeamAttendanceMatrixSession(BaseModel):
    session_id: int
    date: str
    label: str


class TeamAttendanceMatrixAthlete(BaseModel):
    athlete_id: int
    athlete_name: str


class TeamAttendanceMatrixCell(BaseModel):
    athlete_id: int
    session_id: int
    status: Optional[str] = None


class TeamAttendanceMatrixResponse(BaseModel):
    team_id: int
    month_key: str
    from_date: str
    to_date: str
    athletes: list[TeamAttendanceMatrixAthlete] = Field(default_factory=list)
    sessions: list[TeamAttendanceMatrixSession] = Field(default_factory=list)
    cells: list[TeamAttendanceMatrixCell] = Field(default_factory=list)
