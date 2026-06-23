# backend/app/services/assessment_dashboard.py
"""Methodical Assessment Layer v1 — федеративно табло (агрегации).

Връща 6-те национални плочки **само агрегирано**, без лични данни на дете:
  1. Покритие              — обхват на диагностиката (атлети/отбори).
  2. Развитие по възраст    — средна делта/ниво по U-група.
  3. Приемане               — дял отбори с активна годишна програма.
  4. Национални репери      — средна сурова стойност по тест × възраст × пол.
  5. Лидери и риск          — топ/долни отбори по Методически Индекс (отборно ниво).
  6. Дисциплина на измерване — среден дял тествани от състава.

Малките проби се маркират с `is_indicative=True`, за да не се вадят
прибързани изводи (виж най-рисковата част в DEV_PLAN — cold-start).
Само четене; не пише в базата.
"""
from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    Club,
    ClubCycleInstance,
    DevelopmentScore,
    MethodicalIndexSnapshot,
    Team,
    TestDefinition,
    User,
)
from app.models_assessment import TestCategory, TestDirection
from app.national_method.bulgaria_regions import REGIONS, UNASSIGNED, region_for_city
from app.services.assessment_scoring import (
    age_band_from_birth_year,
    window_sort_key,
)

# Прагове за етикета „индикативни данни".
MIN_TILE_SAMPLE = 5  # под този брой плочката е индикативна
MIN_NORM_SAMPLE = 20  # националните репери искат повече проби
LEADERS_LIMIT = 5
PARTICIPATION_LOW = 70.0  # под този дял измерени тестът се маркира като пропускан


