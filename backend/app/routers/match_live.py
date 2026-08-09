# backend/app/routers/match_live.py
from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, User, UserRole
from app.models_matches import (
    Match,
    MatchFormat,
    MatchLineupSlot,
    MatchPosition,
    MatchRosterPlayer,
    MatchSet,
    MatchSetStatus,
    MatchStatAction,
    MatchStatEvent,
    MatchStatus,
    MatchSystem,
)
from app.routers.teams import _ensure_team_owner
from app.schemas.matches import (
    MatchAthleteStatsRead,
    MatchBenchPlayerRead,
    MatchCourtPlayerRead,
    MatchLiveEventRead,
    MatchLiveLockIn,
    MatchLivePositionsIn,
    MatchLiveScoreIn,
    MatchLiveSetRead,
    MatchLiveSetSummary,
    MatchLiveShareRead,
    MatchLiveStart,
    MatchLiveStateRead,
    MatchLiveStatIn,
    MatchLiveSubIn,
    MatchPublicLiveRead,
    MatchReportRead,
    MatchRotationStatsRead,
    MatchSetStatsRead,
    MatchSideOutRead,
    MatchSubHistoryRead,
)
from app.services.match_rotations import ZONE_LABELS_BG
from app.services import match_systems
from app.services.match_live import (
    action_point_side,
    apply_point,
    count_sets_won,
    is_match_won,
    is_set_won,
    max_sets,
    normalize_format,
    sets_to_win,
)
from app.services import match_report as match_report_svc

router = APIRouter(prefix="/api/teams/{team_id}/matches", tags=["Match Live"])

COACH_ROLES = (UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)


def _get_match(db: Session, team_id: int, match_id: int) -> Match:
    match = db.query(Match).filter(Match.id == match_id, Match.team_id == team_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Мачът не е намерен")
    return match


def _active_set(db: Session, match_id: int) -> MatchSet | None:
    return (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match_id, MatchSet.status == MatchSetStatus.in_progress)
        .order_by(MatchSet.set_number.desc())
        .first()
    )


def _match_format(match: Match) -> str:
    fmt = getattr(match, "format", None)
    if isinstance(fmt, MatchFormat):
        return fmt.value
    return normalize_format(fmt)


def _all_sets(db: Session, match_id: int) -> list[MatchSet]:
    return (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match_id)
        .order_by(MatchSet.set_number.asc())
        .all()
    )


def _set_start_rotation(mset: MatchSet) -> int:
    return int(getattr(mset, "start_rotation", None) or mset.rotation or 1)


def _set_start_we_serve(mset: MatchSet) -> bool:
    raw = getattr(mset, "start_we_serve", None)
    if raw is None:
        return bool(mset.we_serve)
    return bool(raw)


def _roster_map(db: Session, match_id: int) -> dict[int, MatchRosterPlayer]:
    rows = db.query(MatchRosterPlayer).filter(MatchRosterPlayer.match_id == match_id).all()
    return {int(r.athlete_id): r for r in rows}


def _athlete_names(db: Session, athlete_ids: list[int]) -> dict[int, str]:
    if not athlete_ids:
        return {}
    rows = db.query(Athlete.id, Athlete.athlete_name).filter(Athlete.id.in_(athlete_ids)).all()
    return {int(i): (n or "") for i, n in rows}


