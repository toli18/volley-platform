"""Месечни отчети за главен треньор: пакет треньор / клуб / спортен."""
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from app.models import (
    Athlete,
    AthletePayment,
    AttendanceRecord,
    Club,
    ClubEnrollmentRequest,
    Team,
    TeamSession,
    Training,
    User,
    UserRole,
)
from app.models_assessment import AssessmentResult, AssessmentSession, DevelopmentScore
from app.models_matches import Match, MatchSet, MatchStatus, MatchStatEvent
from app.services.fee_exemption import athlete_fee_exempt_for_month
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
    team_name = {t.id: t.name for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}
    by_team = []
    for tid in team_ids:
        tc = by_team_counts.get(tid, {"present": 0, "late": 0, "absent": 0, "excused": 0, "marked": 0})
        att = tc["present"] + tc["late"]
        by_team.append(
            {
                "team_id": tid,
                "team_name": team_name.get(tid, ""),
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
    low = []
    for aid, am in athlete_marks.items():
        if am["marked"] < 3:
            continue
        att = am["present"] + am["late"]
        pct = _pct(att, am["marked"])
        if pct is not None and pct < 70:
            low.append(
                {
                    "athlete_id": aid,
                    "athlete_name": names.get(aid, ""),
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


def _fees_block(
    db: Session,
    *,
    club: Club | None,
    athletes: list[Athlete],
    month_key: str,
) -> dict[str, Any]:
    billable = []
    exempt = []
    for a in athletes:
        is_ex, reason = athlete_fee_exempt_for_month(a, club, month_key)
        if is_ex:
            reason_s = reason.value if hasattr(reason, "value") else (str(reason) if reason else "")
            exempt.append({"athlete_id": a.id, "athlete_name": a.athlete_name, "reason": reason_s})
        else:
            billable.append(a)

    paid_map: dict[int, AthletePayment] = {}
    if billable:
        payments = (
            db.query(AthletePayment)
            .filter(
                AthletePayment.athlete_id.in_([a.id for a in billable]),
                AthletePayment.month_key == month_key,
            )
            .all()
        )
        paid_map = {p.athlete_id: p for p in payments}

    unpaid = []
    total_paid = 0.0
    for a in billable:
        p = paid_map.get(a.id)
        if p:
            total_paid += float(p.amount or 0)
        else:
            unpaid.append({"athlete_id": a.id, "athlete_name": a.athlete_name, "coach_id": a.coach_id})

    return {
        "month_key": month_key,
        "billable": len(billable),
        "paid": len(paid_map),
        "unpaid": len(unpaid),
        "exempt": len(exempt),
        "total_paid_amount": round(total_paid, 2),
        "collection_pct": _pct(len(paid_map), len(billable)),
        "unpaid_athletes": unpaid[:80],
        "exempt_athletes": exempt[:40],
    }


def _missing_data(athletes: list[Athlete]) -> dict[str, Any]:
    no_egn = []
    no_parent = []
    no_bvf = []
    for a in athletes:
        if not (a.egn or "").strip():
            no_egn.append({"athlete_id": a.id, "athlete_name": a.athlete_name})
        if not (a.parent_name or "").strip() and not (getattr(a, "parent_phone", None) or "").strip():
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
        return {"count": 0, "finished": 0, "wins": 0, "losses": 0, "with_stats": 0, "items": []}

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
) -> dict[str, Any]:
    from_s, to_s, from_d, to_d = month_date_bounds(month_key)
    teams = _teams_for_scope(db, club.id, coach.id)
    athletes = _athletes_for_scope(db, club.id, coach.id)
    team_ids = [t.id for t in teams]
    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)
    fees = _fees_block(db, club=club, athletes=athletes, month_key=month_key)
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
        "month_key": month_key,
        "from_date": from_s,
        "to_date": to_s,
        "club_id": club.id,
        "club_name": club.name,
        "coach": {"id": coach.id, "name": coach.name or "", "email": coach.email or ""},
        "summary": {
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
            "fees_collection_pct": fees["collection_pct"],
            "unpaid": fees["unpaid"],
            "matches_finished": matches["finished"],
            "match_wins": matches["wins"],
            "assessments": assessments["sessions_count"],
            "trainings_created": trainings["count"],
        },
        "teams": [{"id": t.id, "name": t.name, "age_group": t.age_group or ""} for t in teams],
        "attendance": attendance,
        "fees": fees,
        "missing_data": missing,
        "trainings": trainings,
        "matches": matches,
        "assessments": assessments,
        "actions": actions,
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


def build_club_pack(db: Session, *, club: Club, month_key: str) -> dict[str, Any]:
    from_s, to_s, from_d, to_d = month_date_bounds(month_key)
    coaches = _club_coaches(db, club.id)
    teams = _teams_for_scope(db, club.id, None)
    athletes = _athletes_for_scope(db, club.id, None)
    team_ids = [t.id for t in teams]

    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)
    fees = _fees_block(db, club=club, athletes=athletes, month_key=month_key)
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
        c_fees = _fees_block(db, club=club, athletes=c_athletes, month_key=month_key)
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
        "month_key": month_key,
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
            "fees_collection_pct": fees["collection_pct"],
            "unpaid": fees["unpaid"],
            "total_paid_amount": fees["total_paid_amount"],
            "matches_finished": matches["finished"],
            "match_wins": matches["wins"],
            "assessments": assessments["sessions_count"],
            "enrollments": enrollments["count"],
            "trainings_created": trainings["count"],
        },
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
    coach_id: int | None = None,
) -> dict[str, Any]:
    from_s, to_s, from_d, to_d = month_date_bounds(month_key)
    teams = _teams_for_scope(db, club.id, coach_id)
    team_ids = [t.id for t in teams]
    matches = _matches_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    assessments = _assessments_block(db, team_ids=team_ids, from_d=from_d, to_d=to_d)
    attendance = _attendance_block(db, team_ids=team_ids, from_date=from_s, to_date=to_s)

    # Red flags: low attendance athletes who also played matches / tests
    flags = []
    for row in attendance.get("low_attendance") or []:
        flags.append(
            {
                "type": "attendance",
                "label": f"Ниско присъствие: {row['athlete_name']} ({row['attendance_pct']}%)",
                "athlete_id": row["athlete_id"],
            }
        )
    if assessments.get("declined_count"):
        flags.append(
            {
                "type": "development",
                "label": f"Спад в development score: {assessments['declined_count']} състезатели",
            }
        )
    for m in matches.get("items") or []:
        if m.get("status") in ("finished", MatchStatus.finished.value) and int(m.get("event_count") or 0) == 0:
            flags.append(
                {
                    "type": "match_stats",
                    "label": f"Без статистика: {m['team_name']} vs {m['opponent_name'] or '—'}",
                    "match_id": m["match_id"],
                }
            )

    return {
        "pack": "sport",
        "title": "Спортен отчет"
        + (f" · филтър треньор #{coach_id}" if coach_id else f" · {club.name}"),
        "month_key": month_key,
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
    coach_id: int | None = None,
) -> dict[str, Any]:
    mk = parse_month_key(month_key)
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
        return build_coach_pack(db, club=club, coach=coach, month_key=mk)
    if pack == "club":
        return build_club_pack(db, club=club, month_key=mk)
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
        return build_sport_pack(db, club=club, month_key=mk, coach_id=coach_id)
    raise ValueError("Невалиден пакет")


