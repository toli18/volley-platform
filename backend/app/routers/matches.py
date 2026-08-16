# backend/app/routers/matches.py
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, TeamMember, User, UserRole
from app.models_matches import (
    Match,
    MatchFormat,
    MatchLineupSlot,
    MatchPosition,
    MatchRosterPlayer,
    MatchSet,
    MatchSetStatus,
    MatchStatEvent,
    MatchStatus,
    MatchSystem,
)
from app.routers.teams import _ensure_team_owner
from app.schemas.matches import (
    MAX_MATCH_ROSTER,
    MatchCourtPlayerRead,
    MatchCreate,
    MatchDetailRead,
    MatchLineupPut,
    MatchLineupRead,
    MatchRead,
    MatchRosterPlayerRead,
    MatchRosterPut,
    MatchRotationRead,
    MatchUpdate,
)
from app.services.match_rotations import ZONE_LABELS_BG
from app.services import match_systems

router = APIRouter(prefix="/api/teams/{team_id}/matches", tags=["Matches"])

COACH_ROLES = (UserRole.coach, UserRole.club_head_coach, UserRole.federation_admin, UserRole.platform_admin)


def _system_value(raw: str | MatchSystem) -> MatchSystem:
    if isinstance(raw, MatchSystem):
        return raw
    for item in MatchSystem:
        if item.value == raw or item.name == raw:
            return item
    raise HTTPException(status_code=422, detail="Невалидна схема на игра")


def _format_value(raw: str | MatchFormat) -> MatchFormat:
    if isinstance(raw, MatchFormat):
        return raw
    for item in MatchFormat:
        if item.value == raw or item.name == raw:
            return item
    raise HTTPException(status_code=422, detail="Невалиден формат (2 от 3 / 3 от 5)")


def _status_value(raw: str | MatchStatus) -> MatchStatus:
    if isinstance(raw, MatchStatus):
        return raw
    try:
        return MatchStatus(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Невалиден статус") from exc


def _position_value(raw: str | MatchPosition) -> MatchPosition:
    if isinstance(raw, MatchPosition):
        return raw
    try:
        return MatchPosition(raw)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Невалидна позиция") from exc


def _get_match(db: Session, team_id: int, match_id: int) -> Match:
    match = db.query(Match).filter(Match.id == match_id, Match.team_id == team_id).first()
    if not match:
        raise HTTPException(status_code=404, detail="Мачът не е намерен")
    return match


def _active_set(db: Session, match_id: int) -> MatchSet | None:
    return (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match_id, MatchSet.status == MatchSetStatus.in_progress)
        .first()
    )


def _can_edit_lineup(db: Session, match: Match) -> bool:
    if match.status == MatchStatus.finished:
        return False
    if match.status == MatchStatus.live and _active_set(db, match.id) is not None:
        return False
    return True


def _roster_count(db: Session, match_id: int) -> int:
    return db.query(MatchRosterPlayer).filter(MatchRosterPlayer.match_id == match_id).count()


def _has_lineup(db: Session, match_id: int) -> bool:
    return db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match_id).count() == 6


def _to_match_read(db: Session, match: Match) -> MatchRead:
    fmt = match.format.value if isinstance(getattr(match, "format", None), MatchFormat) else (
        str(getattr(match, "format", None) or "bo5")
    )
    return MatchRead(
        id=match.id,
        team_id=match.team_id,
        competition_id=getattr(match, "competition_id", None),
        opponent_name=match.opponent_name,
        match_date=match.match_date,
        venue=match.venue,
        system=match.system.value if isinstance(match.system, MatchSystem) else str(match.system),
        format=fmt,  # type: ignore[arg-type]
        status=match.status.value if isinstance(match.status, MatchStatus) else str(match.status),
        notes=match.notes,
        roster_count=_roster_count(db, match.id),
        has_lineup=_has_lineup(db, match.id),
        created_at=match.created_at,
        updated_at=match.updated_at,
    )


