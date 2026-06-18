from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.parent_portal import ParentAttendanceSummary, ParentCurrentMonthFee, ParentScheduleItem
from app.schemas.team_portal import TeamPortalItemResponse


class AthleteRoomHomeNotification(BaseModel):
    marker_key: str
    change_type: str
    title: str
    body: str
    target_tab: str
    date_iso: Optional[str] = None
    team_id: Optional[int] = None



class AthleteRoomMeResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    birth_year: Optional[int] = None
    teams: list[str] = Field(default_factory=list)
    club_name: Optional[str] = None
    club_logo_url: Optional[str] = None
    schedule_month_key: str
    week_start: str
    monthly_schedule: list[ParentScheduleItem] = Field(default_factory=list)
    next_training: Optional[ParentScheduleItem] = None
    next_competition: Optional[ParentScheduleItem] = None
    items: list[TeamPortalItemResponse] = Field(default_factory=list)
    attendance_summary: ParentAttendanceSummary = Field(default_factory=ParentAttendanceSummary)
    current_month_fee: ParentCurrentMonthFee
    pending_schedule_dates: list[str] = Field(default_factory=list)
    fee_change_highlight: bool = False
    avatar_url: Optional[str] = None
    chat_unread_count: int = 0
    home_notifications: list[AthleteRoomHomeNotification] = Field(default_factory=list)