def _avg(values: list[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    return round(statistics.fmean(vals), 1)


def resolve_window(db: Session, window_id: Optional[int]) -> Optional[AssessmentWindow]:
    """Връща явно подадения прозорец или последния (по сезон/фаза) с резултати."""
    if window_id is not None:
        return db.query(AssessmentWindow).filter(AssessmentWindow.id == window_id).first()

    windows = db.query(AssessmentWindow).all()
    if not windows:
        return None
    # Само прозорци, които имат поне един резултат.
    with_data = {
        w_id
        for (w_id,) in db.query(AssessmentSession.window_id)
        .join(AssessmentResult, AssessmentResult.session_id == AssessmentSession.id)
        .distinct()
        .all()
    }
    candidates = [w for w in windows if w.id in with_data] or windows
    candidates.sort(key=window_sort_key)
    return candidates[-1]


def _window_label(window: AssessmentWindow) -> str:
    phase = window.phase.value if hasattr(window.phase, "value") else window.phase
    phase_bg = {"baseline": "Входящо", "mid": "Междинно", "endline": "Изходящо"}.get(phase, phase)
    return f"{window.season} · {phase_bg}"


# =========================
# Плочки
# =========================
def _coverage(db: Session, window: AssessmentWindow, gender: Optional[str]) -> dict:
    tested_q = (
        db.query(AssessmentResult.athlete_id)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(AssessmentSession.window_id == window.id)
    )
    tested_ids = {a for (a,) in tested_q.distinct().all()}

    teams_tested = {
        t
        for (t,) in db.query(AssessmentSession.team_id)
        .filter(AssessmentSession.window_id == window.id)
        .distinct()
        .all()
    }

    athletes_total_q = db.query(func.count(Athlete.id)).filter(Athlete.is_active.is_(True))
    if gender:
        athletes_total_q = athletes_total_q.filter(Athlete.gender == gender)
    athletes_total = athletes_total_q.scalar() or 0

    teams_total = (
        db.query(func.count(Team.id)).filter(Team.is_active.is_(True)).scalar() or 0
    )

    athletes_tested = len(tested_ids)
    coverage_pct = (
        round(min(athletes_tested / athletes_total, 1.0) * 100, 1)
        if athletes_total > 0
        else None
    )
    return {
        "athletes_tested": athletes_tested,
        "athletes_total": athletes_total,
        "teams_tested": len(teams_tested),
        "teams_total": teams_total,
        "coverage_pct": coverage_pct,
        "is_indicative": athletes_tested < MIN_TILE_SAMPLE,
    }


def _development_by_age(
    db: Session, window: AssessmentWindow, gender: Optional[str], age_band: Optional[str]
) -> list[dict]:
    rows = (
        db.query(
            DevelopmentScore.development_score,
            DevelopmentScore.delta,
            Athlete.birth_year,
            Athlete.gender,
        )
        .join(Athlete, Athlete.id == DevelopmentScore.athlete_id)
        .filter(DevelopmentScore.window_id == window.id)
        .all()
    )

    buckets: dict[str, dict[str, list]] = defaultdict(lambda: {"scores": [], "deltas": []})
    for score, delta, birth_year, ath_gender in rows:
        if gender and ath_gender != gender:
            continue
        band = age_band_from_birth_year(birth_year) or "—"
        if age_band and band != age_band:
            continue
        buckets[band]["scores"].append(score)
        buckets[band]["deltas"].append(delta)

    out = []
    for band, data in buckets.items():
        sample = len([s for s in data["scores"] if s is not None])
        out.append(
            {
                "age_band": band,
                "avg_delta": _avg(data["deltas"]),
                "avg_score": _avg(data["scores"]),
                "sample": sample,
                "is_indicative": sample < MIN_TILE_SAMPLE,
            }
        )
    out.sort(key=lambda r: r["age_band"])
    return out


def _adoption(db: Session, window: AssessmentWindow) -> dict:
    snaps = (
        db.query(MethodicalIndexSnapshot.adoption)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
        )
        .all()
    )
    adoptions = [a for (a,) in snaps if a is not None]
    teams_with_program = len([a for a in adoptions if a >= 100.0])
    # Резерв: ако още няма snapshot-и, броим директно активните програми.
    if not adoptions:
        teams_with_program = (
            db.query(func.count(func.distinct(ClubCycleInstance.team_id)))
            .filter(ClubCycleInstance.status == "active")
            .scalar()
            or 0
        )
    teams_total = db.query(func.count(Team.id)).filter(Team.is_active.is_(True)).scalar() or 0
    return {
        "avg_adoption": _avg(adoptions),
        "teams_with_program": teams_with_program,
        "teams_total": teams_total,
        "is_indicative": len(adoptions) < MIN_TILE_SAMPLE,
    }


def _norms(
    db: Session, window: AssessmentWindow, gender: Optional[str], age_band: Optional[str]
) -> list[dict]:
    rows = (
        db.query(
            AssessmentResult.test_code,
            AssessmentResult.raw_value,
            Athlete.birth_year,
            Athlete.gender,
        )
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.raw_value.isnot(None),
        )
        .all()
    )

    test_names = {
        code: name for (code, name) in db.query(TestDefinition.code, TestDefinition.name).all()
    }

    buckets: dict[tuple, list[float]] = defaultdict(list)
    for test_code, raw_value, birth_year, ath_gender in rows:
        if gender and ath_gender != gender:
            continue
        band = age_band_from_birth_year(birth_year) or "—"
        if age_band and band != age_band:
            continue
        g = ath_gender or "—"
        buckets[(test_code, band, g)].append(raw_value)

    out = []
    for (test_code, band, g), values in buckets.items():
        sample = len(values)
        out.append(
            {
                "test_code": test_code,
                "test_name": test_names.get(test_code, test_code),
                "age_band": band,
                "gender": g,
                "mean_value": round(statistics.fmean(values), 2) if values else None,
                "sample": sample,
                "is_indicative": sample < MIN_NORM_SAMPLE,
            }
        )
    out.sort(key=lambda r: (r["test_code"], r["age_band"], r["gender"]))
    return out


def _leaders_risk(db: Session, window: AssessmentWindow) -> dict:
    rows = (
        db.query(MethodicalIndexSnapshot.subject_id, MethodicalIndexSnapshot.methodical_index, Team.name)
        .join(Team, Team.id == MethodicalIndexSnapshot.subject_id)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
            MethodicalIndexSnapshot.methodical_index.isnot(None),
        )
        .all()
    )
    ranked = sorted(rows, key=lambda r: r[1], reverse=True)

    def _row(item):
        return {"team_id": item[0], "team_name": item[2], "methodical_index": item[1]}

    leaders = [_row(r) for r in ranked[:LEADERS_LIMIT]]
    risk = [_row(r) for r in ranked[-LEADERS_LIMIT:][::-1]] if len(ranked) > LEADERS_LIMIT else []
    return {"leaders": leaders, "risk": risk}


