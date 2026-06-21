# backend/app/routers/assessments.py
"""Methodical Assessment Layer v1 — router.

Phase 0: батерия, създаване на сесия, прозорци, bulk въвеждане на резултати.
Phase 1: откриване на прозорци (POST /windows), finalize (нормализация +
Development Score + Методически Индекс), четене на Карта за развитие и
Методически Индекс, и мост към AI генератора (recommend-training) —
дефицитите от тестовете предписват тренировка.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentSessionStatus,
    AssessmentWindow,
    AssessmentWindowPhase,
    Athlete,
    BatteryAuditLog,
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
    AssessmentWindowCreate,
    AssessmentWindowOut,
    AthleteResultRow,
    AthleteResultsWindowOut,
    BatteryAuditOut,
    DevelopmentScoreOut,
    FederationDashboardOut,
    MethodicalIndexOut,
    ConsentIn,
    ConsentOut,
    ResultBulkIn,
    TestDefinitionAdminOut,
    TestDefinitionCreate,
    TestDefinitionOut,
    TestDefinitionUpdate,
    TrainingRecommendationOut,
)
from app.national_method.assessment_battery import BATTERY_VERSION
from app.services.assessment_consent import get_consent, set_consent
from app.services.assessment_dashboard import build_federation_dashboard
from app.services.assessment_generator_bridge import build_generate_request
from app.services.assessment_scoring import (
    compute_session_scores,
    compute_team_methodical_index,
)
from app.services.training_generation import run_generation

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
# Открива прозорци (методически контрол): главен треньор и нагоре.
_WINDOW_ADMIN_ROLES = (
    UserRole.club_head_coach,
    UserRole.platform_admin,
    UserRole.federation_admin,
)
# Федеративно табло: само национален/платформен админ (агрегирани данни).
_DASHBOARD_ROLES = (
    UserRole.platform_admin,
    UserRole.federation_admin,
)
# Управление на батерията (стандарта): само национален/платформен админ.
_BATTERY_ADMIN_ROLES = (
    UserRole.platform_admin,
    UserRole.federation_admin,
)
# Полета, които променят сравнимостта на данните — заключват се след употреба.
_COMPARABILITY_FIELDS = ("category", "unit", "direction")


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


def _ensure_athlete_access(user: User, athlete: Athlete) -> None:
    """Достъп до състезател: админ/федерация — навсякъде; главен треньор —
    в рамките на клуба; треньор — само свои състезатели."""
    role = _role_value(user)
    if role in (UserRole.platform_admin.value, UserRole.federation_admin.value):
        return
    if role == UserRole.club_head_coach.value:
        ath_club = getattr(athlete, "club_id", None)
        user_club = getattr(user, "club_id", None)
        if ath_club and user_club and ath_club == user_club:
            return
    if athlete.coach_id == user.id:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Нямате достъп до този състезател",
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


# =========================
# Управление на батерията (Phase 4 — само национален/платформен админ)
# =========================
def _norm_value(value):
    """Нормализира enum/стойност до сравним стринг."""
    return value.value if hasattr(value, "value") else value


def _battery_usage_counts(db: Session, codes: Optional[list[str]] = None) -> dict[str, int]:
    """Брой резултати по `test_code` — определя кои тестове са „заключени"."""
    query = db.query(AssessmentResult.test_code, func.count(AssessmentResult.id))
    if codes:
        query = query.filter(AssessmentResult.test_code.in_(codes))
    rows = query.group_by(AssessmentResult.test_code).all()
    return {code: count for code, count in rows}


def _admin_out(test: TestDefinition, usage: int) -> TestDefinitionAdminOut:
    data = TestDefinitionOut.model_validate(test).model_dump()
    return TestDefinitionAdminOut(**data, usage_count=usage, is_locked=usage > 0)


def _record_battery_audit(
    db: Session, *, test_code: str, action: str, changes: Optional[dict], user: User
) -> None:
    """Добавя запис в журнала на батерията (без отделен commit — извикващият
    commit-ва заедно с промяната)."""
    db.add(
        BatteryAuditLog(
            test_code=test_code,
            action=action,
            changes=changes or None,
            actor_user_id=getattr(user, "id", None),
            actor_name=getattr(user, "name", None),
        )
    )


