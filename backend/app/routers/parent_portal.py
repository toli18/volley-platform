from __future__ import annotations

import hashlib
import logging
from datetime import date, datetime, timedelta

import re

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.database import get_db
from app.dependencies.parent_auth import get_current_parent_athlete
from app.models import (
    Athlete,
    AthleteCardingForm,
    AthleteClubConsent,
    AthleteParentAccessToken,
    AthletePayment,
    AttendanceRecord,
    BvfCardIndex,
    BvfCardIndexMember,
    BvfSeasonApplication,
    Club,
    ParentAbsenceNotice,
    ParentPushSubscription,
    Team,
    TeamMember,
    TeamPortalItem,
    TeamSession,
    TrainingScheduleException,
    TrainingScheduleRule,
    User,
)
from app.routers.team_portal import _item_to_response
from app.schemas.parent_portal import (
    ParentAbsenceNoticeCreate,
    ParentAbsenceNoticeRead,
    ParentAthleteProfileResponse,
    ParentAttendanceRow,
    ParentAttendanceSummary,
    ParentCardedTeamBadge,
    ParentCardingFormMeta,
    ParentCardingFormSignRequest,
    ParentCardingFormSignResponse,
    ParentCardingFormStatus,
    ParentCurrentMonthFee,
    ParentFeeCoachContact,
    ParentMembershipConsentForm,
    ParentMembershipConsentSignRequest,
    ParentMembershipConsentSignResponse,
    ParentMembershipConsentStatus,
    ParentPaymentRow,
    ParentPushStatusResponse,
    ParentPushSubscribeRequest,
    ParentPushTestResponse,
    ParentPortalAckBody,
    ParentPushVapidResponse,
    ParentScheduleItem,
    ParentTeamFeedItem,
)
from app.schemas.assessment import ParentDevelopmentOut
from app.services.assessment_consent import build_parent_development
from app.services.athlete_identity import (
    apply_birth_date_from_egn,
    default_nationality_from_city,
    require_three_athlete_names,
)
from app.services.club_membership_consent import (
    athlete_needs_membership_consent,
    club_consent_feature_enabled,
    deactivate_expired_or_prior_consents,
    get_active_consent,
    persist_consent_pdf,
    read_consent_pdf,
    resolve_club_consent_template,
)
from app.services.carding_form import (
    FORM_KIND_03A,
    athlete_needs_carding_form,
    deactivate_prior_carding_forms,
    form_kind_for_athlete,
    get_signed_carding_form,
    open_carding_season_year,
    persist_carding_form_pdf,
    prefill_carding_form,
    read_carding_form_pdf,
    save_carding_signature_png,
    season_label,
)
from app.services.parent_portal_notify import (
    clear_fee_markers_for_athlete,
    clear_marker_for_athlete,
    clear_markers_for_athlete,
    clear_schedule_markers_for_date,
    get_pending_highlights,
    get_pending_marker_state,
)
from app.services.parent_push import (
    PORTAL_PARENT,
    delete_subscription_for_athlete,
    push_configured,
    send_test_notification,
    upsert_subscription,
)
from app.settings import settings

router = APIRouter()

# Day of month when monthly fee is due (shown in parent portal).
PARENT_FEE_DUE_DAY = 10


def _schedule_text(value: str | None, fallback: str = "") -> str:
    return str(value).strip() if value is not None else fallback


def _month_key_now() -> str:
    return date.today().strftime("%Y-%m")


def _month_window(count: int = 12) -> list[str]:
    out = []
    d = date.today().replace(day=1)
    for _ in range(count):
        out.append(d.strftime("%Y-%m"))
        d = (d - timedelta(days=1)).replace(day=1)
    return out


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _month_last_day(month_key: str) -> str:
    y, m = [int(x) for x in month_key.split("-")]
    last = date(y, m, 1).replace(day=28) + timedelta(days=4)
    last = (last - timedelta(days=last.day)).day
    return f"{month_key}-{str(last).zfill(2)}"