def _team_city_map(db: Session, team_ids: set[int]) -> dict[int, Optional[str]]:
    """Връща team_id → град на клуба (по Team.club_id, иначе по клуба на треньора)."""
    if not team_ids:
        return {}
    teams = (
        db.query(Team.id, Team.club_id, Team.coach_id)
        .filter(Team.id.in_(team_ids))
        .all()
    )
    club_ids = {club_id for (_, club_id, _) in teams if club_id is not None}
    coach_ids = {coach_id for (_, club_id, coach_id) in teams if club_id is None and coach_id}

    # Клубове на треньорите като резерв, когато отборът няма пряк club_id.
    coach_club = {}
    if coach_ids:
        for uid, c_id in db.query(User.id, User.club_id).filter(User.id.in_(coach_ids)).all():
            coach_club[uid] = c_id
            if c_id is not None:
                club_ids.add(c_id)

    club_city = {}
    if club_ids:
        for c_id, city in db.query(Club.id, Club.city).filter(Club.id.in_(club_ids)).all():
            club_city[c_id] = city

    out: dict[int, Optional[str]] = {}
    for team_id, club_id, coach_id in teams:
        resolved_club = club_id if club_id is not None else coach_club.get(coach_id)
        out[team_id] = club_city.get(resolved_club) if resolved_club is not None else None
    return out


def _regional_index(db: Session, window: AssessmentWindow) -> list[dict]:
    """Регионален rollup на Методическия Индекс: среден индекс по регион,
    като отбор → клуб → град → регион (6-те структури на БФВ)."""
    rows = (
        db.query(MethodicalIndexSnapshot.subject_id, MethodicalIndexSnapshot.methodical_index)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
            MethodicalIndexSnapshot.methodical_index.isnot(None),
        )
        .all()
    )
    team_ids = {team_id for (team_id, _) in rows}
    city_map = _team_city_map(db, team_ids)

    buckets: dict[str, list[float]] = defaultdict(list)
    for team_id, mi in rows:
        region = region_for_city(city_map.get(team_id)) or UNASSIGNED
        buckets[region].append(mi)

    out = []
    # Винаги връщаме 6-те региона (дори празни), плюс „Неразпределен" ако има.
    for region in [*REGIONS, UNASSIGNED]:
        vals = buckets.get(region, [])
        if region == UNASSIGNED and not vals:
            continue
        out.append(
            {
                "region": region,
                "avg_index": _avg(vals),
                "teams": len(vals),
                "is_indicative": len(vals) < MIN_TILE_SAMPLE,
            }
        )
    return out


def _discipline(db: Session, window: AssessmentWindow) -> dict:
    snaps = (
        db.query(MethodicalIndexSnapshot.measurement_discipline)
        .filter(
            MethodicalIndexSnapshot.subject_type == "team",
            MethodicalIndexSnapshot.window_id == window.id,
        )
        .all()
    )
    vals = [d for (d,) in snaps if d is not None]
    return {
        "avg_discipline": _avg(vals),
        "sample": len(vals),
        "is_indicative": len(vals) < MIN_TILE_SAMPLE,
    }


def _participation(
    db: Session, window: AssessmentWindow, gender: Optional[str], age_band: Optional[str]
) -> list[dict]:
    """Участие по тест: от децата, тествани в този прозорец, какъв дял имат
    измерен всеки конкретен тест. Ниският дял издава пропускан (често по-труден)
    тест — сигнал за качеството на данните."""
    rows = (
        db.query(
            AssessmentResult.athlete_id,
            AssessmentResult.test_code,
            Athlete.birth_year,
            Athlete.gender,
        )
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.raw_value.isnot(None),
        )
        .all()
    )

    tested_athletes: set[int] = set()
    measured_by_test: dict[str, set[int]] = defaultdict(set)
    for athlete_id, test_code, birth_year, ath_gender in rows:
        if gender and ath_gender != gender:
            continue
        band = age_band_from_birth_year(birth_year)
        if age_band and band != age_band:
            continue
        tested_athletes.add(athlete_id)
        measured_by_test[test_code].add(athlete_id)

    denom = len(tested_athletes)

    test_defs = [
        t
        for t in db.query(TestDefinition)
        .filter(TestDefinition.is_active.is_(True))
        .order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc())
        .all()
        if (t.category.value if hasattr(t.category, "value") else t.category) != TestCategory.anthropometry.value
        and (t.direction.value if hasattr(t.direction, "value") else t.direction) != TestDirection.context.value
    ]

    out = []
    for td in test_defs:
        measured = len(measured_by_test.get(td.code, ()))
        pct = round(measured / denom * 100, 1) if denom else None
        out.append(
            {
                "test_code": td.code,
                "test_name": td.name,
                "category": td.category.value if hasattr(td.category, "value") else td.category,
                "measured": measured,
                "tested_total": denom,
                "participation_pct": pct,
                "is_low": pct is not None and pct < PARTICIPATION_LOW,
            }
        )
    # Най-пропусканите най-отгоре (None накрая), за да изпъкнат проблемите.
    out.sort(key=lambda r: (r["participation_pct"] is None, r["participation_pct"] or 0.0))
    return out


