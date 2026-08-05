# backend/app/routers/match_live.py
from __future__ import annotations

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
    MatchCourtPlayerRead,
    MatchLiveEventRead,
    MatchLiveScoreIn,
    MatchLiveSetRead,
    MatchLiveSetSummary,
    MatchLiveStart,
    MatchLiveStateRead,
    MatchLiveStatIn,
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


def _recent_events(db: Session, match_id: int, set_id: int, limit: int = 12) -> list[MatchLiveEventRead]:
    rows = (
        db.query(MatchStatEvent)
        .filter(MatchStatEvent.match_id == match_id, MatchStatEvent.set_id == set_id, MatchStatEvent.undone == 0)
        .order_by(MatchStatEvent.id.desc())
        .limit(limit)
        .all()
    )
    ids = [int(r.athlete_id) for r in rows if r.athlete_id]
    names = _athlete_names(db, ids)
    out: list[MatchLiveEventRead] = []
    for r in rows:
        action = r.action.value if isinstance(r.action, MatchStatAction) else str(r.action)
        out.append(
            MatchLiveEventRead(
                id=r.id,
                athlete_id=int(r.athlete_id) if r.athlete_id else None,
                athlete_name=names.get(int(r.athlete_id), None) if r.athlete_id else None,
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
    events: list[MatchLiveEventRead] = []
    can_undo = False
    set_read = None
    phase = "serve"

    if mset:
        phase = match_systems.phase_from_serve(bool(mset.we_serve), phase_override)
        try:
            court, libero = _court_for_rotation(db, match, int(mset.rotation), phase=phase)
        except HTTPException:
            court, libero = [], None
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
        court=court,
        libero=libero,
        recent_events=events,
        can_undo=can_undo,
    )


def _maybe_finish_match(db: Session, match: Match) -> None:
    fmt = _match_format(match)
    us, opp = count_sets_won(_all_sets(db, match.id))
    if is_match_won(us, opp, fmt):
        match.status = MatchStatus.finished


def _record_event(
    db: Session,
    *,
    match: Match,
    mset: MatchSet,
    action: MatchStatAction,
    athlete_id: int | None,
    scored_for: str | None,
) -> MatchStatEvent:
    ev = MatchStatEvent(
        match_id=match.id,
        set_id=mset.id,
        athlete_id=athlete_id,
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
    db.commit()
    db.refresh(match)
    return _state(db, match)