@router.get("/battery/admin", response_model=list[TestDefinitionAdminOut])
def get_battery_admin(
    include_inactive: bool = Query(True, description="Включва и деактивираните тестове"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_BATTERY_ADMIN_ROLES)),
):
    """Пълен изглед на батерията за администриране (вкл. деактивирани + заключване)."""
    query = db.query(TestDefinition)
    if not include_inactive:
        query = query.filter(TestDefinition.is_active.is_(True))
    tests = query.order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc()).all()
    usage = _battery_usage_counts(db, [t.code for t in tests])
    return [_admin_out(t, usage.get(t.code, 0)) for t in tests]


@router.post("/battery", response_model=TestDefinitionAdminOut, status_code=status.HTTP_201_CREATED)
def create_test_definition(
    payload: TestDefinitionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_BATTERY_ADMIN_ROLES)),
):
    """Създава нов тест в батерията. `code` трябва да е уникален."""
    code = payload.code.strip()
    exists = db.query(TestDefinition).filter(TestDefinition.code == code).first()
    if exists is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Тест с код „{code}“ вече съществува.",
        )
    test = TestDefinition(
        code=code,
        name=payload.name.strip(),
        category=payload.category,
        unit=payload.unit.strip(),
        direction=payload.direction,
        protocol=payload.protocol,
        video_url=payload.video_url,
        age_min=payload.age_min,
        age_max=payload.age_max,
        battery_version=(payload.battery_version or BATTERY_VERSION),
        sort_order=payload.sort_order,
        is_active=True,
    )
    db.add(test)
    _record_battery_audit(
        db,
        test_code=code,
        action="create",
        changes={
            "name": test.name,
            "category": _norm_value(test.category),
            "unit": test.unit,
            "direction": _norm_value(test.direction),
        },
        user=current_user,
    )
    db.commit()
    db.refresh(test)
    return _admin_out(test, 0)


@router.patch("/battery/{code}", response_model=TestDefinitionAdminOut)
def update_test_definition(
    code: str,
    payload: TestDefinitionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_BATTERY_ADMIN_ROLES)),
):
    """Редактира тест. Полетата за сравнимост (category/unit/direction) се
    заключват, ако тестът вече е използван в резултати — тогава се създава нова
    версия (нов код) вместо промяна."""
    test = db.query(TestDefinition).filter(TestDefinition.code == code).first()
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тестът не е намерен")

    updates = payload.model_dump(exclude_unset=True)
    usage = _battery_usage_counts(db, [code]).get(code, 0)

    if usage > 0:
        blocked = [
            f for f in _COMPARABILITY_FIELDS
            if f in updates and updates[f] is not None and _norm_value(getattr(test, f)) != updates[f]
        ]
        if blocked:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Тестът вече е използван в резултати — полетата "
                    f"{', '.join(blocked)} са заключени за сравнимост. "
                    "Създайте нова версия (нов код) вместо промяна."
                ),
            )

    changes: dict[str, list] = {}
    for field, value in updates.items():
        old = _norm_value(getattr(test, field))
        if old != value:
            changes[field] = [old, value]
        setattr(test, field, value)

    if changes:
        # Специален случай: смяна само на статуса = (де)активиране.
        if set(changes.keys()) == {"is_active"}:
            action = "activate" if updates.get("is_active") else "deactivate"
        else:
            action = "update"
        _record_battery_audit(db, test_code=code, action=action, changes=changes, user=current_user)

    db.commit()
    db.refresh(test)
    return _admin_out(test, usage)


@router.delete("/battery/{code}", status_code=status.HTTP_200_OK)
def delete_test_definition(
    code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_BATTERY_ADMIN_ROLES)),
):
    """Изтрива тест само ако НИКОГА не е използван. Използваните се деактивират
    (PATCH is_active=false), за да се запази целостта на историческите данни."""
    test = db.query(TestDefinition).filter(TestDefinition.code == code).first()
    if test is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Тестът не е намерен")
    usage = _battery_usage_counts(db, [code]).get(code, 0)
    if usage > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Тестът е използван в {usage} резултата и не може да се изтрие. "
                "Деактивирайте го вместо това."
            ),
        )
    _record_battery_audit(
        db,
        test_code=code,
        action="delete",
        changes={"name": test.name, "category": _norm_value(test.category)},
        user=current_user,
    )
    db.delete(test)
    db.commit()
    return {"deleted": code}