def _load_roster(db: Session, match_id: int) -> list[MatchRosterPlayerRead]:
    rows = (
        db.query(MatchRosterPlayer, Athlete)
        .join(Athlete, Athlete.id == MatchRosterPlayer.athlete_id)
        .filter(MatchRosterPlayer.match_id == match_id)
        .order_by(MatchRosterPlayer.sort_order.asc(), MatchRosterPlayer.jersey_number.asc())
        .all()
    )
    out: list[MatchRosterPlayerRead] = []
    for player, athlete in rows:
        out.append(
            MatchRosterPlayerRead(
                id=player.id,
                athlete_id=player.athlete_id,
                athlete_name=athlete.athlete_name or "",
                jersey_number=player.jersey_number,
                position=player.position.value if isinstance(player.position, MatchPosition) else str(player.position),
                sort_order=player.sort_order or 0,
            )
        )
    return out


def _roster_by_athlete(roster: list[MatchRosterPlayerRead]) -> dict[int, MatchRosterPlayerRead]:
    return {int(p.athlete_id): p for p in roster}


def _court_player(
    zone: int,
    athlete_id: int,
    roster_map: dict[int, MatchRosterPlayerRead],
    *,
    role: str | None = None,
) -> MatchCourtPlayerRead:
    info = roster_map.get(int(athlete_id))
    if not info:
        raise HTTPException(status_code=422, detail=f"Състезател {athlete_id} не е в мачовия състав")
    return MatchCourtPlayerRead(
        zone=zone,
        zone_label=ZONE_LABELS_BG.get(zone, str(zone)),
        athlete_id=info.athlete_id,
        athlete_name=info.athlete_name,
        jersey_number=info.jersey_number,
        position=info.position,
        role=role,
    )


def _load_lineup_and_rotations(
    db: Session, match: Match, roster: list[MatchRosterPlayerRead]
) -> tuple[MatchLineupRead, list[MatchRotationRead]]:
    roster_map = _roster_by_athlete(roster)
    slots = (
        db.query(MatchLineupSlot)
        .filter(MatchLineupSlot.match_id == match.id)
        .order_by(MatchLineupSlot.zone.asc())
        .all()
    )
    if len(slots) != 6:
        libero = None
        if match.libero_athlete_id and int(match.libero_athlete_id) in roster_map:
            lib = roster_map[int(match.libero_athlete_id)]
            libero = MatchCourtPlayerRead(
                zone=0,
                zone_label="Либеро",
                athlete_id=lib.athlete_id,
                athlete_name=lib.athlete_name,
                jersey_number=lib.jersey_number,
                position=lib.position,
                role="L",
            )
        return MatchLineupRead(slots=[], libero=libero, complete=False), []

    starting = {int(s.zone): int(s.athlete_id) for s in slots}
    lineup_slots = [_court_player(z, aid, roster_map) for z, aid in sorted(starting.items())]
    libero_read = None
    libero_id = int(match.libero_athlete_id) if match.libero_athlete_id else None
    if libero_id:
        if libero_id not in roster_map:
            raise HTTPException(status_code=422, detail="Либерото не е в мачовия състав")
        lib = roster_map[libero_id]
        libero_read = MatchCourtPlayerRead(
            zone=0,
            zone_label="Либеро",
            athlete_id=lib.athlete_id,
            athlete_name=lib.athlete_name,
            jersey_number=lib.jersey_number,
            position=lib.position,
            role="L",
        )

    lineup = MatchLineupRead(slots=lineup_slots, libero=libero_read, complete=True)

    system = match.system.value if isinstance(match.system, MatchSystem) else str(match.system)
    rotations_out: list[MatchRotationRead] = []
    if match_systems.is_supported(system):
        pos_by_athlete = {int(p.athlete_id): str(p.position) for p in roster}
        roles = match_systems.assign_roles(system, starting, pos_by_athlete)
        roles_ok = match_systems.roles_complete(system, roles)
        try:
            computed = match_systems.build_rotations(system, starting, libero_athlete_id=libero_id)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        for item in computed:
            rot_num = int(item["rotation"])
            if roles_ok:
                display = match_systems.apply_formation_display(
                    system,
                    rotation=rot_num,
                    phase="base",
                    role_to_athlete=roles,
                    libero_athlete_id=libero_id,
                )
                role_map = match_systems.athlete_roles_on_court(
                    system,
                    rotation=rot_num,
                    phase="base",
                    role_to_athlete=roles,
                    libero_athlete_id=libero_id,
                )
                rot_slots = [
                    _court_player(z, aid, roster_map, role=role_map.get(int(aid)))
                    for z, aid in sorted(display.items())
                ]
                on_court = {int(p.athlete_id) for p in rot_slots}
                lib_slot = libero_read if libero_read and libero_id not in on_court else None
            else:
                rot_slots = [_court_player(z, aid, roster_map) for z, aid in sorted(item["zones"].items())]
                lib_slot = libero_read
            rotations_out.append(
                MatchRotationRead(rotation=rot_num, slots=rot_slots, libero=lib_slot)
            )
    return lineup, rotations_out