def _court_for_rotation(
    db: Session,
    match: Match,
    rotation: int,
    *,
    phase: str = "serve",
) -> tuple[list[MatchCourtPlayerRead], MatchCourtPlayerRead | None]:
    slots = db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).all()
    if len(slots) != 6:
        raise HTTPException(status_code=422, detail="Нужна е стартова шестица преди live")
    starting = {int(s.zone): int(s.athlete_id) for s in slots}
    roster = _roster_map(db, match.id)
    names = _athlete_names(
        db,
        list({*starting.values(), *([int(match.libero_athlete_id)] if match.libero_athlete_id else [])}),
    )

    system = match.system.value if isinstance(match.system, MatchSystem) else str(match.system)
    if not match_systems.is_supported(system):
        raise HTTPException(status_code=422, detail=f"Live е наличен за схеми: {', '.join(match_systems.SUPPORTED_SYSTEMS)}")

    libero_id = int(match.libero_athlete_id) if match.libero_athlete_id else None
    pos_by_athlete = {
        int(aid): (rp.position.value if isinstance(rp.position, MatchPosition) else str(rp.position))
        for aid, rp in roster.items()
    }
    roles = match_systems.assign_roles(system, starting, pos_by_athlete)
    role_by_athlete: dict[int, str] = {}

    if match_systems.roles_complete(system, roles):
        display_zones = match_systems.apply_formation_display(
            system,
            rotation=int(rotation),
            phase=phase,
            role_to_athlete=roles,
            libero_athlete_id=libero_id,
        )
        role_by_athlete = match_systems.athlete_roles_on_court(
            system,
            rotation=int(rotation),
            phase=phase,
            role_to_athlete=roles,
            libero_athlete_id=libero_id,
        )
    else:
        rotations = match_systems.build_rotations(system, starting, libero_athlete_id=libero_id)
        rot = next((r for r in rotations if int(r["rotation"]) == int(rotation)), rotations[0])
        display_zones = {int(z): int(aid) for z, aid in rot["zones"].items()}

    court: list[MatchCourtPlayerRead] = []
    for zone, aid in sorted(display_zones.items()):
        rp = roster.get(int(aid))
        if not rp:
            if libero_id and int(aid) == libero_id:
                court.append(
                    MatchCourtPlayerRead(
                        zone=int(zone),
                        zone_label=ZONE_LABELS_BG.get(int(zone), str(zone)),
                        athlete_id=int(aid),
                        athlete_name=names.get(int(aid), ""),
                        jersey_number=int(roster[libero_id].jersey_number) if libero_id in roster else 0,
                        position="L",
                        role=role_by_athlete.get(int(aid), "L"),
                    )
                )
            continue
        pos = rp.position.value if isinstance(rp.position, MatchPosition) else str(rp.position)
        court.append(
            MatchCourtPlayerRead(
                zone=int(zone),
                zone_label=ZONE_LABELS_BG.get(int(zone), str(zone)),
                athlete_id=int(aid),
                athlete_name=names.get(int(aid), ""),
                jersey_number=int(rp.jersey_number),
                position=pos,
                role=role_by_athlete.get(int(aid)),
            )
        )

    libero = None
    # Ако либерото вече е на корта (замяна на C), не дублирай реда долу
    on_court_ids = {int(p.athlete_id) for p in court}
    if libero_id and libero_id in roster and libero_id not in on_court_ids:
        rp = roster[libero_id]
        pos = rp.position.value if isinstance(rp.position, MatchPosition) else str(rp.position)
        libero = MatchCourtPlayerRead(
            zone=0,
            zone_label="Либеро",
            athlete_id=libero_id,
            athlete_name=names.get(libero_id, ""),
            jersey_number=int(rp.jersey_number),
            position=pos,
        )
    return court, libero


def _bench_and_off_court(
    db: Session,
    match: Match,
    court: list[MatchCourtPlayerRead],
) -> tuple[list[MatchBenchPlayerRead], list[MatchBenchPlayerRead]]:
    roster = _roster_map(db, match.id)
    slots = db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).all()
    lineup_ids = {int(s.athlete_id) for s in slots}
    on_court_ids = {int(p.athlete_id) for p in court}
    libero_id = int(match.libero_athlete_id) if match.libero_athlete_id else None
    names = _athlete_names(db, list(roster.keys()))

    bench: list[MatchBenchPlayerRead] = []
    off_court: list[MatchBenchPlayerRead] = []
    for aid, rp in roster.items():
        aid_i = int(aid)
        pos = rp.position.value if isinstance(rp.position, MatchPosition) else str(rp.position)
        row = MatchBenchPlayerRead(
            athlete_id=aid_i,
            athlete_name=names.get(aid_i, ""),
            jersey_number=int(rp.jersey_number),
            position=pos,
            reason="bench",
        )
        if aid_i in lineup_ids:
            if aid_i not in on_court_ids:
                off_court.append(row.model_copy(update={"reason": "off_court"}))
            continue
        if libero_id and aid_i == libero_id:
            continue
        bench.append(row)

    bench.sort(key=lambda p: p.jersey_number)
    off_court.sort(key=lambda p: p.jersey_number)
    return bench, off_court


