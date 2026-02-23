from pydantic import BaseModel


class CoachRegistrationsSummary(BaseModel):
    total: int
    day: int
    week: int
    month: int


class ActiveCoachesSummary(BaseModel):
    last_7_days: int
    last_30_days: int


class PendingSummary(BaseModel):
    drills: int
    articles: int


class ApprovalRateSummary(BaseModel):
    approved: int
    rejected: int
    approval_rate_percent: float


class DrillUsageItem(BaseModel):
    drill_id: int
    title: str
    times_used: int


class ForumTopicItem(BaseModel):
    post_id: int
    title: str
    replies_count: int


class ForumTagItem(BaseModel):
    tag: str
    uses: int


class MonthlyCoachRegistrationItem(BaseModel):
    month: str
    count: int


class AdminAnalyticsOverviewResponse(BaseModel):
    coach_registrations: CoachRegistrationsSummary
    active_coaches: ActiveCoachesSummary
    pending: PendingSummary
    approval_rate: ApprovalRateSummary
    top_used_drills: list[DrillUsageItem]
    top_forum_topics: list[ForumTopicItem]
    top_forum_tags: list[ForumTagItem]
    coach_registrations_monthly: list[MonthlyCoachRegistrationItem]