@router.get("/battery/audit", response_model=list[BatteryAuditOut])
def get_battery_audit(
    test_code: Optional[str] = Query(None, description="По избор: само за конкретен тест"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_BATTERY_ADMIN_ROLES)),
):
    """Журнал на промените по батерията (най-новите най-отгоре)."""
    query = db.query(BatteryAuditLog)
    if test_code:
        query = query.filter(BatteryAuditLog.test_code == test_code)
    return query.order_by(BatteryAuditLog.created_at.desc(), BatteryAuditLog.id.desc()).limit(limit).all()


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
    "/windows",
    response_model=AssessmentWindowOut,
    status_code=status.HTTP_201_CREATED,
)
def create_window(
    payload: AssessmentWindowCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WINDOW_ADMIN_ROLES)),
):
    """Открива тестов прозорец (baseline/mid/endline) за сезон.

    Idempotent по (season, phase, club_id): ако вече има такъв прозорец — връща го.
    """
    existing = (
        db.query(AssessmentWindow)
        .filter(
            AssessmentWindow.season == payload.season,
            AssessmentWindow.phase == AssessmentWindowPhase(payload.phase),
            AssessmentWindow.club_id == payload.club_id,
        )
        .first()
    )
    if existing is not None:
        return existing

    window = AssessmentWindow(
        season=payload.season,
        cycle=payload.cycle,
        phase=AssessmentWindowPhase(payload.phase),
        club_id=payload.club_id,
        label=payload.label,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )
    db.add(window)
    db.commit()
    db.refresh(window)
    return window


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


