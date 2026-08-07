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
from sqlalchemy import func, select
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
    TeamMember,
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
    SessionConsentBulkOut,
    TeamDiagnosisOut,
    SaveTeamPlanIn,
    SaveTeamPlanOut,
    SavedTrainingRefOut,
    HomeWorkoutsIn,
    HomeWorkoutsOut,
    AgeEquivalentOut,
    AgeEquivalentTestOut,
    MotivationNextGoalOut,
    MotivationOut,
    MotivationTestOut,
    NationalNormActionIn,
    NationalNormCellOut,
    NationalNormMachineOut,
    ResultBulkIn,
    ScoutCellOut,
    ScoutRowOut,
    ScoutTestOut,
    ScoutingTableOut,
    TalentProfileOut,
    TalentTestScoreOut,
    TestDefinitionAdminOut,
    TestDefinitionCreate,
    TestDefinitionOut,
    TestDefinitionUpdate,
    TrainingRecommendationOut,
)
from app.national_method.assessment_battery import BATTERY_VERSION
from app.services.assessment_consent import get_consent, set_consent
from app.services.assessment_dashboard import build_federation_dashboard
from app.services.assessment_generator_bridge import (
    build_generate_request,
    build_home_generate_request,
    build_team_diagnosis,
)
from app.services.assessment_scoring import (
    compute_session_scores,
    compute_team_methodical_index,
)
from app.services.age_equivalent_service import compute_athlete_age_equivalent
from app.services.motivation_service import compute_athlete_motivation
from app.services.norm_producer import (
    MIN_DISPLAY_SAMPLE,
    MIN_TRUST_SAMPLE,
    approve_cell,
    compute_candidates,
    refresh_approved_norms,
    revoke_cell,
)
from app.services.peer_norms import birth_year_for_band
from app.services.scouting_service import build_scouting_table
from app.services.talent_profile_service import compute_athlete_talent_profile
from app.services.training_generation import persist_generated_training, persist_text_training, run_generation

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

    # Фаза 2: опресняваме вече одобрените национални норми с новите данни, преди
    # да оценим — така оценките ползват най-актуалната жива летва. Не активира
    # нови клетки (само вече одобрените се преизчисляват).
    refresh_approved_norms(db)
    compute_session_scores(db, session)
    compute_team_methodical_index(db, session.team_id, session.window_id)
    session.status = AssessmentSessionStatus.finalized
    db.commit()
    db.refresh(session)

    return _session_out_with_scores(db, session)


@router.put("/sessions/{session_id}/share-parents", response_model=SessionConsentBulkOut)
def share_session_with_parents(
    session_id: int,
    payload: ConsentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Споделя/оттегля Картата за развитие за всички състезатели със данни в сесията.

    Състезатели без нито един резултат в сесията се пропускат (не се праща нищо).
    """
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    athlete_ids_with_data = {
        aid
        for (aid,) in db.query(AssessmentResult.athlete_id)
        .filter(AssessmentResult.session_id == session.id)
        .distinct()
        .all()
    }

    # Всички членове на отбора — за да знаем кого пропускаме.
    member_ids = {
        mid
        for (mid,) in db.query(TeamMember.athlete_id).filter(TeamMember.team_id == session.team_id).all()
    }
    skipped = sorted(member_ids - athlete_ids_with_data)

    updated = []
    for aid in sorted(athlete_ids_with_data):
        consent = set_consent(
            db,
            aid,
            bool(payload.granted),
            user_id=current_user.id,
            note=payload.note,
        )
        updated.append(_consent_out(aid, consent))

    return SessionConsentBulkOut(
        session_id=session_id,
        granted=bool(payload.granted),
        updated=updated,
        skipped_no_data=skipped,
    )


@router.post("/sessions/{session_id}/team-diagnosis", response_model=TeamDiagnosisOut)
def team_session_diagnosis(
    session_id: int,
    generate: bool = Query(False, description="Ако е true — генерира отборна тренировка"),
    duration_min: int = Query(90, ge=30, le=180),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Отборна диагностика след приключена сесия: общи + индивидуални акценти."""
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    if session.status != AssessmentSessionStatus.finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Отборната диагностика е достъпна след приключване на сесията.",
        )

    built = build_team_diagnosis(db, session, duration_min=duration_min)
    generated = None
    if generate and built.get("generate_request"):
        generated = run_generation(built["generate_request"], user=current_user, db=db)["result"]

    return TeamDiagnosisOut(**built, generated=generated)