def _build_schedule_for_teams(
    db: Session,
    team_ids: list[int],
    from_date: str,
    to_date: str,
    *,
    athlete: Athlete | None = None,
    scope: str = "child",
) -> list[ParentScheduleItem]:
    """scope=child: trainings + matches of groups + SEK carded teams.
    scope=club_matches: all club competitions (groups + carded) in one list.
    """
    from app.competition_kinds import competition_kind_label
    from app.models import ClubCompetitionEvent
    from sqlalchemy import or_

    scope_norm = (scope or "child").strip().lower()
    if scope_norm not in {"child", "club_matches"}:
        scope_norm = "child"

    schedule_items: list[ParentScheduleItem] = []
    card_indexes = _card_indexes_for_athlete(db, athlete) if athlete else []
    card_index_ids = [int(ci.id) for ci in card_indexes]
    card_label_by_id = {int(ci.id): _card_index_display_label(ci) for ci in card_indexes}

    team_name_map: dict[int, str] = {}
    team_by_id: dict[int, Team] = {}
    if team_ids:
        for t in db.query(Team).filter(Team.id.in_(team_ids)).all():
            team_by_id[int(t.id)] = t
            team_name_map[int(t.id)] = t.name

    if scope_norm == "child" and team_ids:
        rules = (
            db.query(TrainingScheduleRule)
            .filter(
                TrainingScheduleRule.team_id.in_(team_ids),
                TrainingScheduleRule.is_active.is_(True),
                TrainingScheduleRule.effective_from <= to_date,
                (TrainingScheduleRule.effective_to.is_(None)) | (TrainingScheduleRule.effective_to >= from_date),
            )
            .all()
        )
        rule_ids = [r.id for r in rules]
        exc_map = {}
        if rule_ids:
            exc_rows = (
                db.query(TrainingScheduleException)
                .filter(
                    TrainingScheduleException.rule_id.in_(rule_ids),
                    TrainingScheduleException.date >= from_date,
                    TrainingScheduleException.date <= to_date,
                )
                .all()
            )
            exc_map = {(e.rule_id, e.date): e for e in exc_rows}
        d0 = datetime.strptime(from_date, "%Y-%m-%d").date()
        d1 = datetime.strptime(to_date, "%Y-%m-%d").date()
        days = (d1 - d0).days
        for i in range(days + 1):
            cur = d0 + timedelta(days=i)
            cur_s = cur.isoformat()
            for r in rules or []:
                if int(r.weekday) != cur.weekday():
                    continue
                if r.effective_from > cur_s:
                    continue
                if r.effective_to and r.effective_to < cur_s:
                    continue
                exc = exc_map.get((r.id, cur_s))
                if exc and exc.kind == "cancelled":
                    schedule_items.append(
                        ParentScheduleItem(
                            date=cur_s,
                            start_time=_schedule_text(r.start_time, "00:00"),
                            end_time=_schedule_text(r.end_time, "00:00"),
                            location=_schedule_text(r.location),
                            team_name=team_name_map.get(int(r.team_id)),
                            event_type="training",
                            is_cancelled=True,
                            change_marker_key=f"exc:{exc.id}",
                            athlete_participates=True,
                        )
                    )
                    continue
                location = exc.location if exc and exc.kind == "override" and exc.location else r.location
                start_t = exc.start_time if exc and exc.kind == "override" and exc.start_time else r.start_time
                end_t = exc.end_time if exc and exc.kind == "override" and exc.end_time else r.end_time
                marker_key = f"exc:{exc.id}" if exc else (f"rule:{r.id}" if cur_s == r.effective_from else None)
                schedule_items.append(
                    ParentScheduleItem(
                        date=cur_s,
                        start_time=_schedule_text(start_t, "00:00"),
                        end_time=_schedule_text(end_t, "00:00"),
                        location=_schedule_text(location),
                        team_name=team_name_map.get(int(r.team_id)),
                        event_type="training",
                        is_cancelled=False,
                        change_marker_key=marker_key,
                        athlete_participates=True,
                    )
                )

    club_id = int(athlete.club_id) if athlete and athlete.club_id else None
    if not club_id and team_ids:
        club_id = db.query(Team.club_id).filter(Team.id == int(team_ids[0])).scalar()

    try:
        if scope_norm == "club_matches":
            if not club_id:
                comp_rows = []
            else:
                comp_rows = (
                    db.query(ClubCompetitionEvent)
                    .filter(
                        ClubCompetitionEvent.club_id == int(club_id),
                        ClubCompetitionEvent.is_cancelled.is_(False),
                        ClubCompetitionEvent.date >= from_date,
                        ClubCompetitionEvent.date <= to_date,
                    )
                    .all()
                )
        else:
            if not team_ids and not card_index_ids:
                comp_rows = []
            else:
                filters = []
                if team_ids:
                    filters.append(ClubCompetitionEvent.team_id.in_(team_ids))
                if card_index_ids:
                    filters.append(ClubCompetitionEvent.card_index_id.in_(card_index_ids))
                comp_rows = (
                    db.query(ClubCompetitionEvent)
                    .filter(
                        or_(*filters),
                        ClubCompetitionEvent.is_cancelled.is_(False),
                        ClubCompetitionEvent.date >= from_date,
                        ClubCompetitionEvent.date <= to_date,
                    )
                    .all()
                )
    except SQLAlchemyError as exc:
        logger.warning("Competition schedule query failed: %s", exc)
        try:
            db.rollback()
        except Exception:
            pass
        comp_rows = []

    extra_team_ids = {int(e.team_id) for e in comp_rows} - set(team_name_map.keys())
    if extra_team_ids:
        for t in db.query(Team).filter(Team.id.in_(list(extra_team_ids))).all():
            team_by_id[int(t.id)] = t
            team_name_map[int(t.id)] = t.name

    missing_ci = {
        int(e.card_index_id)
        for e in comp_rows
        if getattr(e, "card_index_id", None) and int(e.card_index_id) not in card_label_by_id
    }
    if missing_ci:
        for ci in db.query(BvfCardIndex).filter(BvfCardIndex.id.in_(list(missing_ci))).all():
            card_label_by_id[int(ci.id)] = _card_index_display_label(ci)

    athlete_team_set = set(int(x) for x in team_ids)
    athlete_ci_set = set(card_index_ids)

    # Потвърдени тимови листове: кой мач включва това дете
    from app.models import CompetitionRosterAthlete

    roster_comp_ids: set[int] = set()
    if athlete is not None:
        try:
            roster_comp_ids = {
                int(r[0])
                for r in db.query(CompetitionRosterAthlete.competition_id)
                .filter(CompetitionRosterAthlete.athlete_id == int(athlete.id))
                .all()
            }
        except SQLAlchemyError as exc:
            logger.warning("Competition roster lookup failed: %s", exc)
            try:
                db.rollback()
            except Exception:
                pass
            roster_comp_ids = set()

    for e in comp_rows:
        kind = str(e.competition_kind or "friendly")
        tid = int(e.team_id)
        team = team_by_id.get(tid)
        ci_id = int(e.card_index_id) if getattr(e, "card_index_id", None) else None
        carded_label = card_label_by_id.get(ci_id) if ci_id else None
        if not carded_label and scope_norm == "child":
            carded_label = _guess_carded_label_for_team(team, card_indexes)

        roster_status = str(getattr(e, "roster_status", None) or "pending").strip().lower()
        on_roster = int(e.id) in roster_comp_ids
        # Моето дете: мачът се показва само ако е в потвърден/заключен състав.
        # Клубен календар: всички мачове; „Участва“ = в тимовия лист.
        if scope_norm == "child":
            if roster_status not in {"confirmed", "locked"} or not on_roster:
                continue
            participates = True
        else:
            participates = on_roster and roster_status in {"confirmed", "locked"}

        schedule_items.append(
            ParentScheduleItem(
                date=_schedule_text(e.date),
                start_time=_schedule_text(e.start_time, "00:00"),
                end_time=_schedule_text(e.end_time, "00:00"),
                location=_schedule_text(e.location),
                team_name=team_name_map.get(tid),
                carded_team_label=carded_label,
                event_type="competition",
                competition_kind=kind,
                competition_kind_label=competition_kind_label(kind),
                change_marker_key=f"comp:{e.id}",
                athlete_participates=participates,
            )
        )

    schedule_items.sort(key=lambda x: (x.date, x.start_time or ""))
    return schedule_items



def _is_upcoming_schedule_item(item: ParentScheduleItem, today_s: str, now_t: str) -> bool:
    if item.date > today_s:
        return True
    return item.date == today_s and (item.start_time or "") >= now_t


def _pick_next_by_kind(items: list[ParentScheduleItem], *, competition: bool) -> ParentScheduleItem | None:
    today_s = date.today().isoformat()
    now_t = datetime.utcnow().strftime("%H:%M")
    for item in items:
        is_comp = (item.event_type or "training") == "competition"
        if competition and not is_comp:
            continue
        if not competition and is_comp:
            continue
        if _is_upcoming_schedule_item(item, today_s, now_t):
            return item
    return None


def _count_competitions_in_month(items: list[ParentScheduleItem], month_key: str) -> int:
    prefix = f"{month_key}-"
    return sum(1 for i in items if (i.event_type or "training") == "competition" and i.date.startswith(prefix))


def _last_payment(pay_map: dict[str, AthletePayment]) -> tuple[AthletePayment | None, str | None]:
    if not pay_map:
        return None, None
    best_key = max(pay_map.keys())
    row = pay_map[best_key]
    return row, best_key


def _fee_due_date_iso(month_key: str, due_day: int = PARENT_FEE_DUE_DAY) -> str:
    y, m = [int(x) for x in month_key.split("-")]
    last_dom = _month_last_day(month_key)
    last_day = int(last_dom.split("-")[2])
    day = min(max(1, due_day), last_day)
    return f"{month_key}-{str(day).zfill(2)}"