def report_to_pdf_lines(report: dict[str, Any]) -> list[str]:
    lines: list[str] = [
        f"Период: {report.get('month_key')} ({report.get('from_date')} – {report.get('to_date')})",
        f"Клуб: {report.get('club_name') or ''}",
        f"Генериран: {report.get('generated_at') or ''}",
        "",
        "ОБОБЩЕНИЕ",
    ]
    summary = report.get("summary") or {}
    for k, v in summary.items():
        lines.append(f"  {k}: {v}")

    actions = report.get("actions") or []
    if actions:
        lines.append("")
        lines.append("ЗА ДЕЙСТВИЕ")
        for a in actions:
            lines.append(f"  · {a}")

    fees = report.get("fees")
    if fees:
        lines.append("")
        lines.append(
            f"ТАКСИ: платени {fees.get('paid')}/{fees.get('billable')} "
            f"({fees.get('collection_pct')}%), събрани {fees.get('total_paid_amount')}, "
            f"освободени {fees.get('exempt')}"
        )
        for row in (fees.get("unpaid_athletes") or [])[:40]:
            lines.append(f"  длъжник: {row.get('athlete_name')}")
        for row in (fees.get("exempt_athletes") or [])[:40]:
            reason = row.get("reason") or ""
            lines.append(
                f"  освободен: {row.get('athlete_name')}"
                + (f" ({reason})" if reason else "")
            )

    att = report.get("attendance")
    if att:
        lines.append("")
        lines.append(
            f"ПРИСЪСТВИЕ: сесии {att.get('sessions_count')} "
            f"(с прис. {att.get('sessions_with_attendance')}, "
            f"без {att.get('sessions_without_attendance')}), "
            f"% {att.get('attendance_pct')}, "
            f"П {att.get('present')} / З {att.get('late')} / О {att.get('absent')} / И {att.get('excused')}"
        )
        for row in (att.get("low_attendance") or [])[:25]:
            lines.append(
                f"  ниско: {row.get('athlete_name')} {row.get('attendance_pct')}% "
                f"({row.get('marked')} записа)"
            )

    coaches = report.get("coaches")
    if coaches:
        lines.append("")
        lines.append("ТРЕНЬОРИ")
        for c in coaches:
            lines.append(
                f"  {c.get('coach_name')}: отбори {c.get('teams')}, съст. {c.get('athletes')}, "
                f"прис. {c.get('attendance_pct')}%, такси {c.get('fees_collection_pct')}%, "
                f"мачове {c.get('matches_finished')} (П {c.get('match_wins')})"
            )

    matches = report.get("matches")
    if matches:
        lines.append("")
        lines.append(
            f"МАЧОВЕ: {matches.get('count')} · завършени {matches.get('finished')} · "
            f"П {matches.get('wins')} / З {matches.get('losses')} · със стат. {matches.get('with_stats')}"
        )
        for m in (matches.get("items") or [])[:40]:
            lines.append(
                f"  {m.get('match_date')} {m.get('team_name')} vs {m.get('opponent_name')} "
                f"{m.get('sets_won_us')}:{m.get('sets_won_opp')} · {m.get('status')} · "
                f"съб. {m.get('event_count')}"
            )

    assessments = report.get("assessments")
    if assessments:
        lines.append("")
        lines.append(
            f"ТЕСТОВЕ: сесии {assessments.get('sessions_count')}, "
            f"тествани {assessments.get('athletes_tested')}, "
            f"ср. score {assessments.get('avg_development_score')}, "
            f"+{assessments.get('improved_count')} / −{assessments.get('declined_count')}"
        )

    missing = report.get("missing_data")
    if missing:
        lines.append("")
        lines.append(
            f"ЛИПСВАЩИ ДАННИ: без ЕГН {missing.get('no_egn_count')}, "
            f"без родител {missing.get('no_parent_count')}, без BVF {missing.get('no_bvf_count')}"
        )

    return lines