def _recent_events(db: Session, match_id: int, set_id: int, limit: int = 12) -> list[MatchLiveEventRead]:
    rows = (
        db.query(MatchStatEvent)
        .filter(MatchStatEvent.match_id == match_id, MatchStatEvent.set_id == set_id, MatchStatEvent.undone == 0)
        .order_by(MatchStatEvent.id.desc())
        .limit(limit)
        .all()
    )
    ids: list[int] = []
    for r in rows:
        if r.athlete_id:
            ids.append(int(r.athlete_id))
        if getattr(r, "related_athlete_id", None):
            ids.append(int(r.related_athlete_id))
    names = _athlete_names(db, ids)
    out: list[MatchLiveEventRead] = []
    for r in rows:
        action = r.action.value if isinstance(r.action, MatchStatAction) else str(r.action)
        rel_id = int(r.related_athlete_id) if getattr(r, "related_athlete_id", None) else None
        out.append(
            MatchLiveEventRead(
                id=r.id,
                athlete_id=int(r.athlete_id) if r.athlete_id else None,
                athlete_name=names.get(int(r.athlete_id), None) if r.athlete_id else None,
                related_athlete_id=rel_id,
                related_athlete_name=names.get(rel_id) if rel_id else None,
                action=action,
                rotation=int(r.rotation),
                our_score=int(r.our_score),
                opp_score=int(r.opp_score),
                we_serve=bool(r.we_serve),
                scored_for=r.scored_for,
                created_at=r.created_at,
            )
        )
    return out


def _state(db: Session, match: Match, *, phase_override: str | None = None) -> MatchLiveStateRead:
    fmt = _match_format(match)
    all_sets = _all_sets(db, match.id)
    sets_won_us, sets_won_opp = count_sets_won(all_sets)
    won_by = is_match_won(sets_won_us, sets_won_opp, fmt)
    need = sets_to_win(fmt)
    cap = max_sets(fmt)

    active = _active_set(db, match.id)
    mset = active
    if not mset and all_sets:
        # Between sets or finished: show last set for scoreboard context
        mset = all_sets[-1]

    court: list[MatchCourtPlayerRead] = []
    libero = None
    bench: list[MatchBenchPlayerRead] = []
    off_court: list[MatchBenchPlayerRead] = []
    events: list[MatchLiveEventRead] = []
    can_undo = False
    set_read = None
    phase = "serve"

    if mset:
        phase = match_systems.phase_from_serve(bool(mset.we_serve), phase_override)
        try:
            court, libero = _court_for_rotation(db, match, int(mset.rotation), phase=phase)
            bench, off_court = _bench_and_off_court(db, match, court)
        except HTTPException:
            court, libero = [], None
            bench, off_court = [], []
        events = _recent_events(db, match.id, mset.id, limit=400)
        can_undo = (
            active is not None
            and db.query(MatchStatEvent)
            .filter(MatchStatEvent.set_id == mset.id, MatchStatEvent.undone == 0)
            .count()
            > 0
        )
        set_read = MatchLiveSetRead(
            id=mset.id,
            set_number=int(mset.set_number),
            our_score=int(mset.our_score),
            opp_score=int(mset.opp_score),
            rotation=int(mset.rotation),
            we_serve=bool(mset.we_serve),
            start_rotation=_set_start_rotation(mset),
            start_we_serve=_set_start_we_serve(mset),
            status=mset.status.value if isinstance(mset.status, MatchSetStatus) else str(mset.status),
        )

    set_summaries = [
        MatchLiveSetSummary(
            set_number=int(s.set_number),
            our_score=int(s.our_score),
            opp_score=int(s.opp_score),
            status=s.status.value if isinstance(s.status, MatchSetStatus) else str(s.status),
        )
        for s in all_sets
    ]

    status = match.status.value if isinstance(match.status, MatchStatus) else str(match.status)
    finished = status == MatchStatus.finished.value or won_by is not None
    needs_set_start = (not finished) and active is None and (won_by is None) and (
        len(all_sets) < cap
    )
    # Lineup editable before first set, or between sets (no active set)
    can_edit_lineup = (not finished) and active is None

    system = match.system.value if isinstance(match.system, MatchSystem) else str(match.system)
    return MatchLiveStateRead(
        match_id=match.id,
        team_id=match.team_id,
        opponent_name=match.opponent_name,
        system=system,
        format=fmt,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        phase=phase,  # type: ignore[arg-type]
        set=set_read,
        sets=set_summaries,
        sets_won_us=sets_won_us,
        sets_won_opp=sets_won_opp,
        sets_to_win=need,
        max_sets=cap,
        needs_set_start=needs_set_start,
        can_edit_lineup=can_edit_lineup,
        match_won_by=won_by,  # type: ignore[arg-type]
        input_locked=bool(getattr(match, "live_input_locked", 0)),
        share_token=getattr(match, "live_share_token", None) or None,
        court_positions=dict(getattr(match, "live_court_positions", None) or {}),
        court=court,
        libero=libero,
        bench=bench,
        off_court=off_court,
        recent_events=events,
        can_undo=can_undo,
    )


