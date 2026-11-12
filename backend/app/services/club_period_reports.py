"""Месечни отчети за главен треньор: пакет треньор / клуб / спортен."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from sqlalchemy import func

from app.models import (
    Athlete,
    AthletePayment,
    AttendanceRecord,
    Club,
    ClubEnrollmentRequest,
    Team,
    TeamMember,
    TeamSession,
    Training,
    User,
    UserRole,
)
from app.models_assessment import AssessmentResult, AssessmentSession, DevelopmentScore
from app.models_matches import Match, MatchSet, MatchStatus, MatchStatEvent
from app.services.club_membership_consent import DEFAULT_FEE_AMOUNT
from app.services.fee_exemption import athlete_birth_year, athlete_fee_exempt_for_month
from app.services.match_live import count_sets_won, is_match_won

PackLiteral = Literal["coach", "club", "sport"]


def parse_month_key(month_key: str) -> str:
    raw = (month_key or "").strip()
    try:
        y, m = raw.split("-")
        yi, mi = int(y), int(m)
        if yi < 2000 or yi > 2100 or mi < 1 or mi > 12:
            raise ValueError
    except ValueError as exc:
        raise ValueError("month трябва да е YYYY-MM") from exc
    return f"{yi:04d}-{mi:02d}"


def month_date_bounds(month_key: str) -> tuple[str, str, date, date]:
    mk = parse_month_key(month_key)
    y, m = int(mk[:4]), int(mk[5:7])
    last = monthrange(y, m)[1]
    from_d = date(y, m, 1)
    to_d = date(y, m, last)
    return from_d.isoformat(), to_d.isoformat(), from_d, to_d


def iter_month_keys(month_from: str, month_to: str | None = None) -> list[str]:
    start = parse_month_key(month_from)
    end = parse_month_key(month_to or month_from)
    if end < start:
        start, end = end, start
    y, m = int(start[:4]), int(start[5:7])
    ey, em = int(end[:4]), int(end[5:7])
    out: list[str] = []
    while (y, m) <= (ey, em):
        out.append(f"{y:04d}-{m:02d}")
        if len(out) > 36:
            raise ValueError("Периодът не може да е над 36 месеца")
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def period_date_bounds(
    month_from: str,
    month_to: str | None = None,
) -> tuple[str, str, date, date, list[str]]:
    keys = iter_month_keys(month_from, month_to)
    from_s, _, from_d, _ = month_date_bounds(keys[0])
    _, to_s, _, to_d = month_date_bounds(keys[-1])
    return from_s, to_s, from_d, to_d, keys


def _pct(part: int, whole: int) -> float | None:
    if whole <= 0:
        return None
    return round((part / whole) * 100, 1)


def _club_coaches(db: Session, club_id: int) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.club_id == club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )


def _teams_for_scope(db: Session, club_id: int, coach_id: int | None) -> list[Team]:
    q = db.query(Team).filter(Team.club_id == club_id)
    if coach_id:
        q = q.filter(Team.coach_id == int(coach_id))
    return q.order_by(Team.name.asc()).all()


def _athletes_for_scope(db: Session, club_id: int, coach_id: int | None) -> list[Athlete]:
    q = db.query(Athlete).filter(Athlete.club_id == club_id)
    if coach_id:
        q = q.filter(Athlete.coach_id == int(coach_id))
    return q.order_by(Athlete.athlete_name.asc()).all()


def _attendance_block(
    db: Session,
    *,
    team_ids: list[int],
    from_date: str,
    to_date: str,
) -> dict[str, Any]:
    if not team_ids:
        return {
            "sessions_count": 0,
            "sessions_with_attendance": 0,
            "sessions_without_attendance": 0,
            "present": 0,
            "late": 0,
            "absent": 0,
            "excused": 0,
            "marked_total": 0,
            "attendance_pct": None,
            "by_team": [],
            "low_attendance": [],
        }

    sessions = (
        db.query(TeamSession)
        .filter(
            TeamSession.team_id.in_(team_ids),
            TeamSession.date >= from_date,
            TeamSession.date <= to_date,
        )
        .all()
    )
    session_ids = [s.id for s in sessions]
    sessions_by_team: dict[int, int] = {}
    for s in sessions:
        sessions_by_team[int(s.team_id)] = sessions_by_team.get(int(s.team_id), 0) + 1

    counts = {"present": 0, "late": 0, "absent": 0, "excused": 0}
    by_team_counts: dict[int, dict[str, int]] = {}
    athlete_marks: dict[int, dict[str, int]] = {}
    sessions_with_marks: set[int] = set()

    if session_ids:
        rows = (
            db.query(
                AttendanceRecord.session_id,
                AttendanceRecord.athlete_id,
                AttendanceRecord.status,
                TeamSession.team_id,
            )
            .join(TeamSession, TeamSession.id == AttendanceRecord.session_id)
            .filter(AttendanceRecord.session_id.in_(session_ids))
            .all()
        )
        for sid, aid, status, tid in rows:
            key = str(status or "").strip().lower()
            if key not in counts:
                continue
            sessions_with_marks.add(int(sid))
            counts[key] += 1
            tc = by_team_counts.setdefault(
                int(tid), {"present": 0, "late": 0, "absent": 0, "excused": 0, "marked": 0}
            )
            tc[key] += 1
            tc["marked"] += 1
            am = athlete_marks.setdefault(
                int(aid), {"present": 0, "late": 0, "absent": 0, "excused": 0, "marked": 0}
            )
            am[key] += 1
            am["marked"] += 1

    marked = sum(counts.values())
    attended = counts["present"] + counts["late"]
    teams = db.query(Team).filter(Team.id.in_(team_ids)).all()
    team_name = {t.id: t.name for t in teams}
    team_coach_id = {t.id: int(t.coach_id) for t in teams if t.coach_id is not None}
    coach_ids = list({cid for cid in team_coach_id.values()})
    coach_name = {}
    if coach_ids:
        coach_name = {
            u.id: (u.name or u.email or "")
            for u in db.query(User).filter(User.id.in_(coach_ids)).all()
        }
    member_counts = {
        int(tid): int(cnt)
        for tid, cnt in (
            db.query(TeamMember.team_id, func.count(TeamMember.id))
            .filter(TeamMember.team_id.in_(team_ids))
            .group_by(TeamMember.team_id)
            .all()
        )
    }
    by_team = []
    for tid in team_ids:
        tc = by_team_counts.get(tid, {"present": 0, "late": 0, "absent": 0, "excused": 0, "marked": 0})
        att = tc["present"] + tc["late"]
        cid = team_coach_id.get(tid)
        by_team.append(
            {
                "team_id": tid,
                "team_name": team_name.get(tid, ""),
                "coach_id": cid,
                "coach_name": coach_name.get(cid, "") if cid is not None else "",
                "athlete_count": member_counts.get(tid, 0),
                "sessions_count": sessions_by_team.get(tid, 0),
                "present": tc["present"],
                "late": tc["late"],
                "absent": tc["absent"],
                "excused": tc["excused"],
                "attendance_pct": _pct(att, tc["marked"]),
            }
        )

    athlete_ids = list(athlete_marks.keys())
    names = {}
    if athlete_ids:
        names = {
            a.id: a.athlete_name
            for a in db.query(Athlete).filter(Athlete.id.in_(athlete_ids)).all()
        }
    team_info = _athlete_team_info(db, athlete_ids=athlete_ids, team_ids=team_ids)
    low = []
    for aid, am in athlete_marks.items():
        if am["marked"] < 3:
            continue
        att = am["present"] + am["late"]
        pct = _pct(att, am["marked"])
        if pct is not None and pct < 70:
            info = team_info.get(int(aid)) or {}
            low.append(
                {
                    "athlete_id": aid,
                    "athlete_name": names.get(aid, ""),
                    "team_id": info.get("team_id"),
                    "team_name": info.get("team_name") or "",
                    "coach_id": info.get("coach_id"),
                    "marked": am["marked"],
                    "present": am["present"],
                    "late": am["late"],
                    "absent": am["absent"],
                    "excused": am["excused"],
                    "attendance_pct": pct,
                }
            )
    low.sort(key=lambda x: (x["attendance_pct"] if x["attendance_pct"] is not None else 999, x["athlete_name"]))

    with_marks = len(sessions_with_marks)
    return {
        "sessions_count": len(sessions),
        "sessions_with_attendance": with_marks,
        "sessions_without_attendance": max(0, len(sessions) - with_marks),
        "present": counts["present"],
        "late": counts["late"],
        "absent": counts["absent"],
        "excused": counts["excused"],
        "marked_total": marked,
        "attendance_pct": _pct(attended, marked),
        "by_team": by_team,
        "low_attendance": low[:40],
    }


def _club_fee_unit(club: Club | None) -> float:
    if club is None:
        return float(DEFAULT_FEE_AMOUNT)
    return float(getattr(club, "membership_consent_fee_amount", None) or DEFAULT_FEE_AMOUNT)


def _athlete_team_info(
    db: Session,
    *,
    athlete_ids: list[int],
    team_ids: list[int] | None = None,
) -> dict[int, dict[str, Any]]:
    """Primary team per athlete (first membership), optionally scoped to team_ids."""
    if not athlete_ids:
        return {}
    q = (
        db.query(TeamMember.athlete_id, Team.id, Team.name, Team.coach_id)
        .join(Team, Team.id == TeamMember.team_id)
        .filter(TeamMember.athlete_id.in_(athlete_ids))
    )
    if team_ids:
        q = q.filter(TeamMember.team_id.in_(team_ids))
    rows = q.order_by(TeamMember.athlete_id.asc(), TeamMember.id.asc()).all()
    out: dict[int, dict[str, Any]] = {}
    for aid, tid, tname, cid in rows:
        i_aid = int(aid)
        if i_aid in out:
            continue
        out[i_aid] = {
            "team_id": int(tid),
            "team_name": tname or "",
            "coach_id": int(cid) if cid is not None else None,
        }
    return out


def _fees_block(
    db: Session,
    *,
    club: Club | None,
    athletes: list[Athlete],
    month_key: str | None = None,
    month_keys: list[str] | None = None,
) -> dict[str, Any]:
    keys = list(month_keys or [])
    if not keys:
        keys = [parse_month_key(month_key or "")]
    else:
        keys = [parse_month_key(k) for k in keys]
    fee_unit = _club_fee_unit(club)
    n_months = len(keys)

    # Per athlete: months due / paid / exempt in the period.
    unpaid: list[dict[str, Any]] = []
    paid_rows: list[dict[str, Any]] = []
    exempt: list[dict[str, Any]] = []
    billable_slots = 0
    paid_slots = 0
    total_paid = 0.0

    athlete_ids = [a.id for a in athletes]
    payments_by_athlete: dict[int, dict[str, AthletePayment]] = {}
    if athlete_ids:
        pay_rows = (
            db.query(AthletePayment)
            .filter(
                AthletePayment.athlete_id.in_(athlete_ids),
                AthletePayment.month_key.in_(keys),
            )
            .all()
        )
        for p in pay_rows:
            payments_by_athlete.setdefault(int(p.athlete_id), {})[str(p.month_key)] = p

    for a in athletes:
        due_months: list[str] = []
        paid_months: list[str] = []
        exempt_months: list[str] = []
        reason_last = ""
        amount_sum = 0.0
        for mk in keys:
            is_ex, reason = athlete_fee_exempt_for_month(a, club, mk)
            if is_ex:
                exempt_months.append(mk)
                reason_last = reason.value if hasattr(reason, "value") else (str(reason) if reason else "")
                continue
            due_months.append(mk)
            p = (payments_by_athlete.get(int(a.id)) or {}).get(mk)
            if p:
                paid_months.append(mk)
                amount_sum += float(p.amount or 0)
        if due_months:
            billable_slots += len(due_months)
            paid_slots += len(paid_months)
            total_paid += amount_sum
            amount_due = round(fee_unit * len(due_months), 2)
            missing = [m for m in due_months if m not in paid_months]
            if missing:
                unpaid.append(
                    {
                        "athlete_id": a.id,
                        "athlete_name": a.athlete_name,
                        "coach_id": a.coach_id,
                        "amount_due": amount_due,
                        "amount_paid": round(amount_sum, 2),
                        "months_due": len(due_months),
                        "months_paid": len(paid_months),
                        "months_missing": missing,
                        "status": "unpaid",
                    }
                )
            else:
                paid_rows.append(
                    {
                        "athlete_id": a.id,
                        "athlete_name": a.athlete_name,
                        "coach_id": a.coach_id,
                        "amount": round(amount_sum, 2),
                        "amount_due": amount_due,
                        "months_due": len(due_months),
                        "months_paid": len(paid_months),
                        "status": "paid",
                    }
                )
        elif exempt_months:
            exempt.append(
                {
                    "athlete_id": a.id,
                    "athlete_name": a.athlete_name,
                    "reason": reason_last,
                    "coach_id": a.coach_id,
                    "amount_due": 0.0,
                    "status": "exempt",
                }
            )

    team_info = _athlete_team_info(
        db,
        athlete_ids=[a["athlete_id"] for a in unpaid + paid_rows + exempt],
    )
    for row in unpaid + paid_rows + exempt:
        info = team_info.get(int(row["athlete_id"])) or {}
        row["team_id"] = info.get("team_id")
        row["team_name"] = info.get("team_name") or ""

    expected = round(fee_unit * billable_slots, 2)
    return {
        "month_key": keys[0] if n_months == 1 else f"{keys[0]}…{keys[-1]}",
        "month_keys": keys,
        "months_count": n_months,
        "billable": billable_slots if n_months > 1 else len(paid_rows) + len(unpaid),
        "paid": paid_slots if n_months > 1 else len(paid_rows),
        "unpaid": len(unpaid),
        "exempt": len(exempt),
        "fee_unit_amount": round(fee_unit, 2),
        "expected_amount": expected,
        "total_paid_amount": round(total_paid, 2),
        "collection_pct": _pct(paid_slots, billable_slots)
        if n_months > 1
        else _pct(len(paid_rows), len(paid_rows) + len(unpaid)),
        "unpaid_athletes": unpaid[:80],
        "paid_athletes": paid_rows[:80],
        "exempt_athletes": exempt[:40],
    }


def _athlete_age_years(athlete: Athlete, *, today: date | None = None) -> int | None:
    """Approximate age in full years; None when birth year/date is missing."""
    ref = today or date.today()
    bd = getattr(athlete, "birth_date", None)
    if bd is not None and getattr(bd, "year", None):
        years = int(ref.year) - int(bd.year)
        if (ref.month, ref.day) < (int(bd.month), int(bd.day)):
            years -= 1
        return years
    by = athlete_birth_year(athlete)
    if by is None:
        return None
    return int(ref.year) - int(by)


def _missing_data(athletes: list[Athlete]) -> dict[str, Any]:
    no_egn = []
    no_parent = []
    no_bvf = []
    today = date.today()
    for a in athletes:
        if not (a.egn or "").strip():
            no_egn.append({"athlete_id": a.id, "athlete_name": a.athlete_name})
        missing_parent = not (a.parent_name or "").strip() and not (
            getattr(a, "parent_phone", None) or ""
        ).strip()
        if missing_parent:
            age = _athlete_age_years(a, today=today)
            # Under 18 only when age is known; unknown age keeps previous behavior.
            if age is None or age < 18:
                no_parent.append({"athlete_id": a.id, "athlete_name": a.athlete_name})
        if not getattr(a, "bvf_player_id", None):
            no_bvf.append({"athlete_id": a.id, "athlete_name": a.athlete_name})
    return {
        "no_egn_count": len(no_egn),
        "no_parent_count": len(no_parent),
        "no_bvf_count": len(no_bvf),
        "no_egn": no_egn[:40],
        "no_parent": no_parent[:40],
        "no_bvf": no_bvf[:40],
    }


def _trainings_block(
    db: Session,
    *,
    club_id: int,
    coach_id: int | None,
    from_d: date,
    to_d: date,
) -> dict[str, Any]:
    q = db.query(Training).filter(
        Training.club_id == club_id,
        Training.created_at >= datetime.combine(from_d, datetime.min.time()),
        Training.created_at <= datetime.combine(to_d, datetime.max.time()),
    )
    if coach_id:
        q = q.filter(Training.coach_id == int(coach_id))
    rows = q.order_by(Training.created_at.desc()).all()
    return {
        "count": len(rows),
        "items": [
            {
                "id": t.id,
                "title": t.title or "",
                "status": t.status.value if hasattr(t.status, "value") else str(t.status),
                "coach_id": t.coach_id,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in rows[:30]
        ],
    }


def _matches_block(
    db: Session,
    *,
    team_ids: list[int],
    from_d: date,
    to_d: date,
) -> dict[str, Any]:
    if not team_ids:
        return {
            "count": 0,
            "finished": 0,
            "wins": 0,
            "losses": 0,
            "with_stats": 0,
            "official": 0,
            "control": 0,
            "items": [],
        }

    matches = (
        db.query(Match)
        .filter(
            Match.team_id.in_(team_ids),
            Match.match_date >= from_d,
            Match.match_date <= to_d,
        )
        .order_by(Match.match_date.asc(), Match.id.asc())
        .all()
    )
    team_name = {t.id: t.name for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}
    items = []
    wins = losses = finished = with_stats = 0
    official = control = 0
    for m in matches:
        status = m.status.value if hasattr(m.status, "value") else str(m.status)
        sets = db.query(MatchSet).filter(MatchSet.match_id == m.id).order_by(MatchSet.set_number.asc()).all()
        us, opp = count_sets_won(sets)
        won_by = is_match_won(us, opp, m.format) if status == MatchStatus.finished.value or status == "finished" else None
        if status in (MatchStatus.finished.value, "finished"):
            finished += 1
            if won_by == "us":
                wins += 1
            elif won_by == "opp":
                losses += 1
        kind = "official" if getattr(m, "competition_id", None) else "control"
        if kind == "official":
            official += 1
        else:
            control += 1
        ev_count = (
            db.query(MatchStatEvent)
            .filter(MatchStatEvent.match_id == m.id, MatchStatEvent.undone == 0)
            .count()
        )
        if ev_count > 0:
            with_stats += 1
        items.append(
            {
                "match_id": m.id,
                "team_id": m.team_id,
                "team_name": team_name.get(m.team_id, ""),
                "opponent_name": m.opponent_name or "",
                "match_date": m.match_date.isoformat() if m.match_date else None,
                "status": status,
                "kind": kind,
                "sets_won_us": us,
                "sets_won_opp": opp,
                "won_by": won_by,
                "event_count": int(ev_count),
            }
        )
    return {
        "count": len(matches),
        "finished": finished,
        "wins": wins,
        "losses": losses,
        "with_stats": with_stats,
        "official": official,
        "control": control,
        "items": items,
    }


def _assessments_block(
    db: Session,
    *,
    team_ids: list[int],
    from_d: date,
    to_d: date,
) -> dict[str, Any]:
    if not team_ids:
        return {
            "sessions_count": 0,
            "athletes_tested": 0,
            "results_count": 0,
            "avg_development_score": None,
            "improved_count": 0,
            "declined_count": 0,
            "sessions": [],
        }

    sessions = (
        db.query(AssessmentSession)
        .filter(
            AssessmentSession.team_id.in_(team_ids),
            AssessmentSession.conducted_on >= from_d,
            AssessmentSession.conducted_on <= to_d,
        )
        .order_by(AssessmentSession.conducted_on.asc())
        .all()
    )
    session_ids = [s.id for s in sessions]
    results_count = 0
    athletes_tested = set()
    if session_ids:
        res_rows = (
            db.query(AssessmentResult.athlete_id)
            .filter(AssessmentResult.session_id.in_(session_ids), AssessmentResult.raw_value.isnot(None))
            .all()
        )
        results_count = len(res_rows)
        athletes_tested = {int(a) for (a,) in res_rows}

    window_ids = list({int(s.window_id) for s in sessions})
    scores = []
    improved = declined = 0
    if window_ids and athletes_tested:
        score_rows = (
            db.query(DevelopmentScore)
            .filter(
                DevelopmentScore.window_id.in_(window_ids),
                DevelopmentScore.athlete_id.in_(list(athletes_tested)),
            )
            .all()
        )
        for row in score_rows:
            if row.development_score is not None:
                scores.append(float(row.development_score))
            if row.delta is not None:
                if float(row.delta) > 0:
                    improved += 1
                elif float(row.delta) < 0:
                    declined += 1

    team_name = {t.id: t.name for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}
    return {
        "sessions_count": len(sessions),
        "athletes_tested": len(athletes_tested),
        "results_count": results_count,
        "avg_development_score": round(sum(scores) / len(scores), 1) if scores else None,
        "improved_count": improved,
        "declined_count": declined,
        "sessions": [
            {
                "session_id": s.id,
                "team_id": s.team_id,
                "team_name": team_name.get(s.team_id, ""),
                "conducted_on": s.conducted_on.isoformat() if s.conducted_on else None,
                "status": s.status.value if hasattr(s.status, "value") else str(s.status),
                "window_id": s.window_id,
            }
            for s in sessions[:40]
        ],
    }


def _enrollments_block(db: Session, club_id: int, from_d: date, to_d: date) -> dict[str, Any]:
    rows = (
        db.query(ClubEnrollmentRequest)
        .filter(
            ClubEnrollmentRequest.club_id == club_id,
            ClubEnrollmentRequest.created_at >= datetime.combine(from_d, datetime.min.time()),
            ClubEnrollmentRequest.created_at <= datetime.combine(to_d, datetime.max.time()),
        )
        .all()
    )
    by_status: dict[str, int] = {}
    for r in rows:
        st = str(r.status or "new")
        by_status[st] = by_status.get(st, 0) + 1
    return {"count": len(rows), "by_status": by_status}


def build_coach_pack(
    db: Session,
    *,
    club: Club,
    coach: User,
    month_key: str,
    month_to: str | None = None,
) -> dict[str, Any]:
    from_s, to_s, from_d, to_d, month_keys = period_date_bounds(month_key, month_to)
    teams = _teams_for_scope(db, club.id, coach.id)
    athletes = _athletes_for_scope(db, club.id, coach.id)
    team_ids = [t.id for t in teams]
    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)
    fees = _fees_block(db, club=club, athletes=athletes, month_keys=month_keys)
    missing = _missing_data(athletes)
    trainings = _trainings_block(db, club_id=club.id, coach_id=coach.id, from_d=from_d, to_d=to_d)
    matches = _matches_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    assessments = _assessments_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)

    actions = []
    if fees["unpaid"]:
        actions.append(f"Неплатили такса: {fees['unpaid']} състезатели")
    if attendance["low_attendance"]:
        actions.append(f"Ниско присъствие (<70%): {len(attendance['low_attendance'])} състезатели")
    if missing["no_egn_count"]:
        actions.append(f"Без ЕГН: {missing['no_egn_count']}")
    if matches["finished"] and matches["with_stats"] < matches["finished"]:
        actions.append(
            f"Мачове без статистика: {matches['finished'] - matches['with_stats']} от {matches['finished']}"
        )

    return {
        "pack": "coach",
        "title": f"Отчет треньор · {coach.name or coach.email}",
        "month_key": month_keys[0],
        "month_to": month_keys[-1],
        "month_keys": month_keys,
        "from_date": from_s,
        "to_date": to_s,
        "club_id": club.id,
        "club_name": club.name,
        "coach": {"id": coach.id, "name": coach.name or "", "email": coach.email or ""},
        "summary": {
            "teams": len(teams),
            "athletes": len(athletes),
            "coaches": 1,
            "sessions": attendance["sessions_count"],
            "sessions_with_attendance": attendance["sessions_with_attendance"],
            "sessions_without_attendance": attendance["sessions_without_attendance"],
            "attendance_pct": attendance["attendance_pct"],
            "fees_billable": fees["billable"],
            "fees_paid": fees["paid"],
            "fees_unpaid": fees["unpaid"],
            "fees_exempt": fees["exempt"],
            "fees_collected_amount": fees["total_paid_amount"],
            "fees_expected_amount": fees.get("expected_amount", 0),
            "fees_unit_amount": fees.get("fee_unit_amount", 0),
            "fees_collection_pct": fees["collection_pct"],
            "unpaid": fees["unpaid"],
            "matches_finished": matches["finished"],
            "match_wins": matches["wins"],
            "matches_official": matches.get("official", 0),
            "matches_control": matches.get("control", 0),
            "assessments": assessments["sessions_count"],
            "trainings_created": trainings["count"],
            "enrollments": 0,
        },
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "age_group": t.age_group or "",
                "coach_id": t.coach_id,
            }
            for t in teams
        ],
        "attendance": attendance,
        "fees": fees,
        "missing_data": missing,
        "trainings": trainings,
        "matches": matches,
        "assessments": assessments,
        "actions": actions,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def build_club_pack(
    db: Session,
    *,
    club: Club,
    month_key: str,
    month_to: str | None = None,
) -> dict[str, Any]:
    from_s, to_s, from_d, to_d, month_keys = period_date_bounds(month_key, month_to)
    coaches = _club_coaches(db, club.id)
    teams = _teams_for_scope(db, club.id, None)
    athletes = _athletes_for_scope(db, club.id, None)
    team_ids = [t.id for t in teams]

    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)
    fees = _fees_block(db, club=club, athletes=athletes, month_keys=month_keys)
    missing = _missing_data(athletes)
    trainings = _trainings_block(db, club_id=club.id, coach_id=None, from_d=from_d, to_d=to_d)
    matches = _matches_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    assessments = _assessments_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    enrollments = _enrollments_block(db, club.id, from_d, to_d)

    coach_rows = []
    for c in coaches:
        c_athletes = [a for a in athletes if a.coach_id == c.id]
        c_teams = [t for t in teams if t.coach_id == c.id]
        c_team_ids = [t.id for t in c_teams]
        c_att = _attendance_block(db, team_ids=c_team_ids, from_date=from_s, to_date=to_s)
        c_fees = _fees_block(db, club=club, athletes=c_athletes, month_keys=month_keys)
        c_matches = _matches_block(db, team_ids=c_team_ids, from_d=from_d, to_d=to_d)
        coach_rows.append(
            {
                "coach_id": c.id,
                "coach_name": c.name or c.email or "",
                "role": c.role.value if hasattr(c.role, "value") else str(c.role),
                "teams": len(c_teams),
                "athletes": len(c_athletes),
                "sessions": c_att["sessions_count"],
                "attendance_pct": c_att["attendance_pct"],
                "fees_paid": c_fees["paid"],
                "fees_unpaid": c_fees["unpaid"],
                "fees_collection_pct": c_fees["collection_pct"],
                "fees_collected_amount": c_fees["total_paid_amount"],
                "fees_expected_amount": c_fees.get("expected_amount", 0),
                "matches_finished": c_matches["finished"],
                "match_wins": c_matches["wins"],
            }
        )

    actions = []
    if fees["unpaid"]:
        actions.append(f"Клубни длъжници за месеца: {fees['unpaid']}")
    if attendance["attendance_pct"] is not None and attendance["attendance_pct"] < 75:
        actions.append(f"Общо присъствие под 75%: {attendance['attendance_pct']}%")
    if enrollments["count"]:
        actions.append(f"Нови заявки за записване: {enrollments['count']}")
    if missing["no_egn_count"]:
        actions.append(f"Състезатели без ЕГН: {missing['no_egn_count']}")

    return {
        "pack": "club",
        "title": f"Отчет клуб · {club.name}",
        "month_key": month_keys[0],
        "month_to": month_keys[-1],
        "month_keys": month_keys,
        "from_date": from_s,
        "to_date": to_s,
        "club_id": club.id,
        "club_name": club.name,
        "summary": {
            "coaches": len(coaches),
            "teams": len(teams),
            "athletes": len(athletes),
            "sessions": attendance["sessions_count"],
            "sessions_with_attendance": attendance["sessions_with_attendance"],
            "sessions_without_attendance": attendance["sessions_without_attendance"],
            "attendance_pct": attendance["attendance_pct"],
            "fees_billable": fees["billable"],
            "fees_paid": fees["paid"],
            "fees_unpaid": fees["unpaid"],
            "fees_exempt": fees["exempt"],
            "fees_collected_amount": fees["total_paid_amount"],
            "fees_expected_amount": fees.get("expected_amount", 0),
            "fees_unit_amount": fees.get("fee_unit_amount", 0),
            "fees_collection_pct": fees["collection_pct"],
            "unpaid": fees["unpaid"],
            "total_paid_amount": fees["total_paid_amount"],
            "matches_finished": matches["finished"],
            "match_wins": matches["wins"],
            "matches_official": matches.get("official", 0),
            "matches_control": matches.get("control", 0),
            "assessments": assessments["sessions_count"],
            "enrollments": enrollments["count"],
            "trainings_created": trainings["count"],
        },
        "teams": [
            {
                "id": t.id,
                "name": t.name,
                "age_group": t.age_group or "",
                "coach_id": t.coach_id,
            }
            for t in teams
        ],
        "coaches": coach_rows,
        "attendance": attendance,
        "fees": fees,
        "missing_data": missing,
        "trainings": trainings,
        "matches": matches,
        "assessments": assessments,
        "enrollments": enrollments,
        "actions": actions,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def build_sport_pack(
    db: Session,
    *,
    club: Club,
    month_key: str,
    month_to: str | None = None,
    coach_id: int | None = None,
) -> dict[str, Any]:
    from_s, to_s, from_d, to_d, month_keys = period_date_bounds(month_key, month_to)
    teams = _teams_for_scope(db, club.id, coach_id)
    team_ids = [t.id for t in teams]
    matches = _matches_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    assessments = _assessments_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)

    # Short action signals only; detailed lists live in attendance / matches sections.
    flags = []
    low_n = len(attendance.get("low_attendance") or [])
    if low_n:
        flags.append(
            {
                "type": "attendance",
                "label": f"Ниско присъствие (<70%): {low_n} състезатели",
            }
        )
    if assessments.get("declined_count"):
        flags.append(
            {
                "type": "development",
                "label": f"Спад в development score: {assessments['declined_count']} състезатели",
            }
        )
    no_stats = [
        m
        for m in (matches.get("items") or [])
        if m.get("status") in ("finished", MatchStatus.finished.value)
        and int(m.get("event_count") or 0) == 0
    ]
    if no_stats:
        flags.append(
            {
                "type": "match_stats",
                "label": f"Завършени мачове без статистика: {len(no_stats)}",
            }
        )
        for m in no_stats[:6]:
            flags.append(
                {
                    "type": "match_stats",
                    "label": f"Без статистика: {m['team_name']} vs {m['opponent_name'] or '·'}",
                    "match_id": m["match_id"],
                }
            )

    return {
        "pack": "sport",
        "title": "Спортен отчет"
        + (f" · филтър треньор #{coach_id}" if coach_id else f" · {club.name}"),
        "month_key": month_keys[0],
        "month_to": month_keys[-1],
        "month_keys": month_keys,
        "from_date": from_s,
        "to_date": to_s,
        "club_id": club.id,
        "club_name": club.name,
        "coach_id": coach_id,
        "summary": {
            "teams": len(teams),
            "matches": matches["count"],
            "matches_finished": matches["finished"],
            "match_wins": matches["wins"],
            "match_losses": matches["losses"],
            "matches_with_stats": matches["with_stats"],
            "assessment_sessions": assessments["sessions_count"],
            "athletes_tested": assessments["athletes_tested"],
            "avg_development_score": assessments["avg_development_score"],
            "improved_count": assessments["improved_count"],
            "declined_count": assessments["declined_count"],
            "attendance_pct": attendance["attendance_pct"],
        },
        "matches": matches,
        "assessments": assessments,
        "attendance": {
            "sessions_count": attendance["sessions_count"],
            "sessions_with_attendance": attendance.get("sessions_with_attendance", 0),
            "sessions_without_attendance": attendance.get("sessions_without_attendance", 0),
            "attendance_pct": attendance["attendance_pct"],
            "by_team": attendance["by_team"],
            "low_attendance": attendance["low_attendance"],
        },
        "flags": flags[:50],
        "actions": [f["label"] for f in flags[:12]],
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def build_period_report(
    db: Session,
    *,
    club: Club,
    pack: PackLiteral,
    month_key: str,
    month_to: str | None = None,
    coach_id: int | None = None,
) -> dict[str, Any]:
    mk = parse_month_key(month_key)
    mt = parse_month_key(month_to) if month_to else None
    if pack == "coach":
        if not coach_id:
            raise ValueError("За пакет „треньор“ е нужен coach_id")
        coach = (
            db.query(User)
            .filter(
                User.id == int(coach_id),
                User.club_id == club.id,
                User.role.in_([UserRole.coach, UserRole.club_head_coach]),
            )
            .first()
        )
        if not coach:
            raise ValueError("Треньорът не е намерен в клуба")
        return build_coach_pack(db, club=club, coach=coach, month_key=mk, month_to=mt)
    if pack == "club":
        return build_club_pack(db, club=club, month_key=mk, month_to=mt)
    if pack == "sport":
        if coach_id:
            ok = (
                db.query(User.id)
                .filter(
                    User.id == int(coach_id),
                    User.club_id == club.id,
                    User.role.in_([UserRole.coach, UserRole.club_head_coach]),
                )
                .first()
            )
            if not ok:
                raise ValueError("Треньорът не е намерен в клуба")
        return build_sport_pack(db, club=club, month_key=mk, month_to=mt, coach_id=coach_id)
    raise ValueError("Невалиден пакет")


def _period_label(report: dict[str, Any]) -> str:
    mk = report.get("month_key") or ""
    mt = report.get("month_to") or mk
    if mt and mt != mk:
        return f"{mk} до {mt}"
    return str(mk)


def report_to_pdf_lines(report: dict[str, Any], *, variant: str = "management") -> list[str]:
    """variant: management | municipality."""
    summary = report.get("summary") or {}
    fees = report.get("fees") or {}
    att = report.get("attendance") or {}
    matches = report.get("matches") or {}
    missing = report.get("missing_data") or {}
    club_name = report.get("club_name") or ""
    period = _period_label(report)
    generated = report.get("generated_at") or ""

    if variant == "municipality":
        # Aggregates only: no debtor/EGN personal lists.
        age_counts: dict[str, int] = {}
        for t in report.get("teams") or []:
            ag = (t.get("age_group") or "Без група").strip() or "Без група"
            # Prefer athlete_count from by_team when available.
            age_counts[ag] = age_counts.get(ag, 0)
        for row in att.get("by_team") or []:
            team = next((t for t in (report.get("teams") or []) if t.get("id") == row.get("team_id")), None)
            ag = ((team or {}).get("age_group") or "Без група").strip() or "Без група"
            age_counts[ag] = age_counts.get(ag, 0) + int(row.get("athlete_count") or 0)
        if not age_counts and summary.get("athletes"):
            age_counts["Общо"] = int(summary.get("athletes") or 0)

        lines: list[str] = [
            f"Клуб: {club_name}",
            f"Период: {period} ({report.get('from_date')} - {report.get('to_date')})",
            f"Дата на генериране: {generated}",
            "",
            "ОБЩИНСКИ ОБОБЩЕН ОТЧЕТ (без лични данни)",
            "",
            f"Състезатели (общо): {summary.get('athletes')}",
            f"Отбори: {summary.get('teams')}",
            f"Треньори: {summary.get('coaches')}",
            f"Проведени сесии/тренировки: {att.get('sessions_count') or summary.get('sessions')}",
            f"Присъствие: {att.get('attendance_pct') if att else summary.get('attendance_pct')}%",
            f"Мачове: {matches.get('count') or summary.get('matches_finished')} "
            f"(официални {matches.get('official') or summary.get('matches_official')}, "
            f"контроли {matches.get('control') or summary.get('matches_control')})",
            f"Победи: {matches.get('wins') or summary.get('match_wins')}",
            "",
            "ДЕЦА / СЪСТАВ ПО ВЪЗРАСТОВИ ГРУПИ",
        ]
        for ag, cnt in sorted(age_counts.items(), key=lambda x: x[0]):
            lines.append(f"  {ag}: {cnt}")
        lines.extend(
            [
                "",
                "РЕЗУЛТАТИ ОТ МАЧОВЕ (обобщение)",
            ]
        )
        for m in (matches.get("items") or [])[:40]:
            lines.append(
                f"  {m.get('match_date')} {m.get('team_name')} vs {m.get('opponent_name') or '·'} "
                f"{m.get('sets_won_us')}:{m.get('sets_won_opp')}"
            )
        lines.extend(["", "Подпис / печат:", "", "______________________________"])
        return lines

    # management
    lines = [
        f"Клуб: {club_name}",
        f"Период: {period} ({report.get('from_date')} - {report.get('to_date')})",
        f"Дата на генериране: {generated}",
        f"Отчет: {report.get('title') or ''}",
        "",
        "УПРАВЛЕНСКИ ОТЧЕТ",
        "",
        "ОБОБЩЕНИЕ",
        f"  Отбори: {summary.get('teams')}",
        f"  Състезатели: {summary.get('athletes')}",
        f"  Треньори: {summary.get('coaches')}",
        f"  Сесии: {summary.get('sessions')}",
        f"  Присъствие %: {summary.get('attendance_pct')}",
        f"  Събрани такси: {fees.get('total_paid_amount') or summary.get('fees_collected_amount')}",
        f"  Очаквани такси: {fees.get('expected_amount') or summary.get('fees_expected_amount')}",
        f"  Събираемост %: {fees.get('collection_pct') or summary.get('fees_collection_pct')}",
        f"  Длъжници: {fees.get('unpaid') or summary.get('fees_unpaid')}",
        f"  Освободени: {fees.get('exempt') or summary.get('fees_exempt')}",
        f"  Мачове: {summary.get('matches_finished')} (победи {summary.get('match_wins')})",
    ]
    for a in report.get("actions") or []:
        lines.append(f"  За действие: {a}")

    if fees:
        lines.append("")
        lines.append(
            f"ТАКСИ: платени {fees.get('paid')}/{fees.get('billable')} "
            f"({fees.get('collection_pct')}%), събрани {fees.get('total_paid_amount')}, "
            f"освободени {fees.get('exempt')}"
        )
        for row in (fees.get("unpaid_athletes") or [])[:40]:
            lines.append(
                f"  длъжник: {row.get('athlete_name')} · {row.get('team_name') or ''} · "
                f"{row.get('amount_due')}"
            )
        for row in (fees.get("exempt_athletes") or [])[:40]:
            lines.append(f"  освободен: {row.get('athlete_name')} ({row.get('reason') or ''})")

    if att:
        lines.append("")
        lines.append(
            f"ПРИСЪСТВИЕ: сесии {att.get('sessions_count')}, % {att.get('attendance_pct')}, "
            f"присъствали {att.get('present')} · закъснели {att.get('late')} · "
            f"отсъствали {att.get('absent')} · извинени {att.get('excused')}"
        )
        for row in (att.get("low_attendance") or [])[:25]:
            lines.append(
                f"  ниско: {row.get('athlete_name')} {row.get('attendance_pct')}% "
                f"({row.get('marked')} записа)"
            )

    for c in report.get("coaches") or []:
        lines.append(
            f"  треньор {c.get('coach_name')}: отб. {c.get('teams')}, съст. {c.get('athletes')}, "
            f"прис. {c.get('attendance_pct')}%, такси {c.get('fees_collection_pct')}%, "
            f"очаквани/събрани {c.get('fees_expected_amount')}/{c.get('fees_collected_amount')}"
        )

    if matches:
        lines.append("")
        lines.append(
            f"МАЧОВЕ: {matches.get('count')} · завършени {matches.get('finished')} · "
            f"П {matches.get('wins')} / З {matches.get('losses')}"
        )
        for m in (matches.get("items") or [])[:40]:
            lines.append(
                f"  {m.get('match_date')} {m.get('team_name')} vs {m.get('opponent_name')} "
                f"{m.get('sets_won_us')}:{m.get('sets_won_opp')}"
            )

    if missing:
        lines.append("")
        lines.append(
            f"ЛИПСВАЩИ ДАННИ: без ЕГН {missing.get('no_egn_count')}, "
            f"без родител (под 18) {missing.get('no_parent_count')}, "
            f"без картотека БФВ {missing.get('no_bvf_count')}"
        )

    lines.extend(
        [
            "",
            "Място за подпис и печат:",
            "",
            "Подпис: _________________________     Печат: _________________________",
            "",
            "Име / длъжност: _______________________________________________",
        ]
    )
    return lines


def report_to_xlsx_rows(report: dict[str, Any]) -> dict[str, list[list[Any]]]:
    """4 sheets with numeric cells where possible."""
    summary = report.get("summary") or {}
    fees = report.get("fees") or {}
    att = report.get("attendance") or {}
    missing = report.get("missing_data") or {}
    sheets: dict[str, list[list[Any]]] = {}

    # Sheet 1
    obob: list[list[Any]] = [
        ["Поле", "Стойност"],
        ["Клуб", report.get("club_name") or ""],
        ["Период от", report.get("month_key") or ""],
        ["Период до", report.get("month_to") or report.get("month_key") or ""],
        ["Отбори", int(summary.get("teams") or 0)],
        ["Състезатели", int(summary.get("athletes") or 0)],
        ["Треньори", int(summary.get("coaches") or 0)],
        ["Сесии", int(summary.get("sessions") or 0)],
        ["Присъствие %", float(summary["attendance_pct"]) if summary.get("attendance_pct") is not None else None],
        ["Събрани такси", float(fees.get("total_paid_amount") or summary.get("fees_collected_amount") or 0)],
        ["Очаквани такси", float(fees.get("expected_amount") or summary.get("fees_expected_amount") or 0)],
        ["Събираемост %", float(fees["collection_pct"]) if fees.get("collection_pct") is not None else None],
        ["Длъжници", int(fees.get("unpaid") or 0)],
        ["Освободени", int(fees.get("exempt") or 0)],
        ["Мачове", int(summary.get("matches_finished") or 0)],
        ["Победи", int(summary.get("match_wins") or 0)],
    ]
    obob.append([])
    obob.append(["Треньор", "Отбори", "Състезатели", "Сесии", "Присъствие %", "Такси %", "Очаквани", "Събрани", "Дълг"])
    for c in report.get("coaches") or []:
        obob.append(
            [
                c.get("coach_name") or "",
                int(c.get("teams") or 0),
                int(c.get("athletes") or 0),
                int(c.get("sessions") or 0),
                float(c["attendance_pct"]) if c.get("attendance_pct") is not None else None,
                float(c["fees_collection_pct"]) if c.get("fees_collection_pct") is not None else None,
                float(c.get("fees_expected_amount") or 0),
                float(c.get("fees_collected_amount") or 0),
                int(c.get("fees_unpaid") or 0),
            ]
        )
    obob.append([])
    obob.append(["Отбор", "Треньор", "Състезатели", "Сесии", "Присъствие %"])
    for r in att.get("by_team") or []:
        obob.append(
            [
                r.get("team_name") or "",
                r.get("coach_name") or "",
                int(r.get("athlete_count") or 0),
                int(r.get("sessions_count") or 0),
                float(r["attendance_pct"]) if r.get("attendance_pct") is not None else None,
            ]
        )
    sheets["Обобщение"] = obob

    # Sheet 2 fees
    fee_sheet: list[list[Any]] = [
        ["Състезател", "Отбор", "Статус", "Дължима сума", "Платена сума", "Причина", "Месеци липсващи"]
    ]
    for r in fees.get("unpaid_athletes") or []:
        fee_sheet.append(
            [
                r.get("athlete_name") or "",
                r.get("team_name") or "",
                "Длъжник",
                float(r.get("amount_due") or 0),
                float(r.get("amount_paid") or 0),
                "",
                ",".join(r.get("months_missing") or []),
            ]
        )
    for r in fees.get("paid_athletes") or []:
        fee_sheet.append(
            [
                r.get("athlete_name") or "",
                r.get("team_name") or "",
                "Платил",
                float(r.get("amount_due") or 0),
                float(r.get("amount") or 0),
                "",
                "",
            ]
        )
    for r in fees.get("exempt_athletes") or []:
        fee_sheet.append(
            [
                r.get("athlete_name") or "",
                r.get("team_name") or "",
                "Освободен",
                0.0,
                0.0,
                r.get("reason") or "",
                "",
            ]
        )
    sheets["Такси и плащания"] = fee_sheet

    # Sheet 3 attendance
    att_sheet: list[list[Any]] = [
        ["Отбор", "Треньор", "Сесии", "Присъствали", "Закъснели", "Отсъствали", "Извинени", "Присъствие %"]
    ]
    for r in att.get("by_team") or []:
        att_sheet.append(
            [
                r.get("team_name") or "",
                r.get("coach_name") or "",
                int(r.get("sessions_count") or 0),
                int(r.get("present") or 0),
                int(r.get("late") or 0),
                int(r.get("absent") or 0),
                int(r.get("excused") or 0),
                float(r["attendance_pct"]) if r.get("attendance_pct") is not None else None,
            ]
        )
    att_sheet.append([])
    att_sheet.append(["Ниско присъствие", "Отбор", "%", "Записи", "П", "З", "О", "И"])
    for r in att.get("low_attendance") or []:
        att_sheet.append(
            [
                r.get("athlete_name") or "",
                r.get("team_name") or "",
                float(r["attendance_pct"]) if r.get("attendance_pct") is not None else None,
                int(r.get("marked") or 0),
                int(r.get("present") or 0),
                int(r.get("late") or 0),
                int(r.get("absent") or 0),
                int(r.get("excused") or 0),
            ]
        )
    sheets["Присъствия"] = att_sheet

    # Sheet 4 missing / card indexes
    miss_sheet: list[list[Any]] = [["Тип", "Състезател", "athlete_id"]]
    for r in missing.get("no_egn") or []:
        miss_sheet.append(["Без ЕГН", r.get("athlete_name") or "", int(r.get("athlete_id") or 0)])
    for r in missing.get("no_parent") or []:
        miss_sheet.append(
            ["Без родител (под 18 г.)", r.get("athlete_name") or "", int(r.get("athlete_id") or 0)]
        )
    for r in missing.get("no_bvf") or []:
        miss_sheet.append(["Без картотека (БФВ)", r.get("athlete_name") or "", int(r.get("athlete_id") or 0)])
    miss_sheet.append([])
    miss_sheet.append(["Брой без ЕГН", int(missing.get("no_egn_count") or 0)])
    miss_sheet.append(["Брой без родител", int(missing.get("no_parent_count") or 0)])
    miss_sheet.append(["Брой без БФВ", int(missing.get("no_bvf_count") or 0)])
    sheets["Картотеки и липсващи данни"] = miss_sheet

    return sheets
