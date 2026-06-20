# backend/app/routers/assessments.py
"""Methodical Assessment Layer v1 — router.

Phase 0: батерия, създаване на сесия, прозорци, bulk въвеждане на резултати.
Phase 1: finalize (нормализация + Development Score + Методически Индекс) и
обогатен GET за сесия. Отборна карта и федеративно табло идват в следващите
фази (виж DEV_PLAN).
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentSessionStatus,
    AssessmentWindow,
    DevelopmentScore,
    MethodicalIndexSnapshot,
    Team,
    TestDefinition,
    User,
    UserRole,
)
from app.schemas.assessment import (
    AssessmentSessionCreate,
    AssessmentSessionOut,
    AssessmentWindowOut,
    DevelopmentScoreOut,
    MethodicalIndexOut,
    ResultBulkIn,
    TestDefinitionOut,
)
from app.services.assessment_scoring import (
    compute_session_scores,
    compute_team_methodical_index,
)

# Подреждане на прозорците по фаза в логически ред.
_PHASE_ORDER = {"baseline": 0, "mid": 1, "endline": 2}

router = APIRouter(prefix="/api/assessments", tags=["Assessment"])

# Чете батерията: всеки автентикиран служебен потребител.
_READ_ROLES = (
    UserRole.coach,
    UserRole.club_head_coach,
    UserRole.platform_admin,
    UserRole.federation_admin,
)
# Създава сесии/въвежда резултати: треньор и нагоре.
_WRITE_ROLES = (
    UserRole.coach,
    UserRole.club_head_coach,
    UserRole.platform_admin,
    UserRole.federation_admin,
)


def _role_value(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else user.role


def _ensure_team_access(user: User, team: Team) -> None:
    """Минимална проверка за достъп: админ/федерация — навсякъде; главен треньор —
    в рамките на клуба; треньор — само свои отбори. (Разширява се в Phase 4.)"""
    role = _role_value(user)
    if role in (UserRole.platform_admin.value, UserRole.federation_admin.value):
        return
    if role == UserRole.club_head_coach.value:
        team_club = getattr(team, "club_id", None)
        user_club = getattr(user, "club_id", None)
        if team_club and user_club and team_club == user_club:
            return
    if team.coach_id == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Нямате достъп до този отбор",
    )


def _session_out_with_scores(db: Session, session: AssessmentSession) -> AssessmentSessionOut:
    """Сглобява изхода за сесия; при finalized добавя Development Score-овете и
    Методическия Индекс."""
    out = AssessmentSessionOut.model_validate(session)
    if session.status == AssessmentSessionStatus.finalized:
        athlete_ids = [r.athlete_id for r in session.results]
        if athlete_ids:
            devs = (
                db.query(DevelopmentScore)
                .filter(
                    DevelopmentScore.window_id == session.window_id,
                    DevelopmentScore.athlete_id.in_(athlete_ids),
                )
                .all()
            )
            out.development_scores = [DevelopmentScoreOut.model_validate(d) for d in devs]
        mi = (
            db.query(MethodicalIndexSnapshot)
            .filter(
                MethodicalIndexSnapshot.subject_type == "team",
                MethodicalIndexSnapshot.subject_id == session.team_id,
                MethodicalIndexSnapshot.window_id == session.window_id,
            )
            .first()
        )
        if mi is not None:
            out.methodical_index = MethodicalIndexOut.model_validate(mi)
    return out


@router.get("/battery", response_model=list[TestDefinitionOut])
def get_battery(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Връща цялата активна тестова батерия, подредена по `sort_order`."""
    return (
        db.query(TestDefinition)
        .filter(TestDefinition.is_active.is_(True))
        .order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc())
        .all()
    )