@router.post("/sessions/{session_id}/team-plan/save", response_model=SaveTeamPlanOut)
def save_team_diagnosis_plan(
    session_id: int,
    payload: SaveTeamPlanIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Генерира отборен план по диагнозата и го записва към отбор + дата от графика."""
    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    if session.status != AssessmentSessionStatus.finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Записът към графика е достъпен след приключване на сесията.",
        )

    date_s = (payload.session_date or "").strip()
    if len(date_s) != 10 or date_s[4] != "-" or date_s[7] != "-":
        raise HTTPException(status_code=422, detail="session_date трябва да е YYYY-MM-DD")

    built = build_team_diagnosis(db, session, duration_min=payload.duration_min)
    gen_req = built.get("generate_request") or {}
    if not gen_req:
        raise HTTPException(status_code=400, detail="Няма данни за отборна генерация.")

    generation = run_generation(gen_req, user=current_user, db=db)
    title = f"По диагноза · {built.get('main_focus') or 'фокус'} · {date_s}"
    training = persist_generated_training(
        db,
        current_user,
        generation,
        title=title,
        team_id=session.team_id,
        session_date=date_s,
        status="запазена",
        notes="Отборна тренировка по диагностична сесия",
        extra_request_fields={"kind": "team_diagnosis_plan", "assessment_session_id": session_id},
    )

    return SaveTeamPlanOut(
        training=SavedTrainingRefOut(
            id=training.id,
            title=training.title,
            team_id=training.team_id,
            session_date=training.session_date,
            training_plan_text=(training.generation_request or {}).get("trainingPlanText"),
            main_focus=built.get("main_focus"),
        )
    )


@router.post("/sessions/{session_id}/home-workouts", response_model=HomeWorkoutsOut)
def generate_session_home_workouts(
    session_id: int,
    payload: HomeWorkoutsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_WRITE_ROLES)),
):
    """Генерира и записва текстови домашни планове по индивидуалните акценти.

    Без библиотека упражнения — само естествен план (физика, плиометрия,
    координация, фокус) по методика БФВ / учебник.
    """
    from app.national_method.home_workout_plans import build_home_workout_text

    session = db.query(AssessmentSession).filter(AssessmentSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Сесията не е намерена")

    team = db.query(Team).filter(Team.id == session.team_id).first()
    if team is not None:
        _ensure_team_access(current_user, team)

    if session.status != AssessmentSessionStatus.finalized:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Домашните тренировки са достъпни след приключване на сесията.",
        )

    built = build_team_diagnosis(db, session)
    athletes = built.get("athletes") or []
    if payload.athlete_ids:
        wanted = set(payload.athlete_ids)
        athletes = [a for a in athletes if a.get("athlete_id") in wanted]

    created = []
    failed = []
    for row in athletes:
        aid = row.get("athlete_id")
        athlete = db.query(Athlete).filter(Athlete.id == aid).first()
        if athlete is None or not row.get("main_focus"):
            failed.append({"athlete_id": aid, "error": "Липсва акцент или състезател."})
            continue
        try:
            plan_text = build_home_workout_text(
                athlete_name=athlete.athlete_name,
                birth_year=athlete.birth_year,
                gender=athlete.gender,
                main_focus=row["main_focus"],
                secondary_focus=row.get("secondary_focus"),
                duration_min=payload.duration_min,
            )
            title = f"Домашна · {athlete.athlete_name} · {row['main_focus']}"
            training = persist_text_training(
                db,
                current_user,
                title=title,
                plan_text=plan_text,
                team_id=session.team_id,
                session_date=None,
                status="запазена",
                notes=f"Домашна текстова тренировка за athlete_id={athlete.id}",
                request_meta={
                    "kind": "home_workout",
                    "source": "bvf-method-text",
                    "athlete_id": athlete.id,
                    "athlete_name": athlete.athlete_name,
                    "assessment_session_id": session_id,
                    "mainFocus": row.get("main_focus"),
                    "secondaryFocus": row.get("secondary_focus"),
                    "durationTotalMin": payload.duration_min,
                    "playersCount": 1,
                },
            )
            created.append(
                SavedTrainingRefOut(
                    id=training.id,
                    title=training.title,
                    team_id=training.team_id,
                    session_date=training.session_date,
                    athlete_id=athlete.id,
                    athlete_name=athlete.athlete_name,
                    training_plan_text=plan_text,
                    main_focus=row.get("main_focus"),
                )
            )
        except Exception as exc:  # noqa: BLE001 — искаме да продължим с останалите
            failed.append({"athlete_id": aid, "athlete_name": row.get("athlete_name"), "error": str(exc)})

    return HomeWorkoutsOut(session_id=session_id, created=created, failed=failed)


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
    touched_athletes: set[int] = set()
    from app.services.physical_from_tests import BVF_FIELD_TEST_CODES, upsert_pending_from_tests

    transferable = set(BVF_FIELD_TEST_CODES.values())
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
        if item.test_code in transferable and item.raw_value is not None:
            touched_athletes.add(int(item.athlete_id))

    db.flush()
    for aid in touched_athletes:
        upsert_pending_from_tests(
            db,
            aid,
            session_id=session_id,
            user_id=current_user.id,
        )

    db.commit()
    return {
        "session_id": session_id,
        "upserted": upserted,
        "skipped_unknown_codes": sorted(set(skipped)),
        "physical_pending_athletes": sorted(touched_athletes),
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


@router.get("/athletes/{athlete_id}/scouting", response_model=ScoutingTableOut)
def athlete_scouting(
    athlete_id: int,
    include_anthropometry: bool = Query(
        True,
        description="Включи ръст/тегло/разтег ако има въведени стойности",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Скаутските клетки за един състезател — същият формат като общата таблица."""
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    scored: list[TestDefinition] = []
    anthro: list[TestDefinition] = []
    for t in (
        db.query(TestDefinition)
        .filter(TestDefinition.is_active.is_(True))
        .order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc())
        .all()
    ):
        cat = _norm_value(t.category)
        direction = _norm_value(t.direction)
        if cat == "anthropometry":
            if include_anthropometry:
                anthro.append(t)
            continue
        if direction == "context":
            continue
        scored.append(t)
    tests = [*anthro, *scored]
    rows = build_scouting_table(db, [athlete], tests)

    return ScoutingTableOut(
        tests=[
            ScoutTestOut(
                code=t.code,
                name=t.name,
                category=_norm_value(t.category),
                unit=t.unit,
                direction=_norm_value(t.direction),
            )
            for t in tests
        ],
        rows=[
            ScoutRowOut(
                athlete_id=r.athlete_id,
                athlete_name=r.athlete_name,
                age_band=r.age_band,
                gender=r.gender,
                cells=[
                    ScoutCellOut(
                        test_code=c.test_code,
                        raw_value=c.raw_value,
                        score_2022=c.score_2022,
                        score_2022_label=c.score_2022_label,
                        peer_percentile=c.peer_percentile,
                        peer_sample=c.peer_sample,
                        peer_indicative=c.peer_indicative,
                        talent_score=c.talent_score,
                        talent_label=c.talent_label,
                    )
                    for c in r.cells
                ],
            )
            for r in rows
        ],
        filters={
            "athlete_id": athlete_id,
            "include_anthropometry": include_anthropometry,
        },
    )


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
                source=result.norm_source,
                confidence=result.norm_confidence,
                explanation=result.norm_explanation,
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