def _detail(db: Session, match: Match) -> MatchDetailRead:
    roster = _load_roster(db, match.id)
    lineup, rotations = _load_lineup_and_rotations(db, match, roster)
    return MatchDetailRead(
        **_to_match_read(db, match).model_dump(),
        roster=roster,
        lineup=lineup,
        rotations=rotations,
    )


@router.get("", response_model=list[MatchRead])
def list_matches(
    team_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    matches = db.query(Match).filter(Match.team_id == team_id).order_by(Match.id.desc()).all()
    return [_to_match_read(db, m) for m in matches]


@router.post("", response_model=MatchDetailRead)
def create_match(
    team_id: int,
    payload: MatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = Match(
        team_id=team_id,
        created_by_user_id=current_user.id,
        opponent_name=(payload.opponent_name or "").strip() or None,
        match_date=payload.match_date,
        venue=(payload.venue or "").strip() or None,
        system=_system_value(payload.system),
        format=_format_value(payload.format or "bo5"),
        status=MatchStatus.draft,
        notes=(payload.notes or "").strip() or None,
    )
    db.add(match)
    db.commit()
    db.refresh(match)
    return _detail(db, match)


@router.get("/{match_id}", response_model=MatchDetailRead)
def get_match(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    return _detail(db, match)


@router.patch("/{match_id}", response_model=MatchDetailRead)
def update_match(
    team_id: int,
    match_id: int,
    payload: MatchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    data = payload.model_dump(exclude_unset=True)
    if "opponent_name" in data:
        match.opponent_name = (data["opponent_name"] or "").strip() or None
    if "match_date" in data:
        match.match_date = data["match_date"]
    if "venue" in data:
        match.venue = (data["venue"] or "").strip() or None
    if "system" in data and data["system"] is not None:
        match.system = _system_value(data["system"])
    if "format" in data and data["format"] is not None:
        if match.status in (MatchStatus.live, MatchStatus.finished):
            raise HTTPException(status_code=422, detail="Форматът не може да се сменя след старт на мача")
        match.format = _format_value(data["format"])
    if "notes" in data:
        match.notes = (data["notes"] or "").strip() or None
    if "status" in data and data["status"] is not None:
        match.status = _status_value(data["status"])
    db.commit()
    db.refresh(match)
    return _detail(db, match)


@router.put("/{match_id}/roster", response_model=MatchDetailRead)
def put_match_roster(
    team_id: int,
    match_id: int,
    payload: MatchRosterPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)

    if match.status in (MatchStatus.live, MatchStatus.finished):
        raise HTTPException(status_code=422, detail="Съставът не може да се променя при live/приключен мач")

    players = payload.players or []
    if len(players) > MAX_MATCH_ROSTER:
        raise HTTPException(status_code=422, detail=f"Максимум {MAX_MATCH_ROSTER} състезатели")

    athlete_ids = [int(p.athlete_id) for p in players]
    if athlete_ids:
        active_members = (
            db.query(TeamMember.athlete_id)
            .filter(
                TeamMember.team_id == team_id,
                TeamMember.is_active.is_(True),
                TeamMember.athlete_id.in_(athlete_ids),
            )
            .all()
        )
        allowed = {int(row[0]) for row in active_members}
        missing = [aid for aid in athlete_ids if aid not in allowed]
        if missing:
            raise HTTPException(status_code=422, detail="Някои състезатели не са в активния състав на отбора")

    db.query(MatchRosterPlayer).filter(MatchRosterPlayer.match_id == match.id).delete()
    for idx, item in enumerate(players):
        db.add(
            MatchRosterPlayer(
                match_id=match.id,
                athlete_id=int(item.athlete_id),
                jersey_number=int(item.jersey_number),
                position=_position_value(item.position),
                sort_order=int(item.sort_order if item.sort_order is not None else idx),
            )
        )

    # Премахни lineup слотове за състезатели, които вече не са в състава
    keep = set(athlete_ids)
    stale_slots = db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).all()
    for slot in stale_slots:
        if int(slot.athlete_id) not in keep:
            db.delete(slot)
    if match.libero_athlete_id and int(match.libero_athlete_id) not in keep:
        match.libero_athlete_id = None

    if players and match.status == MatchStatus.draft:
        match.status = MatchStatus.ready

    db.commit()
    db.refresh(match)
    return _detail(db, match)


@router.put("/{match_id}/lineup", response_model=MatchDetailRead)
def put_match_lineup(
    team_id: int,
    match_id: int,
    payload: MatchLineupPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)

    if not _can_edit_lineup(db, match):
        raise HTTPException(
            status_code=422,
            detail="Шестицата може да се сменя преди старт и между геймове (не по време на активен гейм)",
        )

    system = match.system.value if isinstance(match.system, MatchSystem) else str(match.system)
    if not match_systems.is_supported(system):
        raise HTTPException(status_code=422, detail=f"Неподдържана схема: {system}")

    roster = _load_roster(db, match.id)
    if len(roster) < 6:
        raise HTTPException(status_code=422, detail="Изберете поне 6 състезатели в състава преди шестицата")
    roster_ids = {int(p.athlete_id) for p in roster}

    slot_ids = [int(s.athlete_id) for s in payload.slots]
    if any(aid not in roster_ids for aid in slot_ids):
        raise HTTPException(status_code=422, detail="Играч от шестицата не е в мачовия състав")

    libero_id = int(payload.libero_athlete_id) if payload.libero_athlete_id else None
    if libero_id is not None:
        if libero_id not in roster_ids:
            raise HTTPException(status_code=422, detail="Либерото не е в мачовия състав")
        if libero_id in slot_ids:
            raise HTTPException(status_code=422, detail="Либерото не може да е в стартовата шестица")

    try:
        match_systems.build_rotations(
            system,
            {int(s.zone): int(s.athlete_id) for s in payload.slots},
            libero_athlete_id=libero_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).delete()
    for item in payload.slots:
        db.add(MatchLineupSlot(match_id=match.id, zone=int(item.zone), athlete_id=int(item.athlete_id)))
    match.libero_athlete_id = libero_id
    if match.status == MatchStatus.draft:
        match.status = MatchStatus.ready

    db.commit()
    db.refresh(match)
    return _detail(db, match)


@router.delete("/{match_id}")
def delete_match(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    """Изтрива мач заедно със сетoве, събития, състав и шестица."""
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    set_ids = [int(s.id) for s in db.query(MatchSet.id).filter(MatchSet.match_id == match.id).all()]
    if set_ids:
        db.query(MatchStatEvent).filter(MatchStatEvent.set_id.in_(set_ids)).delete(synchronize_session=False)
    db.query(MatchStatEvent).filter(MatchStatEvent.match_id == match.id).delete(synchronize_session=False)
    db.query(MatchSet).filter(MatchSet.match_id == match.id).delete(synchronize_session=False)
    db.query(MatchLineupSlot).filter(MatchLineupSlot.match_id == match.id).delete(synchronize_session=False)
    db.query(MatchRosterPlayer).filter(MatchRosterPlayer.match_id == match.id).delete(synchronize_session=False)
    db.delete(match)
    db.commit()
    return {"ok": True}
