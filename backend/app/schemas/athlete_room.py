from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.parent_portal import ParentAttendanceSummary, ParentCurrentMonthFee, ParentScheduleItem
from app.schemas.team_portal import TeamPortalItemResponse


class AthleteRoomMeResponse(BaseModel):
    athlete_id: int
    athlete_name: str
    birth_year: Optional[int] = None
    teams: list[str] = Field(default_factory=list)
    club_name: Optional[str] = None
    schedule_month_key: str
    week_start: str
    monthly_schedule: list[ParentScheduleItem] = Field(default_factory=list)
    next_training: Optional[ParentScheduleItem] = None
    next_competition: Optional[ParentScheduleItem] = None
    items: list[TeamPortalItemResponse] = Field(default_factory=list)
    attendance_summary: ParentAttendanceSummary = Field(default_factory=ParentAttendanceSummary)
    current_month_fee: ParentCurrentMonthFee
    avatar_url: Optional[str] = None