@router.get("/athletes/{athlete_id}/talent-profile", response_model=TalentProfileOut)
def athlete_talent_profile(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Профил на таланта: колко дете покрива летвата на по-големите (репер 2022).

    Чисто индикативен, надстроечен изглед — НЕ променя официалната оценка,
    Development Score, нормализацията или Dashboard. Връща число (0–100) + дума
    за всеки покрит тест спрямо референтната (по-голяма) възраст за пола.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    profile = compute_athlete_talent_profile(db, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")

    # Обогатяване с имената на тестовете (за по-четим изход).
    names = {code: name for code, name in db.query(TestDefinition.code, TestDefinition.name).all()}
    tests = [
        TalentTestScoreOut(
            test_code=t.test_code,
            test_name=names.get(t.test_code),
            raw_value=t.raw_value,
            talent_score=t.talent_score,
            talent_label=t.talent_label,
        )
        for t in profile.tests
    ]
    return TalentProfileOut(
        athlete_id=athlete_id,
        athlete_name=athlete.athlete_name,
        gender=profile.gender,
        age_band=profile.age_band,
        reference_age_band=profile.reference_age_band,
        covered=profile.covered,
        is_aspirational=profile.is_aspirational,
        talent_index=profile.talent_index,
        talent_index_label=profile.talent_index_label,
        tests=tests,
    )


@router.get("/athletes/{athlete_id}/motivation", response_model=MotivationOut)
def athlete_motivation(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Мотивационен изглед за детето: личен рекорд, подобрение, следваща цел,
    „спрямо големите" (талант) и леко сравнение с връстниците.

    Чисто индикативен, надстроечен слой — НЕ променя официалната оценка,
    Development Score, нормализацията или Dashboard.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    profile = compute_athlete_motivation(db, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")

    return MotivationOut(
        athlete_id=profile.athlete_id,
        athlete_name=profile.athlete_name,
        gender=profile.gender,
        age_band=profile.age_band,
        reference_age_band=profile.reference_age_band,
        improved_count=profile.improved_count,
        personal_best_count=profile.personal_best_count,
        talent_index=profile.talent_index,
        talent_index_label=profile.talent_index_label,
        tests=[
            MotivationTestOut(
                test_code=t.test_code,
                test_name=t.test_name,
                unit=t.unit,
                higher_better=t.higher_better,
                category=t.category,
                latest=t.latest,
                personal_best=t.personal_best,
                is_personal_best=t.is_personal_best,
                is_new_record=t.is_new_record,
                prev=t.prev,
                delta=t.delta,
                improved=t.improved,
                next_goal=(
                    MotivationNextGoalOut(
                        target_raw=t.next_goal.target_raw,
                        next_level=t.next_goal.next_level,
                        gap=t.next_goal.gap,
                    )
                    if t.next_goal is not None
                    else None
                ),
                talent_score=t.talent_score,
                talent_label=t.talent_label,
                peer_percentile=t.peer_percentile,
                peer_sample=t.peer_sample,
                peer_indicative=t.peer_indicative,
            )
            for t in profile.tests
        ],
    )


@router.get("/athletes/{athlete_id}/age-equivalent", response_model=AgeEquivalentOut)
def athlete_age_equivalent(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Възрастов еквивалент: на каква възраст отговаря представянето на детето
    (по кривата възраст → средно от живите норми за същия пол).

    Индикативен, надстроечен слой — НЕ променя официалната оценка.
    """
    athlete = db.query(Athlete).filter(Athlete.id == athlete_id).first()
    if athlete is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")
    _ensure_athlete_access(current_user, athlete)

    profile = compute_athlete_age_equivalent(db, athlete_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Състезателят не е намерен")

    return AgeEquivalentOut(
        athlete_id=profile.athlete_id,
        athlete_name=profile.athlete_name,
        gender=profile.gender,
        age_band=profile.age_band,
        own_age=profile.own_age,
        tests=[
            AgeEquivalentTestOut(
                test_code=t.test_code,
                test_name=t.test_name,
                unit=t.unit,
                category=t.category,
                higher_better=t.higher_better,
                latest=t.latest,
                equivalent_age=t.equivalent_age,
                status=t.status,
                points_used=t.points_used,
                delta_years=t.delta_years,
            )
            for t in profile.tests
        ],
    )


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
# Скаутска таблица (всички достъпни деца × тестове, две сравнения)
# =========================
def _scoped_athletes_query(db: Session, user: User):
    """Атлетите, които потребителят има право да вижда (по роля)."""
    role = _role_value(user)
    query = db.query(Athlete).filter(Athlete.is_active.is_(True))
    if role in (UserRole.platform_admin.value, UserRole.federation_admin.value):
        return query
    if role == UserRole.club_head_coach.value and getattr(user, "club_id", None):
        return query.filter(Athlete.club_id == user.club_id)
    return query.filter(Athlete.coach_id == user.id)


@router.get("/scouting", response_model=ScoutingTableOut)
def scouting_table(
    gender: Optional[str] = Query(None, description="Филтър по пол: male/female"),
    age_band: Optional[str] = Query(None, description="Възрастова група, напр. U13"),
    team_id: Optional[int] = Query(None, description="Само деца от този отбор"),
    test_code: Optional[str] = Query(None, description="Само този тест (иначе всички точкуеми)"),
    include_anthropometry: bool = Query(
        False,
        description="Включи колони за ръст/тегло/разтег (антропометрия)",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_READ_ROLES)),
):
    """Скаутска таблица: деца × тестове, с две сравнения (стандарт 2022 + връстници).

    Само четене — не променя официалните оценки. Достъпът се определя от ролята:
    треньор вижда своите деца, главен треньор — клуба, админ/федерация — всички.
    """
    # Колони: точкуеми тестове; антропометрията е опционална (toggle от UI).
    test_query = db.query(TestDefinition).filter(TestDefinition.is_active.is_(True))
    if test_code:
        test_query = test_query.filter(TestDefinition.code == test_code)
    scored: list[TestDefinition] = []
    anthro: list[TestDefinition] = []
    for t in test_query.order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc()).all():
        cat = _norm_value(t.category)
        direction = _norm_value(t.direction)
        if cat == "anthropometry":
            if include_anthropometry:
                anthro.append(t)
            continue
        if direction == "context":
            continue
        scored.append(t)
    # Антропометрията е в началото — по-лесно сравнение по ръст/разтег/кг.
    tests = [*anthro, *scored]

    # Редове: достъпните деца + филтри.
    athlete_query = _scoped_athletes_query(db, current_user)
    if gender:
        athlete_query = athlete_query.filter(Athlete.gender == gender)
    if age_band:
        birth_year = birth_year_for_band(age_band)
        if birth_year is not None:
            athlete_query = athlete_query.filter(Athlete.birth_year == birth_year)
    if team_id is not None:
        member_ids = select(TeamMember.athlete_id).where(TeamMember.team_id == team_id)
        athlete_query = athlete_query.filter(Athlete.id.in_(member_ids))
    athletes = athlete_query.order_by(Athlete.athlete_name.asc()).all()

    rows = build_scouting_table(db, athletes, tests)

    return ScoutingTableOut(
        tests=[
            ScoutTestOut(
                code=t.code,
                name=t.name,
                category=_norm_value(t.category),
                unit=t.unit,
                direction=_norm_value(t.direction),
            )
            for t in tests
        ],
        rows=[
            ScoutRowOut(
                athlete_id=r.athlete_id,
                athlete_name=r.athlete_name,
                age_band=r.age_band,
                gender=r.gender,
                cells=[
                    ScoutCellOut(
                        test_code=c.test_code,
                        raw_value=c.raw_value,
                        score_2022=c.score_2022,
                        score_2022_label=c.score_2022_label,
                        peer_percentile=c.peer_percentile,
                        peer_sample=c.peer_sample,
                        peer_indicative=c.peer_indicative,
                        talent_score=c.talent_score,
                        talent_label=c.talent_label,
                    )
                    for c in r.cells
                ],
            )
            for r in rows
        ],
        filters={
            "gender": gender,
            "age_band": age_band,
            "team_id": team_id,
            "test_code": test_code,
            "include_anthropometry": include_anthropometry,
        },
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


# =========================
# Машина за национални норми (Фаза 2 — само федерация/админ)
# =========================
def _norm_cell_out(c) -> NationalNormCellOut:
    return NationalNormCellOut(
        test_code=c.test_code,
        age_band=c.age_band,
        gender=c.gender,
        n=c.n,
        mean=c.mean,
        std=c.std,
        p20=c.p20,
        p40=c.p40,
        p60=c.p60,
        p80=c.p80,
        clubs_count=c.clubs_count,
        regions_count=c.regions_count,
        coverage=c.coverage,
        season_count=c.season_count,
        eligible_athletes=c.eligible_athletes,
        display_ready=c.display_ready,
        trust_ready=c.trust_ready,
        confidence=c.confidence,
        has_2022=c.has_2022,
        mean_score_2022=c.mean_score_2022,
        mean_label_2022=c.mean_label_2022,
        is_approved=c.is_approved,
    )


def _national_norms_response(
    db: Session,
    *,
    gender: Optional[str],
    age_band: Optional[str],
    test_code: Optional[str],
) -> NationalNormMachineOut:
    cands = compute_candidates(db, gender=gender, age_band=age_band, test_code=test_code)
    names = {code: (name, unit, _norm_value(cat)) for code, name, unit, cat in db.query(
        TestDefinition.code, TestDefinition.name, TestDefinition.unit, TestDefinition.category
    ).all()}
    cells = []
    for c in cands:
        out = _norm_cell_out(c)
        meta = names.get(c.test_code)
        if meta:
            out.test_name, out.unit, out.category = meta
        cells.append(out)
    return NationalNormMachineOut(
        cells=cells,
        min_display_sample=MIN_DISPLAY_SAMPLE,
        min_trust_sample=MIN_TRUST_SAMPLE,
        filters={"gender": gender, "age_band": age_band, "test_code": test_code},
    )


@router.get("/national-norms", response_model=NationalNormMachineOut)
def national_norms(
    gender: Optional[str] = Query(None, description="Филтър по пол: male/female"),
    age_band: Optional[str] = Query(None, description="Възрастова група, напр. U13"),
    test_code: Optional[str] = Query(None, description="Само този тест"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_DASHBOARD_ROLES)),
):
    """Машина за национални норми: живата българска летва по клетки, до 2022.

    Показва клетки с поне MIN_DISPLAY_SAMPLE деца (индикативно). Само четене —
    не променя нищо. Активирането като официална основа е през /approve.
    """
    return _national_norms_response(db, gender=gender, age_band=age_band, test_code=test_code)


@router.post("/national-norms/approve", response_model=NationalNormCellOut)
def national_norms_approve(
    payload: NationalNormActionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_DASHBOARD_ROLES)),
):
    """Одобрява живата норма за клетка като официална основа (изисква ≥ праг деца)."""
    try:
        approve_cell(db, payload.test_code, payload.age_band, payload.gender)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    cands = compute_candidates(
        db, gender=payload.gender, age_band=payload.age_band, test_code=payload.test_code
    )
    for c in cands:
        if c.test_code == payload.test_code and c.age_band == payload.age_band and c.gender == payload.gender:
            return _norm_cell_out(c)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клетката не е намерена след одобрение.")


@router.post("/national-norms/revoke", response_model=NationalNormCellOut)
def national_norms_revoke(
    payload: NationalNormActionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_DASHBOARD_ROLES)),
):
    """Оттегля одобрението: нормата спира да е официална основа (пада на 2022/кохорта)."""
    revoke_cell(db, payload.test_code, payload.age_band, payload.gender)
    cands = compute_candidates(
        db,
        gender=payload.gender,
        age_band=payload.age_band,
        test_code=payload.test_code,
        include_below_display=True,
    )
    for c in cands:
        if c.test_code == payload.test_code and c.age_band == payload.age_band and c.gender == payload.gender:
            return _norm_cell_out(c)
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Клетката не е намерена.")


@router.post("/national-norms/recompute", response_model=NationalNormMachineOut)
def national_norms_recompute(
    gender: Optional[str] = Query(None),
    age_band: Optional[str] = Query(None),
    test_code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_DASHBOARD_ROLES)),
):
    """Опреснява одобрените норми с текущите данни и връща свежата таблица."""
    refresh_approved_norms(db)
    return _national_norms_response(db, gender=gender, age_band=age_band, test_code=test_code)