@router.get("/windows", response_model=list[AssessmentWindowOut])
def list_windows(
    season: Optional[str] = Query(None, description="Филтър по сезон, напр. 2025/26"),
    club_id: Optional[int] = Query(None, description="Филтър по клуб (null = национални)"),
    age_band: Optional[str] = Query(
        None,
        description=(
            "Резервиран за бъдеще: в v1 прозорците са на ниво сезон/фаза (национални), "
            "а не на ниво възрастова група — затова не филтрира."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Връща активните прозорци (baseline/mid/endline), подредени по фаза.

    „Активен" = без крайна дата или с крайна дата днес/в бъдеще.
    Възрастовата група се прилага на ниво отбор/състезател, не на прозорец (v1),
    затова `age_band` е приет, но засега не стеснява резултата.
    """
    query = db.query(AssessmentWindow)
    if season:
        query = query.filter(AssessmentWindow.season == season)
    if club_id is not None:
        query = query.filter(AssessmentWindow.club_id == club_id)

    today = date.today()
    windows = [
        w for w in query.all() if w.end_date is None or w.end_date >= today
    ]
    windows.sort(
        key=lambda w: (
            w.season or "",
            _PHASE_ORDER.get(getattr(w.phase, "value", w.phase), 99),
        )
    )
    return windows


@router.post(
    "/sessions",
    response_model=AssessmentSessionOut,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    payload: AssessmentSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Създава диагностична сесия за отбор в даден прозорец.

    Idempotent по (window_id, team_id): ако вече има сесия — връща я.
    """
    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == payload.window_id).first()
    if window is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Прозорецът не е намерен")

    team = db.query(Team).filter(Team.id == payload.team_id).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Отборът не е намерен")

    _ensure_team_access(current_user, team)

    existing = (
        db.query(AssessmentSession)
        .filter(
            AssessmentSession.window_id == payload.window_id,
            AssessmentSession.team_id == payload.team_id,
        )
        .first()
    )
    if existing is not None:
        return existing

    session = AssessmentSession(
        window_id=payload.window_id,
        team_id=payload.team_id,
        coach_id=current_user.id,
        conducted_on=payload.conducted_on,
        status=AssessmentSessionStatus.open,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions/{session_id}", response_model=AssessmentSessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Връща сесията + резултатите ѝ. Ако е finalized — добавя и scores."""
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    return _session_out_with_scores(db, session)


@router.post("/sessions/{session_id}/finalize", response_model=AssessmentSessionOut)
def finalize_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Финализира сесията и изчислява всички scores.

    - Нормализира резултатите и upsert-ва Development Score за всеки състезател.
    - Изчислява Методическия Индекс за отбора в този прозорец.
    - Маркира сесията `finalized`.

    Idempotent: повторно извикване преизчислява (полезно ако нормите са обновени).
    """
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    compute_session_scores(db, session)
    compute_team_methodical_index(db, session.team_id, session.window_id)
    session.status = AssessmentSessionStatus.finalized
    db.commit()
    db.refresh(session)

    return _session_out_with_scores(db, session)


@router.post("/sessions/{session_id}/results/bulk")
def bulk_results(
    session_id: int,
    payload: ResultBulkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Bulk въвеждане/обновяване на сурови резултати за сесия.

    Phase 0: записва само `raw_value` (upsert по session+athlete+test_code).
    Нормализиране, перцентили и Development Score се изчисляват в Phase 1.
    """
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    if session.status == AssessmentSessionStatus.finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сесията е приключена и не приема нови резултати",
        )

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    # Валидни кодове от батерията (за да не записваме непознати тестове).
    valid_codes = {
        code
        for (code,) in db.query(TestDefinition.code).filter(TestDefinition.is_active.is_(True)).all()
    }

    upserted = 0
    skipped: list[str] = []
    for item in payload.results:
        if item.test_code not in valid_codes:
            skipped.append(item.test_code)
            continue
        row = (
            db.query(AssessmentResult)
            .filter(
                AssessmentResult.session_id == session_id,
                AssessmentResult.athlete_id == item.athlete_id,
                AssessmentResult.test_code == item.test_code,
            )
            .first()
        )
        if row is None:
            row = AssessmentResult(
                session_id=session_id,
                athlete_id=item.athlete_id,
                test_code=item.test_code,
            )
            db.add(row)
        row.raw_value = item.raw_value
        upserted += 1

    db.commit()
    return {
        "session_id": session_id,
        "upserted": upserted,
        "skipped_unknown_codes": sorted(set(skipped)),
    }