def _clear_share_token(match: Match) -> None:
    if getattr(match, "live_share_token", None):
        match.live_share_token = None


def _assert_writable(match: Match) -> None:
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")
    if bool(getattr(match, "live_input_locked", 0)):
        raise HTTPException(status_code=423, detail="Въвеждането е заключено")


def _maybe_finish_match(db: Session, match: Match) -> None:
    fmt = _match_format(match)
    us, opp = count_sets_won(_all_sets(db, match.id))
    if is_match_won(us, opp, fmt):
        match.status = MatchStatus.finished
        _clear_share_token(match)


def _record_event(
    db: Session,
    *,
    match: Match,
    mset: MatchSet,
    action: MatchStatAction,
    athlete_id: int | None,
    scored_for: str | None,
    related_athlete_id: int | None = None,
) -> MatchStatEvent:
    ev = MatchStatEvent(
        match_id=match.id,
        set_id=mset.id,
        athlete_id=athlete_id,
        related_athlete_id=related_athlete_id,
        action=action,
        rotation=int(mset.rotation),
        our_score=int(mset.our_score),
        opp_score=int(mset.opp_score),
        we_serve=1 if mset.we_serve else 0,
        scored_for=scored_for,
        undone=0,
    )
    db.add(ev)
    return ev


@router.post("/{match_id}/live/start", response_model=MatchLiveStateRead)
def start_live(
    team_id: int,
    match_id: int,
    payload: MatchLiveStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    if db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).count() != 6:
        raise HTTPException(status_code=422, detail="Първо запишете стартовата шестица")

    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")

    existing = _active_set(db, match.id)
    if existing:
        match.status = MatchStatus.live
        db.commit()
        return _state(db, match)

    all_sets = _all_sets(db, match.id)
    fmt = _match_format(match)
    if all_sets:
        raise HTTPException(status_code=422, detail="Има вече геймове — ползвайте следващ гейм")
    if is_match_won(*count_sets_won(all_sets), fmt):
        raise HTTPException(status_code=422, detail="Мачът вече има победител")

    rotation = int(payload.rotation or 1)
    we_serve = 1 if payload.we_serve else 0
    mset = MatchSet(
        match_id=match.id,
        set_number=1,
        our_score=0,
        opp_score=0,
        rotation=rotation,
        we_serve=we_serve,
        start_rotation=rotation,
        start_we_serve=we_serve,
        status=MatchSetStatus.in_progress,
    )
    db.add(mset)
    match.status = MatchStatus.live
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.get("/{match_id}/live", response_model=MatchLiveStateRead)
def get_live(
    team_id: int,
    match_id: int,
    phase: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    override = phase if phase in ("base", "serve", "receive") else None
    return _state(db, match, phase_override=override)


@router.post("/{match_id}/live/score", response_model=MatchLiveStateRead)
def live_score(
    team_id: int,
    match_id: int,
    payload: MatchLiveScoreIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    mset = _active_set(db, match.id)
    if not mset:
        raise HTTPException(status_code=422, detail="Няма активен гейм — стартирайте live")
    _assert_writable(match)

    nxt = apply_point(
        our_score=mset.our_score,
        opp_score=mset.opp_score,
        rotation=mset.rotation,
        we_serve=bool(mset.we_serve),
        scored_for=payload.side,
    )
    mset.our_score = nxt["our_score"]
    mset.opp_score = nxt["opp_score"]
    mset.rotation = nxt["rotation"]
    mset.we_serve = 1 if nxt["we_serve"] else 0
    action = MatchStatAction.our_point if payload.side == "us" else MatchStatAction.opp_point
    _record_event(db, match=match, mset=mset, action=action, athlete_id=None, scored_for=payload.side)

    fmt = _match_format(match)
    winner = is_set_won(mset.our_score, mset.opp_score, mset.set_number, fmt)
    if winner:
        mset.status = MatchSetStatus.finished
        match.status = MatchStatus.live
        db.flush()
        _maybe_finish_match(db, match)
    else:
        match.status = MatchStatus.live

    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/stat", response_model=MatchLiveStateRead)
def live_stat(
    team_id: int,
    match_id: int,
    payload: MatchLiveStatIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    mset = _active_set(db, match.id)
    if not mset:
        raise HTTPException(status_code=422, detail="Няма активен гейм — стартирайте live")
    _assert_writable(match)

    try:
        action = MatchStatAction(payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Невалидно действие") from exc

    athlete_id = int(payload.athlete_id) if payload.athlete_id else None
    if athlete_id is not None:
        ok = (
            db.query(MatchRosterPlayer)
            .filter(MatchRosterPlayer.match_id == match.id, MatchRosterPlayer.athlete_id == athlete_id)
            .first()
        )
        if not ok:
            raise HTTPException(status_code=422, detail="Състезателят не е в мачовия състав")

    scored_for = action_point_side(action) if payload.apply_score else None
    if scored_for:
        nxt = apply_point(
            our_score=mset.our_score,
            opp_score=mset.opp_score,
            rotation=mset.rotation,
            we_serve=bool(mset.we_serve),
            scored_for=scored_for,
        )
        mset.our_score = nxt["our_score"]
        mset.opp_score = nxt["opp_score"]
        mset.rotation = nxt["rotation"]
        mset.we_serve = 1 if nxt["we_serve"] else 0

    _record_event(db, match=match, mset=mset, action=action, athlete_id=athlete_id, scored_for=scored_for)
    fmt = _match_format(match)
    winner = is_set_won(mset.our_score, mset.opp_score, mset.set_number, fmt)
    if winner:
        mset.status = MatchSetStatus.finished
        match.status = MatchStatus.live
        db.flush()
        _maybe_finish_match(db, match)
    else:
        match.status = MatchStatus.live
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/undo", response_model=MatchLiveStateRead)
def live_undo(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    mset = _active_set(db, match.id)
    if not mset:
        # Allow undo on just-finished set
        mset = (
            db.query(MatchSet)
            .filter(MatchSet.match_id == match.id)
            .order_by(MatchSet.set_number.desc())
            .first()
        )
    if not mset:
        raise HTTPException(status_code=422, detail="Няма гейм за undo")
    _assert_writable(match)

    last = (
        db.query(MatchStatEvent)
        .filter(MatchStatEvent.set_id == mset.id, MatchStatEvent.undone == 0)
        .order_by(MatchStatEvent.id.desc())
        .first()
    )
    if not last:
        raise HTTPException(status_code=422, detail="Няма действие за undo")

    last.undone = 1
    prev = (
        db.query(MatchStatEvent)
        .filter(MatchStatEvent.set_id == mset.id, MatchStatEvent.undone == 0, MatchStatEvent.id < last.id)
        .order_by(MatchStatEvent.id.desc())
        .first()
    )
    if prev:
        mset.our_score = int(prev.our_score)
        mset.opp_score = int(prev.opp_score)
        mset.rotation = int(prev.rotation)
        mset.we_serve = int(prev.we_serve)
    else:
        mset.our_score = 0
        mset.opp_score = 0
        mset.rotation = _set_start_rotation(mset)
        mset.we_serve = 1 if _set_start_we_serve(mset) else 0
    if mset.status == MatchSetStatus.finished:
        mset.status = MatchSetStatus.in_progress
    match.status = MatchStatus.live
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/next-set", response_model=MatchLiveStateRead)
def live_next_set(
    team_id: int,
    match_id: int,
    payload: MatchLiveStart,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")

    active = _active_set(db, match.id)
    if active:
        raise HTTPException(status_code=422, detail="Има незавършен гейм")
    _assert_writable(match)

    if db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).count() != 6:
        raise HTTPException(status_code=422, detail="Запишете шестицата преди следващия гейм")

    all_sets = _all_sets(db, match.id)
    fmt = _match_format(match)
    us, opp = count_sets_won(all_sets)
    if is_match_won(us, opp, fmt):
        match.status = MatchStatus.finished
        db.commit()
        db.refresh(match)
        raise HTTPException(status_code=422, detail="Мачът вече има победител")

    last = all_sets[-1] if all_sets else None
    next_num = int(last.set_number) + 1 if last else 1
    cap = max_sets(fmt)
    if next_num > cap:
        raise HTTPException(status_code=422, detail=f"Максимум {cap} гейма за този формат")

    rotation = int(payload.rotation or 1)
    we_serve = 1 if payload.we_serve else 0
    mset = MatchSet(
        match_id=match.id,
        set_number=next_num,
        our_score=0,
        opp_score=0,
        rotation=rotation,
        we_serve=we_serve,
        start_rotation=rotation,
        start_we_serve=we_serve,
        status=MatchSetStatus.in_progress,
    )
    db.add(mset)
    match.status = MatchStatus.live
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/share", response_model=MatchLiveShareRead)
def live_share(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Създава/връща публичен spectator линк (без login). Изтрива се при край на мача."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен — публичният линк е изтрит")
    token = getattr(match, "live_share_token", None)
    if not token:
        token = secrets.token_urlsafe(24)
        match.live_share_token = token
        db.commit()
        db.refresh(match)
    return MatchLiveShareRead(share_token=token, share_path=f"/watch/{token}")


@router.post("/{match_id}/live/share/revoke", response_model=MatchLiveStateRead)
def live_share_revoke(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    _clear_share_token(match)
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/lock", response_model=MatchLiveStateRead)
def live_lock(
    team_id: int,
    match_id: int,
    payload: MatchLiveLockIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Заключва/отключва въвеждането — полезно при два екрана (помощник + треньор)."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")
    match.live_input_locked = 1 if payload.locked else 0
    db.commit()
    db.refresh(match)
    return _state(db, match)


def apply_court_positions(match: Match, payload: MatchLivePositionsIn) -> None:
    """Записва XY позиции за ключ rotation:phase върху match.live_court_positions."""
    key = f"{int(payload.rotation)}:{payload.phase}"
    cleaned: dict[str, dict[str, float]] = {}
    for z_raw, xy in (payload.positions or {}).items():
        try:
            z = int(z_raw)
        except (TypeError, ValueError):
            continue
        if z < 1 or z > 6 or not isinstance(xy, dict):
            continue
        try:
            x = float(xy.get("x", 50))
            y = float(xy.get("y", 50))
        except (TypeError, ValueError):
            continue
        cleaned[str(z)] = {
            "x": max(0.0, min(100.0, x)),
            "y": max(0.0, min(100.0, y)),
        }

    blob = dict(getattr(match, "live_court_positions", None) or {})
    if cleaned:
        blob[key] = cleaned
    elif key in blob:
        del blob[key]
    match.live_court_positions = blob or None


@router.put("/{match_id}/live/positions", response_model=MatchLiveStateRead)
def live_positions(
    team_id: int,
    match_id: int,
    payload: MatchLivePositionsIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Запазва XY позиции за ротация+фаза (влачене на корта)."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    _assert_writable(match)
    apply_court_positions(match, payload)
    db.commit()
    db.refresh(match)
    return _state(db, match)


def apply_live_substitution(db: Session, match: Match, *, out_athlete_id: int, in_athlete_id: int) -> None:
    """Сменя състезател в стартовата шестица (R1 слот) по време на live."""
    out_id = int(out_athlete_id)
    in_id = int(in_athlete_id)
    if out_id == in_id:
        raise HTTPException(status_code=422, detail="Един и същ състезател")

    roster = _roster_map(db, match.id)
    if out_id not in roster:
        raise HTTPException(status_code=422, detail="Играчът за излизане не е в състава")
    if in_id not in roster:
        raise HTTPException(status_code=422, detail="Играчът за влизане не е в състава")

    libero_id = int(match.libero_athlete_id) if match.libero_athlete_id else None
    if libero_id and out_id == libero_id:
        raise HTTPException(
            status_code=422,
            detail="Либеро ↔ център е автоматично и не се брои за смяна",
        )
    if libero_id and in_id == libero_id:
        raise HTTPException(
            status_code=422,
            detail="Либерото влиза автоматично — смяната е само полеви ↔ резерва",
        )

    slots = db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).all()
    if len(slots) != 6:
        raise HTTPException(status_code=422, detail="Няма пълна шестица")

    lineup_ids = {int(s.athlete_id) for s in slots}
    if out_id not in lineup_ids:
        raise HTTPException(status_code=422, detail="Играчът не е в шестицата")
    if in_id in lineup_ids:
        raise HTTPException(status_code=422, detail="Играчът вече е на корта / в шестицата")

    slot = next(s for s in slots if int(s.athlete_id) == out_id)
    slot.athlete_id = in_id

    mset = _active_set(db, match.id)
    if mset:
        _record_event(
            db,
            match=match,
            mset=mset,
            action=MatchStatAction.substitution,
            athlete_id=out_id,
            related_athlete_id=in_id,
            scored_for=None,
        )


@router.post("/{match_id}/live/sub", response_model=MatchLiveStateRead)
def live_sub(
    team_id: int,
    match_id: int,
    payload: MatchLiveSubIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Смяна по време на гейм — out ↔ in (резерва)."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    _assert_writable(match)
    mset = _active_set(db, match.id)
    if not mset or mset.status != MatchSetStatus.in_progress:
        raise HTTPException(status_code=422, detail="Няма активен гейм")

    apply_live_substitution(db, match, out_athlete_id=payload.out_athlete_id, in_athlete_id=payload.in_athlete_id)
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.post("/{match_id}/live/finish", response_model=MatchLiveStateRead)
def live_finish(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    active = _active_set(db, match.id)
    if active:
        active.status = MatchSetStatus.finished
    match.status = MatchStatus.finished
    _clear_share_token(match)
    db.commit()
    db.refresh(match)
    return _state(db, match)


@router.get("/{match_id}/report", response_model=MatchReportRead)
def match_report(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Full-match box score + short insights from all non-undone events."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)

    roster_rows = (
        db.query(MatchRosterPlayer, Athlete)
        .join(Athlete, Athlete.id == MatchRosterPlayer.athlete_id)
        .filter(MatchRosterPlayer.match_id == match.id)
        .order_by(MatchRosterPlayer.sort_order.asc(), MatchRosterPlayer.jersey_number.asc())
        .all()
    )
    roster = [
        {
            "athlete_id": int(p.athlete_id),
            "athlete_name": athlete.athlete_name or "",
            "jersey_number": int(p.jersey_number),
            "position": p.position.value if isinstance(p.position, MatchPosition) else str(p.position),
        }
        for p, athlete in roster_rows
    ]

    all_sets = _all_sets(db, match.id)
    fmt = _match_format(match)
    sets_won_us, sets_won_opp = count_sets_won(all_sets)
    won_by = is_match_won(sets_won_us, sets_won_opp, fmt)

    events = (
        db.query(MatchStatEvent)
        .filter(MatchStatEvent.match_id == match.id, MatchStatEvent.undone == 0)
        .order_by(MatchStatEvent.id.asc())
        .all()
    )

    events_by_set: dict[int, list] = {int(s.id): [] for s in all_sets}
    for ev in events:
        sid = int(ev.set_id)
        events_by_set.setdefault(sid, []).append(ev)

    athletes_raw = match_report_svc.aggregate_events(events, roster=roster)
    athletes = [MatchAthleteStatsRead(**row) for row in athletes_raw]

    set_number_by_id = {int(s.id): int(s.set_number) for s in all_sets}

    # Match-level side-out: replay across sets in order (each set has own start serve/rot)
    match_side = {
        "side_out_attempts": 0,
        "side_out_won": 0,
        "side_out_pct": None,
        "break_attempts": 0,
        "break_won": 0,
        "break_pct": None,
        "points_for": 0,
        "points_against": 0,
    }
    match_rot_acc: dict[int, dict] = {}

    by_set: list[MatchSetStatsRead] = []
    set_summaries: list[MatchLiveSetSummary] = []
    for s in all_sets:
        status = s.status.value if isinstance(s.status, MatchSetStatus) else str(s.status)
        set_summaries.append(
            MatchLiveSetSummary(
                set_number=int(s.set_number),
                our_score=int(s.our_score),
                opp_score=int(s.opp_score),
                status=status,
            )
        )
        set_events = events_by_set.get(int(s.id), [])
        set_athletes = match_report_svc.aggregate_events(set_events, roster=roster)
        # Only show athletes with any recorded action in this set
        set_athletes = [
            a
            for a in set_athletes
            if any(
                int(a.get(k) or 0) > 0
                for k in (
                    "kills",
                    "attack_zero",
                    "attack_err",
                    "aces",
                    "serve_err",
                    "blocks",
                    "digs",
                    "pass_hash",
                    "pass_plus",
                    "pass_minus",
                    "pass_err",
                    "team_err",
                    "subs",
                )
            )
        ]
        analysis = match_report_svc.analyze_side_out_and_rotations(
            set_events,
            start_rotation=_set_start_rotation(s),
            start_we_serve=_set_start_we_serve(s),
        )
        so = analysis["side_out"]
        for k in (
            "side_out_attempts",
            "side_out_won",
            "break_attempts",
            "break_won",
            "points_for",
            "points_against",
        ):
            match_side[k] = int(match_side[k]) + int(so.get(k) or 0)
        for row in analysis["by_rotation"]:
            r = int(row["rotation"])
            acc = match_rot_acc.setdefault(
                r,
                {
                    "rotation": r,
                    "points_for": 0,
                    "points_against": 0,
                    "side_out_attempts": 0,
                    "side_out_won": 0,
                    "break_attempts": 0,
                    "break_won": 0,
                },
            )
            for k in (
                "points_for",
                "points_against",
                "side_out_attempts",
                "side_out_won",
                "break_attempts",
                "break_won",
            ):
                acc[k] = int(acc[k]) + int(row.get(k) or 0)

        set_subs = match_report_svc.list_substitutions(
            set_events,
            roster=roster,
            set_number_by_set_id=set_number_by_id,
            default_set_number=int(s.set_number),
        )
        by_set.append(
            MatchSetStatsRead(
                set_number=int(s.set_number),
                our_score=int(s.our_score),
                opp_score=int(s.opp_score),
                status=status,
                athletes=[MatchAthleteStatsRead(**row) for row in set_athletes],
                side_out=MatchSideOutRead(**so),
                by_rotation=[MatchRotationStatsRead(**row) for row in analysis["by_rotation"]],
                substitutions=[MatchSubHistoryRead(**row) for row in set_subs],
            )
        )

    match_side["side_out_pct"] = match_report_svc._pct(
        match_side["side_out_won"], match_side["side_out_attempts"]
    )
    match_side["break_pct"] = match_report_svc._pct(match_side["break_won"], match_side["break_attempts"])
    match_by_rotation: list[MatchRotationStatsRead] = []
    for r in range(1, 7):
        if r not in match_rot_acc:
            continue
        acc = match_rot_acc[r]
        acc["side_out_pct"] = match_report_svc._pct(acc["side_out_won"], acc["side_out_attempts"])
        acc["break_pct"] = match_report_svc._pct(acc["break_won"], acc["break_attempts"])
        acc["point_diff"] = int(acc["points_for"]) - int(acc["points_against"])
        match_by_rotation.append(MatchRotationStatsRead(**acc))

    match_subs = match_report_svc.list_substitutions(
        events,
        roster=roster,
        set_number_by_set_id=set_number_by_id,
    )

    match_analysis = {"side_out": match_side, "by_rotation": [r.model_dump() for r in match_by_rotation]}

    insights = match_report_svc.build_insights(
        athletes_raw,
        sets_won_us=sets_won_us,
        sets_won_opp=sets_won_opp,
    )
    insights = match_report_svc.enrich_insights_with_side_out(insights, match_analysis)
    if match_subs:
        insights.append(f"Смени: {len(match_subs)}")

    system = match.system.value if isinstance(match.system, MatchSystem) else str(match.system)
    status = match.status.value if isinstance(match.status, MatchStatus) else str(match.status)

    return MatchReportRead(
        match_id=match.id,
        team_id=match.team_id,
        opponent_name=match.opponent_name,
        match_date=match.match_date,
        venue=match.venue,
        system=system,  # type: ignore[arg-type]
        format=fmt,  # type: ignore[arg-type]
        status=status,  # type: ignore[arg-type]
        sets_won_us=sets_won_us,
        sets_won_opp=sets_won_opp,
        match_won_by=won_by,  # type: ignore[arg-type]
        sets=set_summaries,
        athletes=athletes,
        by_set=by_set,
        side_out=MatchSideOutRead(**match_side),
        by_rotation=match_by_rotation,
        substitutions=[MatchSubHistoryRead(**row) for row in match_subs],
        insights=insights,
        event_count=len(events),
    )
