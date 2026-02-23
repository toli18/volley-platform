from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Article,
    ArticleStatus,
    Drill,
    ForumPost,
    ForumReply,
    Training,
    User,
    UserRole,
)
from app.schemas.admin_analytics import (
    ActiveCoachesSummary,
    AdminAnalyticsOverviewResponse,
    ApprovalRateSummary,
    CoachRegistrationsSummary,
    DrillUsageItem,
    ForumTagItem,
    ForumTopicItem,
    MonthlyCoachRegistrationItem,
    PendingSummary,
)

router = APIRouter(tags=["Admin Analytics"])


def _extract_plan_drill_ids(plan: dict | None) -> list[int]:
    if not isinstance(plan, dict):
        return []
    out: list[int] = []
    for arr in plan.values():
        if not isinstance(arr, list):
            continue
        for value in arr:
            try:
                out.append(int(value))
            except Exception:
                continue
    return out


@router.get("/admin/analytics/overview", response_model=AdminAnalyticsOverviewResponse)
def admin_analytics_overview(
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    now = datetime.utcnow()
    start_now = now - timedelta(minutes=60)
    start_24h = now - timedelta(hours=24)
    start_day = datetime(now.year, now.month, now.day)
    start_week = now - timedelta(days=7)
    start_month = now - timedelta(days=30)

    coach_ids = {
        row[0]
        for row in db.query(User.id).filter(User.role == UserRole.coach).all()
    }
    total_coaches = len(coach_ids)

    reg_day = db.query(func.count(User.id)).filter(User.role == UserRole.coach, User.created_at >= start_day).scalar() or 0
    reg_week = db.query(func.count(User.id)).filter(User.role == UserRole.coach, User.created_at >= start_week).scalar() or 0
    reg_month = db.query(func.count(User.id)).filter(User.role == UserRole.coach, User.created_at >= start_month).scalar() or 0

    def _active_ids_since(since: datetime) -> set[int]:
        ids = set()
        ids.update(
            row[0]
            for row in db.query(Training.coach_id)
            .filter(Training.created_at >= since)
            .distinct()
            .all()
        )
        ids.update(
            row[0]
            for row in db.query(Article.author_id)
            .filter(Article.created_at >= since)
            .distinct()
            .all()
        )
        ids.update(
            row[0]
            for row in db.query(ForumPost.author_id)
            .filter(ForumPost.created_at >= since)
            .distinct()
            .all()
        )
        ids.update(
            row[0]
            for row in db.query(ForumReply.author_id)
            .filter(ForumReply.created_at >= since)
            .distinct()
            .all()
        )
        return {coach_id for coach_id in ids if coach_id in coach_ids}

    active_7 = len(_active_ids_since(start_week))
    active_30 = len(_active_ids_since(start_month))
    active_now_ids = _active_ids_since(start_now)
    active_24h = len(_active_ids_since(start_24h))
    active_now_names = []
    if active_now_ids:
        active_now_names = sorted(
            row[0] or f"Треньор #{row[1]}"
            for row in db.query(User.name, User.id)
            .filter(User.id.in_(active_now_ids))
            .all()
        )

    pending_drills = db.query(func.count(Drill.id)).filter(Drill.status == "pending").scalar() or 0
    pending_articles = db.query(func.count(Article.id)).filter(Article.status == ArticleStatus.PENDING).scalar() or 0

    drill_approved = db.query(func.count(Drill.id)).filter(Drill.status == "approved").scalar() or 0
    drill_rejected = db.query(func.count(Drill.id)).filter(Drill.status == "rejected").scalar() or 0
    article_approved = db.query(func.count(Article.id)).filter(Article.status == ArticleStatus.APPROVED).scalar() or 0
    article_rejected = db.query(func.count(Article.id)).filter(Article.status == ArticleStatus.REJECTED).scalar() or 0
    approved_total = drill_approved + article_approved
    rejected_total = drill_rejected + article_rejected
    decided_total = approved_total + rejected_total
    approval_rate = (approved_total / decided_total * 100.0) if decided_total > 0 else 0.0

    drill_usage_counter: Counter[int] = Counter()
    for plan in (row[0] for row in db.query(Training.plan).all()):
        drill_usage_counter.update(_extract_plan_drill_ids(plan))

    top_drill_ids = [drill_id for drill_id, _ in drill_usage_counter.most_common(5)]
    drill_titles = {
        row.id: (row.title or f"Упражнение #{row.id}")
        for row in db.query(Drill).filter(Drill.id.in_(top_drill_ids)).all()
    } if top_drill_ids else {}
    top_used_drills = [
        DrillUsageItem(
            drill_id=drill_id,
            title=drill_titles.get(drill_id, f"Упражнение #{drill_id}"),
            times_used=count,
        )
        for drill_id, count in drill_usage_counter.most_common(5)
    ]

    topic_rows = (
        db.query(
            ForumPost.id,
            ForumPost.title,
            func.count(ForumReply.id).label("replies_count"),
        )
        .outerjoin(ForumReply, ForumReply.post_id == ForumPost.id)
        .group_by(ForumPost.id)
        .order_by(desc("replies_count"), desc(ForumPost.created_at))
        .limit(5)
        .all()
    )
    top_forum_topics = [
        ForumTopicItem(
            post_id=row.id,
            title=row.title or f"Тема #{row.id}",
            replies_count=int(row.replies_count or 0),
        )
        for row in topic_rows
    ]

    tag_counter: Counter[str] = Counter()
    for tags in (row[0] for row in db.query(ForumPost.tags).all()):
        if not isinstance(tags, list):
            continue
        for tag in tags:
            normalized = str(tag or "").strip().lower()
            if normalized:
                tag_counter[normalized] += 1
    top_forum_tags = [
        ForumTagItem(tag=tag, uses=uses)
        for tag, uses in tag_counter.most_common(8)
    ]

    monthly = []
    for i in range(5, -1, -1):
        pivot = datetime(now.year, now.month, 1) - timedelta(days=31 * i)
        month_start = datetime(pivot.year, pivot.month, 1)
        if pivot.month == 12:
            next_month = datetime(pivot.year + 1, 1, 1)
        else:
            next_month = datetime(pivot.year, pivot.month + 1, 1)
        count = (
            db.query(func.count(User.id))
            .filter(
                User.role == UserRole.coach,
                User.created_at >= month_start,
                User.created_at < next_month,
            )
            .scalar()
            or 0
        )
        monthly.append(
            MonthlyCoachRegistrationItem(
                month=month_start.strftime("%Y-%m"),
                count=int(count),
            )
        )

    return AdminAnalyticsOverviewResponse(
        coach_registrations=CoachRegistrationsSummary(
            total=total_coaches,
            day=int(reg_day),
            week=int(reg_week),
            month=int(reg_month),
        ),
        active_coaches=ActiveCoachesSummary(
            now_names=active_now_names,
            last_24_hours=int(active_24h),
            last_7_days=int(active_7),
            last_30_days=int(active_30),
        ),
        pending=PendingSummary(
            drills=int(pending_drills),
            articles=int(pending_articles),
        ),
        approval_rate=ApprovalRateSummary(
            approved=int(approved_total),
            rejected=int(rejected_total),
            approval_rate_percent=round(approval_rate, 2),
        ),
        top_used_drills=top_used_drills,
        top_forum_topics=top_forum_topics,
        top_forum_tags=top_forum_tags,
        coach_registrations_monthly=monthly,
    )