def _talent_pyramid(
    db: Session, window: AssessmentWindow, age_band: Optional[str]
) -> list[dict]:
    """Брой активни деца по възраст и пол (базата) + колко са тествани в прозореца.
    Това е „пътят на играча" — къде пирамидата е дебела/тънка."""
    athletes = (
        db.query(Athlete.id, Athlete.birth_year, Athlete.gender)
        .filter(Athlete.is_active.is_(True), Athlete.birth_year.isnot(None))
        .all()
    )
    tested_ids = {
        a
        for (a,) in db.query(AssessmentResult.athlete_id)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(AssessmentSession.window_id == window.id)
        .distinct()
        .all()
    }

    buckets: dict[str, dict[str, int]] = defaultdict(
        lambda: {"female": 0, "male": 0, "total": 0, "tested": 0}
    )
    for aid, birth_year, gender in athletes:
        band = age_band_from_birth_year(birth_year)
        if not band:
            continue
        if age_band and band != age_band:
            continue
        b = buckets[band]
        if gender == "female":
            b["female"] += 1
        elif gender == "male":
            b["male"] += 1
        b["total"] += 1
        if aid in tested_ids:
            b["tested"] += 1

    out = [
        {"age_band": band, **vals}
        for band, vals in buckets.items()
    ]
    out.sort(key=lambda r: r["age_band"])
    return out


def _norms_readiness(db: Session) -> dict:
    """Обобщение от Машината за норми: колко клетки са официални/готови/индикативни."""
    # Внос тук (а не в началото), за да няма цикличен внос между услугите.
    from app.services.norm_producer import compute_candidates

    cands = compute_candidates(db, include_below_display=True)
    official = ready = indicative = low_data = 0
    for c in cands:
        if c.is_approved:
            official += 1
        elif c.trust_ready:
            ready += 1
        elif c.display_ready:
            indicative += 1
        else:
            low_data += 1
    return {
        "official": official,
        "ready": ready,
        "indicative": indicative,
        "low_data": low_data,
        "total_cells": len(cands),
    }


def _trend(db: Session) -> list[dict]:
    """Динамика през последните прозорци: покритие, средно развитие, приемане."""
    windows = db.query(AssessmentWindow).all()
    with_data = {
        w_id
        for (w_id,) in db.query(AssessmentSession.window_id)
        .join(AssessmentResult, AssessmentResult.session_id == AssessmentSession.id)
        .distinct()
        .all()
    }
    windows = sorted([w for w in windows if w.id in with_data], key=window_sort_key)
    windows = windows[-6:]

    out = []
    for w in windows:
        cov = _coverage(db, w, None)
        ado = _adoption(db, w)
        dev_vals = [
            d
            for (d,) in db.query(DevelopmentScore.development_score)
            .filter(DevelopmentScore.window_id == w.id)
            .all()
            if d is not None
        ]
        out.append(
            {
                "window_id": w.id,
                "window_label": _window_label(w),
                "coverage_pct": cov.get("coverage_pct"),
                "avg_development": _avg(dev_vals),
                "adoption_pct": ado.get("avg_adoption"),
            }
        )
    return out


# =========================
# Публичен интерфейс
# =========================
def build_federation_dashboard(
    db: Session,
    window_id: Optional[int] = None,
    gender: Optional[str] = None,
    age_band: Optional[str] = None,
) -> dict:
    filters = {"gender": gender, "age_band": age_band}
    window = resolve_window(db, window_id)
    if window is None:
        return {
            "window_id": None,
            "window_label": None,
            "filters": filters,
        }

    return {
        "window_id": window.id,
        "window_label": _window_label(window),
        "coverage": _coverage(db, window, gender),
        "development_by_age": _development_by_age(db, window, gender, age_band),
        "adoption": _adoption(db, window),
        "norms": _norms(db, window, gender, age_band),
        "leaders_risk": _leaders_risk(db, window),
        "discipline": _discipline(db, window),
        "regional_index": _regional_index(db, window),
        "participation": _participation(db, window, gender, age_band),
        "talent_pyramid": _talent_pyramid(db, window, age_band),
        "norms_readiness": _norms_readiness(db),
        "trend": _trend(db),
        "filters": filters,
    }