def report_to_xlsx_rows(report: dict[str, Any]) -> dict[str, list[list[Any]]]:
    """Sheet name -> rows (first row header)."""
    sheets: dict[str, list[list[Any]]] = {}
    summary = report.get("summary") or {}
    sheets["Обобщение"] = [["Ключ", "Стойност"], *[[k, v] for k, v in summary.items()]]
    sheets["Обобщение"].extend([["title", report.get("title")], ["month", report.get("month_key")]])

    if report.get("actions"):
        sheets["Действия"] = [["Действие"], *[[a] for a in report["actions"]]]

    if report.get("coaches"):
        sheets["Треньори"] = [
            [
                "Треньор",
                "Роля",
                "Отбори",
                "Състезатели",
                "Сесии",
                "Присъствие %",
                "Такси %",
                "Неплатили",
                "Мачове",
                "Победи",
            ]
        ]
        for c in report["coaches"]:
            sheets["Треньори"].append(
                [
                    c.get("coach_name"),
                    c.get("role"),
                    c.get("teams"),
                    c.get("athletes"),
                    c.get("sessions"),
                    c.get("attendance_pct"),
                    c.get("fees_collection_pct"),
                    c.get("fees_unpaid"),
                    c.get("matches_finished"),
                    c.get("match_wins"),
                ]
            )

    fees = report.get("fees") or {}
    if fees.get("unpaid_athletes"):
        sheets["Длъжници"] = [["Състезател", "athlete_id"]]
        for r in fees["unpaid_athletes"]:
            sheets["Длъжници"].append([r.get("athlete_name"), r.get("athlete_id")])

    att = report.get("attendance") or {}
    if att.get("by_team"):
        sheets["Присъствие отбори"] = [
            ["Отбор", "Сесии", "П", "З", "О", "И", "%"],
        ]
        for r in att["by_team"]:
            sheets["Присъствие отбори"].append(
                [
                    r.get("team_name"),
                    r.get("sessions_count"),
                    r.get("present"),
                    r.get("late"),
                    r.get("absent"),
                    r.get("excused"),
                    r.get("attendance_pct"),
                ]
            )
    if att.get("low_attendance"):
        sheets["Ниско присъствие"] = [["Състезател", "%", "Записи", "П", "З", "О", "И"]]
        for r in att["low_attendance"]:
            sheets["Ниско присъствие"].append(
                [
                    r.get("athlete_name"),
                    r.get("attendance_pct"),
                    r.get("marked"),
                    r.get("present"),
                    r.get("late"),
                    r.get("absent"),
                    r.get("excused"),
                ]
            )

    matches = report.get("matches") or {}
    if matches.get("items"):
        sheets["Мачове"] = [
            ["Дата", "Отбор", "Противник", "Резултат", "Статус", "Събития", "Победител"],
        ]
        for m in matches["items"]:
            sheets["Мачове"].append(
                [
                    m.get("match_date"),
                    m.get("team_name"),
                    m.get("opponent_name"),
                    f"{m.get('sets_won_us')}:{m.get('sets_won_opp')}",
                    m.get("status"),
                    m.get("event_count"),
                    m.get("won_by") or "",
                ]
            )

    assessments = report.get("assessments") or {}
    if assessments.get("sessions"):
        sheets["Тестове"] = [["Дата", "Отбор", "Статус", "window_id", "session_id"]]
        for s in assessments["sessions"]:
            sheets["Тестове"].append(
                [
                    s.get("conducted_on"),
                    s.get("team_name"),
                    s.get("status"),
                    s.get("window_id"),
                    s.get("session_id"),
                ]
            )

    missing = report.get("missing_data") or {}
    if missing.get("no_egn") or missing.get("no_parent"):
        sheets["Липсващи данни"] = [["Тип", "Състезател", "athlete_id"]]
        for r in missing.get("no_egn") or []:
            sheets["Липсващи данни"].append(["без ЕГН", r.get("athlete_name"), r.get("athlete_id")])
        for r in missing.get("no_parent") or []:
            sheets["Липсващи данни"].append(["без родител", r.get("athlete_name"), r.get("athlete_id")])

    return sheets