def _pick_next_event(items: list[ParentScheduleItem]) -> ParentScheduleItem | None:
    """Earliest upcoming item of any kind (legacy compat)."""
    today_s = date.today().isoformat()
    now_t = datetime.utcnow().strftime("%H:%M")
    for item in items:
        if _is_upcoming_schedule_item(item, today_s, now_t):
            return item
    return None


def _cancelled_training_keys(
    db: Session, team_ids: list[int], from_date: str, to_date: str
) -> set[tuple[str, int]]:
    if not team_ids:
        return set()
    rows = (
        db.query(TrainingScheduleException.date, TrainingScheduleRule.team_id)
        .join(TrainingScheduleRule, TrainingScheduleRule.id == TrainingScheduleException.rule_id)
        .filter(
            TrainingScheduleRule.team_id.in_(team_ids),
            TrainingScheduleException.kind == "cancelled",
            TrainingScheduleException.date >= from_date,
            TrainingScheduleException.date <= to_date,
        )
        .all()
    )
    return {(str(d), int(tid)) for d, tid in rows}


def _build_parent_attendance_list(
    db: Session,
    athlete_id: int,
    team_ids: list[int],
    from_date: str,
    to_date: str,
) -> list[ParentAttendanceRow]:
    cancelled_keys = _cancelled_training_keys(db, team_ids, from_date, to_date)
    attendance_rows = (
        db.query(AttendanceRecord.status, TeamSession.date, Team.name, Team.id)
        .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
        .join(Team, Team.id == TeamSession.team_id)
        .filter(AttendanceRecord.athlete_id == athlete_id, TeamSession.date >= from_date, TeamSession.date <= to_date)
        .order_by(TeamSession.date.desc())
        .limit(120)
        .all()
    )
    covered: set[tuple[str, int]] = set()
    items: list[ParentAttendanceRow] = []
    for status, day, team_name, team_id in attendance_rows:
        key = (str(day), int(team_id))
        covered.add(key)
        is_cancelled = key in cancelled_keys
        items.append(
            ParentAttendanceRow(
                status="cancelled" if is_cancelled else (status or "present"),
                date=str(day),
                team_name=team_name,
                team_id=int(team_id),
                is_cancelled=is_cancelled,
            )
        )

    if cancelled_keys:
        team_name_map = dict(db.query(Team.id, Team.name).filter(Team.id.in_(team_ids)).all())
        for day_s, tid in sorted(cancelled_keys, key=lambda x: x[0], reverse=True):
            key = (day_s, tid)
            if key in covered:
                continue
            items.append(
                ParentAttendanceRow(
                    status="cancelled",
                    date=day_s,
                    team_name=team_name_map.get(tid),
                    team_id=tid,
                    is_cancelled=True,
                )
            )

    items.sort(key=lambda x: x.date, reverse=True)
    return items


def _attendance_summary_from_rows(rows: list[ParentAttendanceRow]) -> ParentAttendanceSummary:
    active = [r for r in rows if not r.is_cancelled]
    present = sum(1 for r in active if r.status == "present")
    late = sum(1 for r in active if r.status == "late")
    absent = sum(1 for r in active if r.status == "absent")
    excused = sum(1 for r in active if r.status == "excused")
    total = len(active)
    rate = round(((present + late) / total) * 100.0, 1) if total else 0.0
    return ParentAttendanceSummary(
        present=present,
        late=late,
        absent=absent,
        excused=excused,
        total=total,
        attendance_rate_percent=rate,
    )