@router.get("/athletes/{athlete_id}/development", response_model=list[DevelopmentScoreOut])
def athlete_development(
    athlete_id: int,
    window_id: Optional[int] = Query(None, description="По избор: само за конкретен прозорец"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Карта за развитие: Development Score-овете на състезателя през прозорците."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    query = db.query(DevelopmentScore).filter(DevelopmentScore.athlete_id == athlete_id)
    if window_id is not None:
        query = query.filter(DevelopmentScore.window_id == window_id)
    return query.order_by(DevelopmentScore.window_id.asc()).all()


# Производен показател „чист отскок" = отскок след засилване − разтег (см).
_NET_JUMP_APPROACH_CODE = "PHYS_JUMP_APPROACH"
_NET_JUMP_REACH_CODE = "ANTH_REACH"


@router.get("/athletes/{athlete_id}/results", response_model=list[AthleteResultsWindowOut])
def athlete_results(
    athlete_id: int,
    window_id: Optional[int] = Query(None, description="По избор: само за конкретен прозорец"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Реалните (сурови) стойности на състезателя по тест, групирани по прозорец.

    Допълва Картата за развитие, която показва само нормализираните оценки —
    тук се виждат истинските см/сек/точки. Изчислява и „чист отскок".
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    rows = (
        db.query(AssessmentResult, AssessmentSession.window_id, TestDefinition, AssessmentWindow)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(TestDefinition, TestDefinition.code == AssessmentResult.test_code)
        .join(AssessmentWindow, AssessmentWindow.id == AssessmentSession.window_id)
        .filter(AssessmentResult.athlete_id == athlete_id)
    )
    if window_id is not None:
        rows = rows.filter(AssessmentSession.window_id == window_id)
    rows = rows.all()

    # Групиране по прозорец.
    by_window: dict[int, dict] = {}
    for result, win_id, test_def, window in rows:
        bucket = by_window.setdefault(
            win_id,
            {
                "window_id": win_id,
                "season": window.season,
                "phase": _norm_value(window.phase),
                "rows": [],
                "raw_by_code": {},
            },
        )
        bucket["rows"].append(
            AthleteResultRow(
                test_code=test_def.code,
                test_name=test_def.name,
                category=_norm_value(test_def.category),
                unit=test_def.unit,
                direction=_norm_value(test_def.direction),
                sort_order=test_def.sort_order or 0,
                raw_value=result.raw_value,
                normalized=result.normalized,
                is_indicative=bool(result.is_indicative),
            )
        )
        bucket["raw_by_code"][test_def.code] = result.raw_value

    out: list[AthleteResultsWindowOut] = []
    for win_id in sorted(by_window.keys()):
        bucket = by_window[win_id]
        bucket["rows"].sort(key=lambda r: (r.sort_order, r.test_code))
        approach = bucket["raw_by_code"].get(_NET_JUMP_APPROACH_CODE)
        reach = bucket["raw_by_code"].get(_NET_JUMP_REACH_CODE)
        net_jump = round(approach - reach, 1) if approach is not None and reach is not None else None
        out.append(
            AthleteResultsWindowOut(
                window_id=win_id,
                season=bucket["season"],
                phase=bucket["phase"],
                results=bucket["rows"],
                net_jump=net_jump,
            )
        )
    return out


def _consent_out(athlete_id: int, consent) -> ConsentOut:
    if consent is None:
        return ConsentOut(athlete_id=athlete_id, is_granted=False)
    return ConsentOut(
        athlete_id=athlete_id,
        is_granted=consent.is_granted,
        granted_at=consent.granted_at,
        revoked_at=consent.revoked_at,
        granted_by_user_id=consent.granted_by_user_id,
        note=consent.note,
    )


@router.get("/athletes/{athlete_id}/consent", response_model=ConsentOut)
def get_athlete_consent(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Текущ статус на родителското съгласие за Картата за развитие."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)
    return _consent_out(athlete_id, get_consent(db, athlete_id))


@router.put("/athletes/{athlete_id}/consent", response_model=ConsentOut)
def update_athlete_consent(
    athlete_id: int,
    payload: ConsentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Записва/оттегля съгласието родителят да вижда Картата за развитие."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)
    consent = set_consent(
        db, athlete_id, payload.granted, user_id=current_user.id, note=payload.note
    )
    return _consent_out(athlete_id, consent)


@router.get("/teams/{team_id}/index", response_model=list[MethodicalIndexOut])
def team_methodical_index(
    team_id: int,
    window_id: Optional[int] = Query(None, description="По избор: само за конкретен прозорец"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Методически Индекс на отбора през прозорците."""
    team = db.query(Team).filter(Team.id == team_id).first()
    if team is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Отборът не е намерен")
    _ensure_team_access(current_user, team)

    query = db.query(MethodicalIndexSnapshot).filter(
        MethodicalIndexSnapshot.subject_type == "team",
        MethodicalIndexSnapshot.subject_id == team_id,
    )
    if window_id is not None:
        query = query.filter(MethodicalIndexSnapshot.window_id == window_id)
    return query.order_by(MethodicalIndexSnapshot.window_id.asc()).all()


@router.post("/athletes/{athlete_id}/recommend-training", response_model=TrainingRecommendationOut)
def recommend_training(
    athlete_id: int,
    window_id: int = Query(..., description="Прозорецът, чиято диагностика да ползваме"),
    generate: bool = Query(False, description="Ако е true — директно генерира тренировка"),
    duration_min: int = Query(90, ge=30, le=180),
    players_count: int = Query(12, ge=1, le=40),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Превръща диагнозата в предписание: дефицити → заявка към AI генератора.

    По подразбиране връща prefilled заявка (`generate_request`) + дефицитите.
    При `generate=true` извиква генератора и връща и готовата тренировка.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == window_id).first()
    if window is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Прозорецът не е намерен")

    built = build_generate_request(
        db, athlete, window, duration_min=duration_min, players_count=players_count
    )
    generate_request = built["generate_request"]

    generated = None
    if generate:
        generated = run_generation(generate_request, user=current_user, db=db)["result"]

    return TrainingRecommendationOut(
        athlete_id=athlete_id,
        window_id=window_id,
        main_focus=generate_request["mainFocus"],
        secondary_focus=generate_request.get("secondaryFocus"),
        deficits=built["deficits"],
        generate_request=generate_request,
        generated=generated,
    )


# =========================
# Федеративно табло v1 (само агрегирано — без лични данни на дете)
# =========================
@router.get("/federation/dashboard", response_model=FederationDashboardOut)
def federation_dashboard(
    window_id: Optional[int] = Query(None, description="По избор: конкретен прозорец (иначе последния с данни)"),
    gender: Optional[str] = Query(None, description="Филтър по пол: male/female"),
    age_band: Optional[str] = Query(None, description="Филтър по възрастова група, напр. U14"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_DASHBOARD_ROLES)),
):
    """6-те национални плочки агрегирано: покритие, развитие по възраст, приемане,
    национални репери, лидери/риск (отборно) и дисциплина на измерване.

    Малките проби се връщат с `is_indicative=true` (cold-start защита).
    """
    return build_federation_dashboard(db, window_id=window_id, gender=gender, age_band=age_band)
