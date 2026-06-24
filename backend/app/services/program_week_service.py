"""Сервиз „Моята програмна седмица" (Фаза 1, read-only).

Сглобява за треньора:
- активната годишна програма (ClubCycleInstance) на отбора;
- текущата позиция (мезо/седмица) по КАЛЕНДАРА (program_position);
- темите/фокуса за седмицата (от структурата на мезото — чисто, без БД);
- наслагване на програмните дни върху РЕАЛНИТЕ тренировъчни дати (пон–нед).

Без AI генериране, без запис в базата и без логика за присъствие.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import ClubCycleInstance, MethodCycle, Team, TeamSession, Training
from app.national_method.annual_program import (
    build_meso_structure,
    meso_definitions_for,
    resolve_annual_program_band,
)
from app.national_method import program_position as pos
from app.routers.parent_portal import _build_schedule_for_teams

_WEEKDAYS_BG = ["понеделник", "вторник", "сряда", "четвъртък", "петък", "събота", "неделя"]


def _meso_defn(defs: list[dict[str, Any]], meso_number: int) -> Optional[dict[str, Any]]:
    for d in defs:
        if int(d["meso_number"]) == int(meso_number):
            return d
    return None


def _week_node(structure: dict[str, Any], week_in_meso: int) -> Optional[dict[str, Any]]:
    for w in structure.get("weeks") or []:
        if int(w.get("week", 0)) == int(week_in_meso):
            return w
    weeks = structure.get("weeks") or []
    if 1 <= week_in_meso <= len(weeks):
        return weeks[week_in_meso - 1]
    return None


def _trainings_by_date(
    db: Session, team_id: int, from_iso: str, to_iso: str
) -> dict[str, dict[str, Any]]:
    """Генерирани/записани тренировки за отбора по дата (последната за деня печели)."""
    rows = (
        db.query(Training)
        .filter(
            Training.team_id == team_id,
            Training.session_date.isnot(None),
            Training.session_date >= from_iso,
            Training.session_date <= to_iso,
        )
        .order_by(Training.id.asc())
        .all()
    )
    out: dict[str, dict[str, Any]] = {}
    for t in rows:
        status = t.status.value if hasattr(t.status, "value") else t.status
        out[t.session_date] = {"id": t.id, "title": t.title, "status": status}
    return out


def _session_dates(db: Session, team_id: int, from_iso: str, to_iso: str) -> set[str]:
    """Дати с въведена реална сесия (TeamSession) за отбора в интервала."""
    rows = (
        db.query(TeamSession.date)
        .filter(
            TeamSession.team_id == team_id,
            TeamSession.date >= from_iso,
            TeamSession.date <= to_iso,
        )
        .all()
    )
    return {r[0] for r in rows}


def _season_progress(
    db: Session,
    team_id: int,
    start_date: date,
    today: date,
    position: dict[str, Any],
) -> Optional[dict[str, Any]]:
    """Изпълнение от старта до днес: планирани vs проведени тренировки."""
    if not position.get("started"):
        return {
            "started": False,
            "planned": 0,
            "executed": 0,
            "rate_pct": 0,
            "weeks_elapsed": 0,
            "meso_index": position.get("meso_index"),
            "total_mesos": position.get("total_mesos"),
        }
    season_from = pos.monday_of(start_date)
    if today < season_from:
        return None
    schedule = _build_schedule_for_teams(
        db, [team_id], season_from.isoformat(), today.isoformat()
    )
    planned_dates = {
        s.date
        for s in schedule
        if getattr(s, "event_type", "training") == "training"
        and not getattr(s, "is_cancelled", False)
    }
    session_dates = _session_dates(db, team_id, season_from.isoformat(), today.isoformat())
    executed = len(planned_dates & session_dates)
    planned = len(planned_dates)
    rate = round(100 * executed / planned) if planned else 0
    weeks_elapsed = (pos.monday_of(today) - season_from).days // 7 + 1
    return {
        "started": True,
        "planned": planned,
        "executed": executed,
        "rate_pct": rate,
        "weeks_elapsed": weeks_elapsed,
        "meso_index": position.get("meso_index"),
        "total_mesos": position.get("total_mesos"),
    }


def _active_instance_for_team(db: Session, team_id: int) -> Optional[ClubCycleInstance]:
    return (
        db.query(ClubCycleInstance)
        .filter(
            ClubCycleInstance.team_id == team_id,
            ClubCycleInstance.status == "active",
        )
        .order_by(ClubCycleInstance.id.desc())
        .first()
    )


def build_program_week(
    db: Session,
    team: Team,
    *,
    week_offset: int = 0,
    today: Optional[date] = None,
) -> dict[str, Any]:
    """Главен вход. Връща dict, който огледално пасва на ProgramWeekOut."""
    today = today or date.today()
    ref_date = today + timedelta(days=7 * int(week_offset or 0))
    monday = pos.monday_of(ref_date)
    sunday = monday + timedelta(days=6)
    window = {
        "from_date": monday.isoformat(),
        "to_date": sunday.isoformat(),
        "week_offset": int(week_offset or 0),
    }

    base = {
        "has_program": False,
        "team_id": team.id,
        "team_name": team.name,
        "window": window,
        "message": "Няма активна годишна програма за този отбор.",
        "days": [],
        "unmapped_days": [],
        "extra_trainings": 0,
    }

    inst = _active_instance_for_team(db, team.id)
    if not inst:
        return base

    cycle = db.query(MethodCycle).filter(MethodCycle.id == inst.cycle_id).first()
    if not cycle:
        return base

    cycle_struct = cycle.structure_json or {}
    band = resolve_annual_program_band(cycle.age_band or team.age_group)
    defs = meso_definitions_for(band)
    if not defs:
        return base

    start_date = pos.parse_iso_date(inst.start_date) or today

    # Стартов мезо: override (customizations_json.start_meso) > мезо на зададения цикъл > по месец.
    custom = inst.customizations_json or {}
    override = custom.get("start_meso")
    if override is None and cycle_struct.get("meso_number"):
        override = cycle_struct.get("meso_number")

    position = pos.resolve_position(
        defs, start_date, ref_date, start_meso_override=override
    )

    has_program = True
    meso_number = position.get("meso_number")
    week_in_meso = position.get("week_in_meso") or 0
    defn = _meso_defn(defs, meso_number) if meso_number else None

    week_node: Optional[dict[str, Any]] = None
    program_days: list[dict[str, Any]] = []
    if defn is not None:
        structure = build_meso_structure(defn, band)
        node = _week_node(structure, max(week_in_meso, 1))
        week_node = node
        if node:
            program_days = list(node.get("days") or [])

    # Реални тренировки за прозореца (пон–нед).
    schedule = _build_schedule_for_teams(
        db, [team.id], window["from_date"], window["to_date"]
    )
    trainings = sorted(
        [s for s in schedule if getattr(s, "event_type", "training") == "training"],
        key=lambda s: (s.date, s.start_time or ""),
    )

    # Изпълнение: кои дати в прозореца имат реална сесия.
    window_sessions = _session_dates(
        db, team.id, window["from_date"], window["to_date"]
    )

    # Генерирани тренировки за прозореца по дата (за бутоните „Продължи"/„Генерирай").
    window_trainings = _trainings_by_date(
        db, team.id, window["from_date"], window["to_date"]
    )

    def _exec_status(date_iso: str) -> str:
        if date_iso in window_sessions:
            return "done"
        d = pos.parse_iso_date(date_iso)
        if d and d < today:
            return "missed"
        return "upcoming"

    # Наслагване: програмен ден i ↔ i-тата реална тренировка в седмицата.
    days_out: list[dict[str, Any]] = []
    n_mapped = min(len(trainings), len(program_days))
    for i in range(len(trainings)):
        s = trainings[i]
        pd = program_days[i] if i < len(program_days) else None
        d = pos.parse_iso_date(s.date)
        tr = window_trainings.get(s.date)
        days_out.append(
            {
                "date": s.date,
                "weekday_label": _WEEKDAYS_BG[d.weekday()] if d else None,
                "start_time": s.start_time,
                "end_time": s.end_time,
                "location": s.location,
                "is_cancelled": bool(getattr(s, "is_cancelled", False)),
                "execution_status": _exec_status(s.date),
                "training_id": (tr or {}).get("id"),
                "training_status": (tr or {}).get("status"),
                "has_program_day": pd is not None,
                "day_label": (pd or {}).get("label"),
                "theme": (pd or {}).get("theme"),
                "focus": list((pd or {}).get("focus") or []),
                "session_goal": (pd or {}).get("session_goal"),
                "intensity": (pd or {}).get("intensity"),
                "textbook_slug": (pd or {}).get("textbook_slug"),
            }
        )

    # Седмично резюме: изпълнени програмни теми / общо програмни теми с дата.
    week_mapped = sum(1 for d in days_out if d["has_program_day"])
    week_done = sum(
        1 for d in days_out if d["has_program_day"] and d["execution_status"] == "done"
    )

    # Програмни дни без реална дата (повече теми, отколкото тренировки).
    unmapped: list[dict[str, Any]] = []
    for i in range(n_mapped, len(program_days)):
        pd = program_days[i]
        unmapped.append(
            {
                "day_label": pd.get("label"),
                "theme": pd.get("theme"),
                "focus": list(pd.get("focus") or []),
                "session_goal": pd.get("session_goal"),
                "intensity": pd.get("intensity"),
                "textbook_slug": pd.get("textbook_slug"),
            }
        )

    extra_trainings = max(0, len(trainings) - len(program_days))

    message = None
    if not position.get("started"):
        wk = position.get("weeks_until_start")
        message = (
            f"Програмата започва на {start_date.isoformat()}"
            + (f" (след {wk} седм.)" if wk else "")
        )
    elif position.get("completed"):
        message = "Годишната програма е към края си (последен мезо)."
    elif not trainings:
        message = "Няма насрочени тренировки за тази седмица."

    progress = _season_progress(db, team.id, start_date, today, position)

    period = (defn or {}).get("period")
    return {
        "has_program": has_program,
        "team_id": team.id,
        "team_name": team.name,
        "cycle_title": cycle.title_bg,
        "age_band": band,
        "start_date": start_date.isoformat(),
        "meso_number": meso_number,
        "meso_index": position.get("meso_index"),
        "total_mesos": position.get("total_mesos"),
        "meso_theme": (defn or {}).get("theme"),
        "period": period,
        "period_label": (cycle_struct.get("period_label") if period else None),
        "months_bg": (defn or {}).get("months_bg"),
        "week_in_meso": week_in_meso,
        "weeks_per_meso": pos.WEEKS_PER_MESO,
        "week_theme": (week_node or {}).get("theme"),
        "week_focus": list((week_node or {}).get("focus") or []),
        "week_load": (week_node or {}).get("load"),
        "week_done": week_done,
        "week_mapped": week_mapped,
        "started": bool(position.get("started")),
        "completed": bool(position.get("completed")),
        "window": window,
        "days": days_out,
        "unmapped_days": unmapped,
        "extra_trainings": extra_trainings,
        "progress": progress,
        "message": message,
    }