_MONTH_KEY_RE = re.compile(r"^\d{4}-\d{2}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _resolve_parent_portal_athlete(db: Session, token: str) -> Athlete:
    row = (
        db.query(AthleteParentAccessToken)
        .filter(AthleteParentAccessToken.token_hash == _token_hash(token), AthleteParentAccessToken.is_active.is_(True))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Invalid parent access link")
    if row.expires_at and row.expires_at < datetime.utcnow():
        row.is_active = False
        db.commit()
        raise HTTPException(status_code=410, detail="Parent access link expired")

    athlete = db.query(Athlete).filter(Athlete.id == row.athlete_id).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    row.last_used_at = datetime.utcnow()
    db.commit()
    return athlete


def _team_ids_for_athlete(db: Session, athlete_id: int) -> list[int]:
    return [
        tm.team_id
        for tm in db.query(TeamMember).filter(TeamMember.athlete_id == athlete_id, TeamMember.is_active.is_(True)).all()
    ]


def _card_indexes_for_athlete(db: Session, athlete: Athlete) -> list[BvfCardIndex]:
    if not athlete or not athlete.club_id:
        return []
    club_id = int(athlete.club_id)
    year = int(datetime.utcnow().year)
    open_app = (
        db.query(BvfSeasonApplication)
        .filter(
            BvfSeasonApplication.club_id == club_id,
            BvfSeasonApplication.status == "open",
        )
        .order_by(BvfSeasonApplication.year.desc())
        .first()
    )
    if open_app:
        year = int(open_app.year)
    return (
        db.query(BvfCardIndex)
        .join(BvfCardIndexMember, BvfCardIndexMember.card_index_id == BvfCardIndex.id)
        .filter(
            BvfCardIndex.club_id == club_id,
            BvfCardIndex.year == year,
            BvfCardIndexMember.athlete_id == int(athlete.id),
        )
        .order_by(BvfCardIndex.age.asc(), BvfCardIndex.sex.asc())
        .all()
    )


def _card_index_display_label(ci: BvfCardIndex) -> str:
    from app.services.bvf_season_carding import card_index_display_label

    return card_index_display_label(ci)


def _carded_teams_for_athlete(db: Session, athlete: Athlete) -> list[ParentCardedTeamBadge]:
    """Картотечни отбори за текущия (или отворения) сезон — може да са повече от един."""
    out: list[ParentCardedTeamBadge] = []
    for ci in _card_indexes_for_athlete(db, athlete):
        label = _card_index_display_label(ci)
        age_lbl = (ci.age_group or "").strip() or label.split(" · ")[0]
        sex_lbl = "Жени" if int(ci.sex or 0) == 1 else "Мъже"
        out.append(
            ParentCardedTeamBadge(
                label=label,
                year=int(ci.year),
                age_group=age_lbl,
                sex_label=sex_lbl,
            )
        )
    return out


def _guess_carded_label_for_team(
    team: Team | None,
    card_indexes: list[BvfCardIndex],
) -> str | None:
    if not card_indexes:
        return None
    if len(card_indexes) == 1:
        return _card_index_display_label(card_indexes[0])
    if not team:
        return None
    gender = (team.gender or "").strip().lower()
    want_sex = 0 if gender == "male" else 1 if gender == "female" else None
    if want_sex is None:
        return None
    matched = [ci for ci in card_indexes if int(ci.sex or 0) == want_sex]
    if not matched:
        return None
    return _card_index_display_label(matched[0])


def _validate_notice_date(raw: str, *, field: str = "notice_date") -> str:
    value = (raw or "").strip()
    if not _DATE_RE.match(value):
        raise HTTPException(status_code=422, detail=f"{field} must be YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {field}") from exc
    if parsed < date.today():
        raise HTTPException(status_code=422, detail=f"{field} must be today or in the future")
    return value


def _absence_end_date(notice: ParentAbsenceNotice) -> str:
    return (getattr(notice, "end_date", None) or notice.notice_date or "").strip() or notice.notice_date


def _team_feed_for_parent(db: Session, team_ids: list[int], limit: int = 5) -> list[ParentTeamFeedItem]:
    if not team_ids:
        return []
    rows = (
        db.query(TeamPortalItem, Team.name)
        .join(Team, Team.id == TeamPortalItem.team_id)
        .filter(TeamPortalItem.team_id.in_(team_ids))
        .order_by(TeamPortalItem.created_at.desc())
        .limit(limit)
        .all()
    )
    out: list[ParentTeamFeedItem] = []
    for item, team_name in rows:
        base = _item_to_response(item)
        out.append(ParentTeamFeedItem(**base.model_dump(), team_name=team_name))
    return out


def _active_absence_notices(db: Session, athlete_id: int) -> list[ParentAbsenceNoticeRead]:
    today_s = date.today().isoformat()
    rows = (
        db.query(ParentAbsenceNotice, Team.name)
        .outerjoin(Team, Team.id == ParentAbsenceNotice.team_id)
        .filter(
            ParentAbsenceNotice.athlete_id == athlete_id,
            ParentAbsenceNotice.cancelled_at.is_(None),
        )
        .order_by(ParentAbsenceNotice.notice_date.asc())
        .all()
    )
    out: list[ParentAbsenceNoticeRead] = []
    for notice, team_name in rows:
        end_s = _absence_end_date(notice)
        if end_s < today_s:
            continue
        out.append(
            ParentAbsenceNoticeRead(
                id=notice.id,
                notice_date=notice.notice_date,
                end_date=end_s,
                team_id=notice.team_id,
                team_name=team_name,
                note=notice.note,
                created_at=notice.created_at,
            )
        )
    return out


def _create_absence_notice(db: Session, athlete: Athlete, body: ParentAbsenceNoticeCreate) -> ParentAbsenceNoticeRead:
    notice_date = _validate_notice_date(body.notice_date, field="notice_date")
    end_raw = (body.end_date or "").strip() or notice_date
    end_date = _validate_notice_date(end_raw, field="end_date")
    if end_date < notice_date:
        raise HTTPException(status_code=422, detail="end_date must be on or after notice_date")

    team_ids = _team_ids_for_athlete(db, athlete.id)
    if body.team_id is not None and body.team_id not in team_ids:
        raise HTTPException(status_code=422, detail="Invalid team for athlete")

    # Overlap with an active notice for the same athlete (/optional team)
    existing = (
        db.query(ParentAbsenceNotice)
        .filter(
            ParentAbsenceNotice.athlete_id == athlete.id,
            ParentAbsenceNotice.cancelled_at.is_(None),
        )
        .all()
    )
    for row in existing:
        if body.team_id is not None and row.team_id is not None and int(row.team_id) != int(body.team_id):
            continue
        row_end = _absence_end_date(row)
        if notice_date <= row_end and end_date >= row.notice_date:
            raise HTTPException(status_code=409, detail="Absence notice already overlaps this period")

    row = ParentAbsenceNotice(
        athlete_id=athlete.id,
        team_id=body.team_id,
        notice_date=notice_date,
        end_date=end_date,
        note=(body.note or "").strip() or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    team_name = None
    if row.team_id:
        team_row = db.query(Team.name).filter(Team.id == row.team_id).first()
        team_name = team_row[0] if team_row else None
    return ParentAbsenceNoticeRead(
        id=row.id,
        notice_date=row.notice_date,
        end_date=_absence_end_date(row),
        team_id=row.team_id,
        team_name=team_name,
        note=row.note,
        created_at=row.created_at,
    )


def _cancel_absence_notice(db: Session, athlete_id: int, notice_id: int) -> None:
    row = (
        db.query(ParentAbsenceNotice)
        .filter(
            ParentAbsenceNotice.id == notice_id,
            ParentAbsenceNotice.athlete_id == athlete_id,
            ParentAbsenceNotice.cancelled_at.is_(None),
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Absence notice not found")
    row.cancelled_at = datetime.utcnow()
    db.commit()


def _item_has_highlight(item: ParentScheduleItem, marker_keys: set[str], pending_dates: set[str]) -> bool:
    if item.change_marker_key and item.change_marker_key in marker_keys:
        return True
    return item.date in pending_dates


def _apply_schedule_highlights(db: Session, athlete_id: int, items: list[ParentScheduleItem]) -> list[ParentScheduleItem]:
    try:
        marker_keys, pending_dates, _ = get_pending_marker_state(db, athlete_id)
    except SQLAlchemyError as exc:
        logger.warning("Pending marker state failed for athlete %s: %s", athlete_id, exc)
        marker_keys, pending_dates = set(), []
    date_set = set(pending_dates)
    out: list[ParentScheduleItem] = []
    for item in items:
        highlighted = _item_has_highlight(item, marker_keys, date_set)
        if hasattr(item, "model_copy"):
            out.append(item.model_copy(update={"highlight_change": highlighted}))
        else:
            item.highlight_change = highlighted
            out.append(item)
    return out


def _apply_ack_body(db: Session, athlete_id: int, body: ParentPortalAckBody) -> None:
    scope = (body.scope or "").strip().lower()
    if scope == "all":
        clear_markers_for_athlete(db, athlete_id)
        return
    if scope == "fee":
        clear_fee_markers_for_athlete(db, athlete_id)
        return
    marker_key = (body.marker_key or "").strip()
    if marker_key:
        clear_marker_for_athlete(db, athlete_id, marker_key)
        return
    date_iso = (body.date or "").strip()
    if date_iso:
        clear_schedule_markers_for_date(db, athlete_id, date_iso)
        return
    raise HTTPException(status_code=422, detail="Provide marker_key, date, or scope (fee|all).")


def _build_parent_athlete_profile(db: Session, athlete: Athlete) -> ParentAthleteProfileResponse:
    team_rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete.id, TeamMember.is_active.is_(True))
        .all()
    )
    teams = [x[0] for x in team_rows]
    carded_teams = _carded_teams_for_athlete(db, athlete)

    team_ids = _team_ids_for_athlete(db, athlete.id)
    today_s = date.today().isoformat()
    attendance_since = (date.today() - timedelta(days=90)).isoformat()
    attendance_to = (date.today() + timedelta(days=14)).isoformat()
    last_attendance = _build_parent_attendance_list(db, athlete.id, team_ids, attendance_since, attendance_to)
    attendance_summary = _attendance_summary_from_rows([r for r in last_attendance if r.date <= today_s])

    mk = _month_window(12)
    pay_rows = db.query(AthletePayment).filter(AthletePayment.athlete_id == athlete.id, AthletePayment.month_key.in_(mk)).all()
    pay_map = {p.month_key: p for p in pay_rows}
    monthly_payments = [
        ParentPaymentRow(
            month_key=k,
            amount=float(pay_map[k].amount or 0) if k in pay_map else 0.0,
            paid=k in pay_map,
            paid_at=pay_map[k].paid_at if k in pay_map else None,
        )
        for k in mk
    ]

    this_month = _month_key_now()
    from_date = f"{this_month}-01"
    to_date = _month_last_day(this_month)
    schedule_items = _build_schedule_for_teams(
        db, team_ids, from_date, to_date, athlete=athlete, scope="child"
    )

    today = date.today()
    horizon_to = (today + timedelta(days=45)).isoformat()
    upcoming_pool = _apply_schedule_highlights(
        db, athlete.id, _build_schedule_for_teams(
            db, team_ids, today.isoformat(), horizon_to, athlete=athlete, scope="child"
        )
    )
    next_training_item = _pick_next_by_kind(upcoming_pool, competition=False)
    next_competition_item = _pick_next_by_kind(upcoming_pool, competition=True)
    next_event = _pick_next_event(upcoming_pool)

    current_pay = pay_map.get(this_month)
    last_pay_row, last_pay_mk = _last_payment(pay_map)
    due_date_iso = _fee_due_date_iso(this_month, PARENT_FEE_DUE_DAY)
    current_month_fee = ParentCurrentMonthFee(
        month_key=this_month,
        paid=this_month in pay_map,
        amount=float(current_pay.amount or 0) if current_pay else 0.0,
        paid_at=current_pay.paid_at if current_pay else None,
        due_day=PARENT_FEE_DUE_DAY,
        due_date=due_date_iso,
        last_paid_at=last_pay_row.paid_at if last_pay_row else None,
        last_paid_month_key=last_pay_mk,
    )
    competitions_this_month = _count_competitions_in_month(schedule_items, this_month)

    fee_coach = ParentFeeCoachContact()
    club_name = None
    club_logo_url = None
    coach_row = db.query(User).filter(User.id == athlete.coach_id).first()
    if coach_row:
        fee_coach.name = coach_row.name
        fee_coach.email = coach_row.email
        if getattr(coach_row, "phone_visible_to_parents", True) and (coach_row.phone or "").strip():
            fee_coach.phone = coach_row.phone.strip()
    if athlete.club_id:
        club_row = db.query(Club).filter(Club.id == athlete.club_id).first()
        if club_row:
            fee_coach.club_name = club_row.name
            fee_coach.club_phone = club_row.contact_phone
            club_name = club_row.name
            club_logo_url = club_row.logo_url

    try:
        _, pending_dates, fee_highlight = get_pending_marker_state(db, athlete.id)
    except SQLAlchemyError as exc:
        logger.warning("Pending markers for parent profile athlete %s: %s", athlete.id, exc)
        pending_dates, fee_highlight = [], False

    schedule_items = _apply_schedule_highlights(db, athlete.id, schedule_items)

    consent_status = ParentMembershipConsentStatus(
        enabled=False, needs_consent=False, has_signed=False, club_name=club_name
    )
    if athlete.club_id:
        club_row_for_consent = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
        feature_on = club_consent_feature_enabled(club_row_for_consent)
        active_consent = get_active_consent(db, athlete.id, athlete.club_id) if feature_on else None
        if not feature_on:
            # Feature off: no gate, hide consent UI (even if older signatures exist)
            consent_status = ParentMembershipConsentStatus(
                enabled=False,
                needs_consent=False,
                has_signed=False,
                club_name=club_name,
            )
        elif active_consent:
            consent_status = ParentMembershipConsentStatus(
                enabled=True,
                needs_consent=False,
                has_signed=True,
                signed_at=active_consent.signed_at,
                consent_id=active_consent.id,
                club_name=club_name,
            )
        else:
            consent_status = ParentMembershipConsentStatus(
                enabled=True,
                needs_consent=True,
                has_signed=False,
                club_name=club_name,
            )

    carding_status = ParentCardingFormStatus(enabled=False, needs_form=False, has_signed=False, club_name=club_name)
    if athlete.club_id:
        sy = open_carding_season_year(db, int(athlete.club_id))
        if sy:
            signed = get_signed_carding_form(db, athlete.id, sy, athlete.club_id)
            kind = form_kind_for_athlete(athlete, sy)
            needs = athlete_needs_carding_form(db, athlete)
            if signed:
                carding_status = ParentCardingFormStatus(
                    enabled=True,
                    needs_form=False,
                    has_signed=True,
                    season_year=sy,
                    season_label=season_label(sy),
                    form_kind=signed.form_kind,
                    form_id=signed.id,
                    signed_at=signed.signed_at,
                    club_name=club_name,
                )
            else:
                # Season open via head coach button → form required until signed
                carding_status = ParentCardingFormStatus(
                    enabled=True,
                    needs_form=bool(needs),
                    has_signed=False,
                    season_year=sy,
                    season_label=season_label(sy),
                    form_kind=kind,
                    club_name=club_name,
                )

    return ParentAthleteProfileResponse(
        athlete_id=athlete.id,
        athlete_name=athlete.athlete_name,
        birth_year=athlete.birth_year,
        parent_name=athlete.parent_name,
        parent_phone=athlete.parent_phone,
        club_name=club_name,
        club_logo_url=club_logo_url,
        teams=teams,
        carded_teams=carded_teams,
        fee_coach=fee_coach,
        current_month_fee=current_month_fee,
        next_event=next_event,
        next_training=next_training_item,
        next_competition=next_competition_item,
        attendance_summary=attendance_summary,
        last_attendance=last_attendance,
        schedule_month_key=this_month,
        monthly_schedule=schedule_items,
        monthly_payments=monthly_payments,
        competitions_this_month=competitions_this_month,
        fee_due_day=PARENT_FEE_DUE_DAY,
        pending_schedule_dates=pending_dates,
        fee_change_highlight=fee_highlight,
        team_feed=_team_feed_for_parent(db, team_ids, limit=5),
        absence_notices=_active_absence_notices(db, athlete.id),
        membership_consent=consent_status,
        carding_form=carding_status,
    )


@router.post("/parent-portal/me/ack-change", status_code=204)
def parent_ack_change_me(
    body: ParentPortalAckBody,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    _apply_ack_body(db, athlete.id, body)
    return None


@router.post("/parent-portal/{token}/ack-change", status_code=204)
def parent_ack_change_token(token: str, body: ParentPortalAckBody, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    _apply_ack_body(db, athlete.id, body)
    return None


@router.post("/parent-portal/me/ack-changes", status_code=204)
def parent_ack_changes_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    clear_markers_for_athlete(db, athlete.id)
    return None


@router.post("/parent-portal/{token}/ack-changes", status_code=204)
def parent_ack_changes_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    clear_markers_for_athlete(db, athlete.id)
    return None


@router.get("/parent-portal/push/vapid-public-key", response_model=ParentPushVapidResponse)
def parent_push_vapid_public_key():
    key = (settings.vapid_public_key or "").strip()
    if not push_configured():
        raise HTTPException(status_code=503, detail="Известията не са конфигурирани на сървъра (липсват VAPID ключове).")
    return ParentPushVapidResponse(public_key=key, configured=True)


def _parent_push_status(db: Session, athlete_id: int) -> ParentPushStatusResponse:
    from app.services.parent_push import PORTAL_PARENT, push_status_for_portal

    count = push_status_for_portal(db, athlete_id, PORTAL_PARENT)
    return ParentPushStatusResponse(subscribed=count > 0, push_available=push_configured())


@router.get("/parent-portal/me/push-status", response_model=ParentPushStatusResponse)
def parent_push_status_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _parent_push_status(db, athlete.id)


@router.post("/parent-portal/me/push-subscription", status_code=204)
def parent_push_subscribe_me(
    payload: ParentPushSubscribeRequest,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    if not push_configured():
        raise HTTPException(status_code=503, detail="Известията не са конфигурирани на сървъра (липсват VAPID ключове).")
    upsert_subscription(
        db,
        athlete.id,
        payload.endpoint.strip(),
        payload.keys.p256dh.strip(),
        payload.keys.auth.strip(),
        portal=PORTAL_PARENT,
    )
    return None


@router.post("/parent-portal/me/push-test", response_model=ParentPushTestResponse)
def parent_push_test_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    result = send_test_notification(db, athlete.id, portal=PORTAL_PARENT)
    return ParentPushTestResponse(
        sent=result.get("sent", 0),
        subscriptions=result.get("subscriptions", 0),
        configured=push_configured(),
        errors=result.get("errors") or [],
    )


@router.delete("/parent-portal/me/push-subscription", status_code=204)
def parent_push_unsubscribe_me(
    endpoint: str | None = Query(None),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    delete_subscription_for_athlete(
        db, athlete.id, endpoint.strip() if endpoint else None, portal=PORTAL_PARENT
    )
    return None


@router.get("/parent-portal/{token}/push-status", response_model=ParentPushStatusResponse)
def parent_push_status_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _parent_push_status(db, athlete.id)


@router.post("/parent-portal/{token}/push-subscription", status_code=204)
def parent_push_subscribe_token(
    token: str,
    payload: ParentPushSubscribeRequest,
    db: Session = Depends(get_db),
):
    if not push_configured():
        raise HTTPException(status_code=503, detail="Известията не са конфигурирани на сървъра (липсват VAPID ключове).")
    athlete = _resolve_parent_portal_athlete(db, token)
    upsert_subscription(
        db,
        athlete.id,
        payload.endpoint.strip(),
        payload.keys.p256dh.strip(),
        payload.keys.auth.strip(),
        portal=PORTAL_PARENT,
    )
    return None


@router.post("/parent-portal/{token}/push-test", response_model=ParentPushTestResponse)
def parent_push_test_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    result = send_test_notification(db, athlete.id, portal=PORTAL_PARENT)
    return ParentPushTestResponse(
        sent=result.get("sent", 0),
        subscriptions=result.get("subscriptions", 0),
        configured=push_configured(),
        errors=result.get("errors") or [],
    )


@router.delete("/parent-portal/{token}/push-subscription", status_code=204)
def parent_push_unsubscribe_token(
    token: str,
    endpoint: str | None = Query(None),
    db: Session = Depends(get_db),
):
    athlete = _resolve_parent_portal_athlete(db, token)
    delete_subscription_for_athlete(
        db, athlete.id, endpoint.strip() if endpoint else None, portal=PORTAL_PARENT
    )
    return None


@router.get("/parent-portal/me", response_model=ParentAthleteProfileResponse)
def parent_portal_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _build_parent_athlete_profile(db, athlete)


@router.get("/parent-portal/me/development", response_model=ParentDevelopmentOut)
def parent_portal_me_development(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    """Read-only Карта за развитие за родителя (само при дадено съгласие)."""
    return build_parent_development(db, athlete)


@router.get("/parent-portal/{token}/development", response_model=ParentDevelopmentOut)
def parent_portal_token_development(
    token: str,
    db: Session = Depends(get_db),
):
    athlete = _resolve_parent_portal_athlete(db, token)
    return build_parent_development(db, athlete)


@router.get("/parent-portal/me/schedule", response_model=list[ParentScheduleItem])
def parent_portal_me_schedule(
    month: str = Query(..., description="YYYY-MM"),
    scope: str = Query("child", description="child | club_matches"),
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    month_key = month.strip()
    from_date = f"{month_key}-01"
    to_date = _month_last_day(month_key)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    items = _build_schedule_for_teams(
        db, team_ids, from_date, to_date, athlete=athlete, scope=scope
    )
    return _apply_schedule_highlights(db, athlete.id, items)


@router.get("/parent-portal/{token}/schedule", response_model=list[ParentScheduleItem])
def parent_portal_schedule(
    token: str,
    month: str = Query(..., description="YYYY-MM"),
    scope: str = Query("child", description="child | club_matches"),
    db: Session = Depends(get_db),
):
    if not _MONTH_KEY_RE.match((month or "").strip()):
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")
    athlete = _resolve_parent_portal_athlete(db, token)
    month_key = month.strip()
    from_date = f"{month_key}-01"
    to_date = _month_last_day(month_key)
    team_ids = _team_ids_for_athlete(db, athlete.id)
    items = _build_schedule_for_teams(
        db, team_ids, from_date, to_date, athlete=athlete, scope=scope
    )
    return _apply_schedule_highlights(db, athlete.id, items)


@router.get("/parent-portal/{token}", response_model=ParentAthleteProfileResponse)
def parent_portal_view(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _build_parent_athlete_profile(db, athlete)


@router.post("/parent-portal/me/absence-notices", response_model=ParentAbsenceNoticeRead, status_code=201)
def parent_create_absence_notice_me(
    body: ParentAbsenceNoticeCreate,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _create_absence_notice(db, athlete, body)


@router.delete("/parent-portal/me/absence-notices/{notice_id}", status_code=204)
def parent_cancel_absence_notice_me(
    notice_id: int,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    _cancel_absence_notice(db, athlete.id, notice_id)
    return None


@router.post("/parent-portal/{token}/absence-notices", response_model=ParentAbsenceNoticeRead, status_code=201)
def parent_create_absence_notice_token(token: str, body: ParentAbsenceNoticeCreate, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _create_absence_notice(db, athlete, body)


@router.delete("/parent-portal/{token}/absence-notices/{notice_id}", status_code=204)
def parent_cancel_absence_notice_token(token: str, notice_id: int, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    _cancel_absence_notice(db, athlete.id, notice_id)
    return None


def _membership_consent_form_for_athlete(db: Session, athlete: Athlete) -> ParentMembershipConsentForm:
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма назначен клуб")
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    if not club_consent_feature_enabled(club):
        raise HTTPException(
            status_code=403,
            detail="Клубното заявление все още не е активирано от главния треньор",
        )
    tpl = resolve_club_consent_template(club)
    needs = athlete_needs_membership_consent(db, athlete)
    child_egn = (athlete.egn or "").strip()
    first = (athlete.first_name or "").strip()
    middle = (athlete.middle_name or "").strip()
    last = (athlete.last_name or "").strip()
    if not (first and middle and last) and athlete.athlete_name:
        parts = [p for p in str(athlete.athlete_name).split() if p]
        if len(parts) >= 3:
            first = first or parts[0]
            middle = middle or parts[1]
            last = last or " ".join(parts[2:])
        elif len(parts) == 2:
            first = first or parts[0]
            last = last or parts[1]
        elif len(parts) == 1:
            first = first or parts[0]
    return ParentMembershipConsentForm(
        needs_consent=needs,
        club_name=tpl["club_name"],
        club_logo_url=tpl.get("club_logo_url"),
        bvf_logo_url=tpl.get("bvf_logo_url"),
        addressee=tpl["addressee"],
        body_text=tpl["body_text"],
        gdpr_text=tpl["gdpr_text"],
        fee_amount=tpl["fee_amount"],
        fee_due_day=tpl["fee_due_day"],
        fee_currency=tpl.get("fee_currency") or "€",
        prefill={
            "parent_full_name": athlete.parent_name or "",
            "parent_phone": athlete.parent_phone or "",
            "child_first_name": first,
            "child_middle_name": middle,
            "child_last_name": last,
            "child_egn": child_egn,
            "child_place_of_birth": (athlete.place_of_birth or "").strip(),
            "child_phone": athlete.athlete_phone or "",
        },
    )


def _sign_membership_consent(
    db: Session, athlete: Athlete, body: ParentMembershipConsentSignRequest
) -> ParentMembershipConsentSignResponse:
    if not body.gdpr_accepted:
        raise HTTPException(status_code=422, detail="Необходимо е съгласие за обработка на личните данни")
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма назначен клуб")
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    if not club_consent_feature_enabled(club):
        raise HTTPException(
            status_code=403,
            detail="Клубното заявление все още не е активирано от главния треньор",
        )
    if not athlete_needs_membership_consent(db, athlete):
        raise HTTPException(status_code=409, detail="Заявлението вече е подписано")

    tpl = resolve_club_consent_template(club)

    try:
        child_first, child_middle, child_last, child_full_name = require_three_athlete_names(
            body.child_first_name,
            body.child_middle_name,
            body.child_last_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    parent_egn = "".join(ch for ch in body.parent_egn.strip() if ch.isdigit())
    child_egn = "".join(ch for ch in body.child_egn.strip() if ch.isdigit())
    if len(parent_egn) != 10 or len(child_egn) != 10:
        raise HTTPException(status_code=422, detail="ЕГН трябва да е 10 цифри")

    place = (body.child_place_of_birth or "").strip()
    if len(place) < 2:
        raise HTTPException(status_code=422, detail="Градът на раждане е задължителен")
    if len(place) > 25:
        raise HTTPException(status_code=422, detail="Градът на раждане е твърде дълъг (макс. 25)")

    now = datetime.utcnow()
    deactivate_expired_or_prior_consents(db, athlete.id, club.id)
    consent = AthleteClubConsent(
        athlete_id=athlete.id,
        club_id=club.id,
        parent_full_name=body.parent_full_name.strip(),
        parent_egn=parent_egn,
        parent_address=body.parent_address.strip(),
        parent_phone=body.parent_phone.strip(),
        child_full_name=child_full_name,
        child_egn=child_egn,
        child_address=(body.child_address or "").strip() or None,
        child_phone=(body.child_phone or "").strip() or None,
        gdpr_accepted=True,
        signature_name=body.signature_name.strip(),
        signed_at=now,
        addressee_snapshot=tpl["addressee"],
        body_text_snapshot=tpl["body_text"],
        gdpr_text_snapshot=tpl["gdpr_text"],
        club_name_snapshot=tpl["club_name"],
        fee_amount_snapshot=tpl["fee_amount"],
        fee_due_day_snapshot=tpl["fee_due_day"],
        is_active=True,
    )
    db.add(consent)

    # Keep athlete identity/contact in sync (incl. fields needed for СЕК create)
    athlete.parent_name = consent.parent_full_name
    athlete.parent_phone = consent.parent_phone
    athlete.first_name = child_first
    athlete.middle_name = child_middle
    athlete.last_name = child_last
    athlete.athlete_name = child_full_name
    athlete.place_of_birth = place
    athlete.nationality = default_nationality_from_city(place, athlete.nationality)
    athlete.egn = child_egn
    apply_birth_date_from_egn(athlete)

    from app.services.sek_athlete_readiness import refresh_open_sek_task

    refresh_open_sek_task(athlete)

    db.flush()
    try:
        consent.pdf_rel_path = persist_consent_pdf(consent, club=club)
    except Exception as exc:
        logger.warning("PDF for membership consent athlete %s: %s", athlete.id, exc)

    db.commit()
    db.refresh(consent)
    return ParentMembershipConsentSignResponse(
        ok=True,
        consent_id=consent.id,
        signed_at=consent.signed_at,
        needs_consent=False,
    )


@router.get("/parent-portal/me/membership-consent", response_model=ParentMembershipConsentForm)
def parent_membership_consent_form_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _membership_consent_form_for_athlete(db, athlete)


@router.get("/parent-portal/{token}/membership-consent", response_model=ParentMembershipConsentForm)
def parent_membership_consent_form_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _membership_consent_form_for_athlete(db, athlete)


@router.post("/parent-portal/me/membership-consent", response_model=ParentMembershipConsentSignResponse)
def parent_sign_membership_consent_me(
    body: ParentMembershipConsentSignRequest,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _sign_membership_consent(db, athlete, body)


@router.post("/parent-portal/{token}/membership-consent", response_model=ParentMembershipConsentSignResponse)
def parent_sign_membership_consent_token(
    token: str,
    body: ParentMembershipConsentSignRequest,
    db: Session = Depends(get_db),
):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _sign_membership_consent(db, athlete, body)


@router.get("/parent-portal/me/membership-consent/preview")
def parent_membership_consent_preview_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    consent = get_active_consent(db, athlete.id, athlete.club_id)
    if not consent:
        raise HTTPException(status_code=404, detail="Няма подписано заявление")
    club = db.query(Club).filter(Club.id == int(consent.club_id)).first() if consent.club_id else None
    pdf = read_consent_pdf(consent, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="zayavlenie_{consent.id}.pdf"'},
    )


@router.get("/parent-portal/{token}/membership-consent/preview")
def parent_membership_consent_preview_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    consent = get_active_consent(db, athlete.id, athlete.club_id)
    if not consent:
        raise HTTPException(status_code=404, detail="Няма подписано заявление")
    club = db.query(Club).filter(Club.id == int(consent.club_id)).first() if consent.club_id else None
    pdf = read_consent_pdf(consent, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="zayavlenie_{consent.id}.pdf"'},
    )


def _carding_form_meta_for_athlete(db: Session, athlete: Athlete) -> ParentCardingFormMeta:
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма назначен клуб")
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    year = open_carding_season_year(db, club.id)
    if not year:
        raise HTTPException(
            status_code=404,
            detail="Няма отворена сезонна заявка за картотекиране. Главният треньор трябва първо да отвори сезона.",
        )
    needs = athlete_needs_carding_form(db, athlete)
    pre = prefill_carding_form(db, athlete, year)
    return ParentCardingFormMeta(
        needs_form=needs,
        form_kind=pre["form_kind"],
        season_year=year,
        season_label=pre["season_label"],
        club_name=club.name or "",
        club_logo_url=club.logo_url,
        bvf_logo_url="/static/branding/bfvb-logo.png",
        prefill=pre,
    )


def _sign_carding_form(
    db: Session, athlete: Athlete, body: ParentCardingFormSignRequest
) -> ParentCardingFormSignResponse:
    if not body.rules_accepted:
        raise HTTPException(status_code=422, detail="Необходимо е приемане на правилата на БФВ")
    if not athlete.club_id:
        raise HTTPException(status_code=422, detail="Състезателят няма назначен клуб")
    club = db.query(Club).filter(Club.id == int(athlete.club_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    year = open_carding_season_year(db, club.id)
    if not year:
        raise HTTPException(status_code=409, detail="Няма отворена сезонна заявка за картотекиране")
    if not athlete_needs_carding_form(db, athlete):
        raise HTTPException(status_code=409, detail="Формата за този сезон вече е подписана")

    try:
        _f, _m, _l, athlete_full = require_three_athlete_names(
            body.athlete_first_name,
            body.athlete_middle_name,
            body.athlete_last_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    p1_egn = "".join(ch for ch in body.parent1_egn.strip() if ch.isdigit())
    a_egn = "".join(ch for ch in body.athlete_egn.strip() if ch.isdigit())
    p2_name = (body.parent2_full_name or "").strip()
    p2_egn = "".join(ch for ch in (body.parent2_egn or "") if ch.isdigit())
    if len(p1_egn) != 10 or len(a_egn) != 10 or len(p2_egn) != 10:
        raise HTTPException(status_code=422, detail="ЕГН трябва да е 10 цифри (и двамата родители + състезател)")
    if len(p2_name) < 2:
        raise HTTPException(status_code=422, detail="Имената на родител 2 са задължителни")
    sig_p2 = (body.signature_parent2 or "").strip()
    if len(sig_p2) < 2:
        raise HTTPException(status_code=422, detail="Подписът на родител 2 е задължителен")

    kind = form_kind_for_athlete(athlete, year)
    if kind == FORM_KIND_03A:
        sig_ath = (body.signature_athlete or "").strip()
        if len(sig_ath) < 2:
            raise HTTPException(status_code=422, detail="За Форма 0-3 А е нужен подпис на състезателя")
        if not (body.signature_athlete_image or "").strip():
            raise HTTPException(status_code=422, detail="За Форма 0-3 А е нужен екранен подпис на състезателя")
    else:
        sig_ath = (body.signature_athlete or "").strip() or None

    if not (body.signature_parent1_image or "").strip():
        raise HTTPException(status_code=422, detail="Нужен е екранен подпис на родител 1")

    now = datetime.utcnow()
    deactivate_prior_carding_forms(db, athlete.id, year)
    form = AthleteCardingForm(
        athlete_id=athlete.id,
        club_id=club.id,
        season_year=year,
        form_kind=kind,
        parent1_full_name=body.parent1_full_name.strip(),
        parent1_egn=p1_egn,
        parent2_full_name=p2_name,
        parent2_egn=p2_egn,
        athlete_full_name=athlete_full,
        athlete_egn=a_egn,
        city=(body.city or "").strip() or None,
        rules_accepted=True,
        signature_parent1=body.signature_parent1.strip(),
        signature_parent2=sig_p2,
        signature_athlete=sig_ath,
        signed_at=now,
        club_name_snapshot=club.name,
        season_label_snapshot=season_label(year),
        is_active=True,
    )
    db.add(form)
    db.flush()
    try:
        form.signature_parent1_image_rel = save_carding_signature_png(
            form.id, "parent1", body.signature_parent1_image
        )
        if kind == FORM_KIND_03A and body.signature_athlete_image:
            form.signature_athlete_image_rel = save_carding_signature_png(
                form.id, "athlete", body.signature_athlete_image
            )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        form.pdf_rel_path = persist_carding_form_pdf(form, club=club)
    except Exception as exc:
        logger.warning("PDF for carding form athlete %s: %s", athlete.id, exc)
    db.commit()
    db.refresh(form)
    return ParentCardingFormSignResponse(
        ok=True,
        form_id=form.id,
        signed_at=form.signed_at,
        form_kind=form.form_kind,
        season_year=form.season_year,
        needs_form=False,
    )


@router.get("/parent-portal/me/carding-form", response_model=ParentCardingFormMeta)
def parent_carding_form_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _carding_form_meta_for_athlete(db, athlete)


@router.get("/parent-portal/{token}/carding-form", response_model=ParentCardingFormMeta)
def parent_carding_form_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _carding_form_meta_for_athlete(db, athlete)


@router.post("/parent-portal/me/carding-form", response_model=ParentCardingFormSignResponse)
def parent_sign_carding_form_me(
    body: ParentCardingFormSignRequest,
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    return _sign_carding_form(db, athlete, body)


@router.post("/parent-portal/{token}/carding-form", response_model=ParentCardingFormSignResponse)
def parent_sign_carding_form_token(
    token: str,
    body: ParentCardingFormSignRequest,
    db: Session = Depends(get_db),
):
    athlete = _resolve_parent_portal_athlete(db, token)
    return _sign_carding_form(db, athlete, body)


@router.get("/parent-portal/me/carding-form/preview")
def parent_carding_form_preview_me(
    db: Session = Depends(get_db),
    athlete: Athlete = Depends(get_current_parent_athlete),
):
    year = open_carding_season_year(db, athlete.club_id) if athlete.club_id else None
    form = get_signed_carding_form(db, athlete.id, year, athlete.club_id) if year else None
    if not form:
        raise HTTPException(status_code=404, detail="Няма подписана Форма 03")
    club = db.query(Club).filter(Club.id == int(form.club_id)).first() if form.club_id else None
    pdf = read_carding_form_pdf(form, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="forma03_{form.id}.pdf"'},
    )


@router.get("/parent-portal/{token}/carding-form/preview")
def parent_carding_form_preview_token(token: str, db: Session = Depends(get_db)):
    athlete = _resolve_parent_portal_athlete(db, token)
    year = open_carding_season_year(db, athlete.club_id) if athlete.club_id else None
    form = get_signed_carding_form(db, athlete.id, year, athlete.club_id) if year else None
    if not form:
        raise HTTPException(status_code=404, detail="Няма подписана Форма 03")
    club = db.query(Club).filter(Club.id == int(form.club_id)).first() if form.club_id else None
    pdf = read_carding_form_pdf(form, club=club)
    if not pdf:
        raise HTTPException(status_code=500, detail="Неуспешно генериране на PDF")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="forma03_{form.id}.pdf"'},
    )
