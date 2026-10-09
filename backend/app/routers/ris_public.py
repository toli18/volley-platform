"""RIS (BVF competition calendar) proxy + import into club competitions."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.competition_kinds import is_valid_competition_kind
from app.database import get_db
from app.dependencies.roles import require_role
from app.models import BvfCardIndex, Club, ClubCompetitionEvent, Team, User, UserRole
from app.routers.bvf_admin import _club_for_user, _ensure_head_with_club
from app.services.ris_client import (
    RisApiError,
    current_season_year,
    get_championship,
    get_game,
    http_error_from_ris,
    list_age_groups,
    list_championships,
    list_games,
    list_seasons,
    next_game_day,
)
from app.services.ris_import import (
    add_hours,
    competition_kind_from_game,
    hall_location,
    match_number_of,
    opponent_for_club,
    parse_beg_time,
    stream_url_of,
    suggest_card_index_id,
    summarize_game_for_club,
    championship_id_of,
    time_is_placeholder,
)
from app.services.schedule_competitions import can_manage_team

router = APIRouter(prefix="/api/ris", tags=["RIS Calendar"])

_COACH_ROLES = (UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
_HEAD_ROLES = (UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)


def _require_bvf_club(club: Club) -> int:
    cid = int(getattr(club, "bvf_club_id", 0) or 0)
    if cid <= 0:
        raise HTTPException(
            status_code=422,
            detail="Клубът няма връзка със СЕК (bvf_club_id). Свържи клуба в BVF Admin.",
        )
    return cid


def _parse_ymd(value: str, field: str) -> str:
    raw = (value or "").strip()
    try:
        datetime.strptime(raw, "%Y-%m-%d")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"{field} must be YYYY-MM-DD") from exc
    return raw


class RisImportItem(BaseModel):
    ris_game_id: int
    team_id: int
    coach_id: int
    card_index_id: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    notes: Optional[str] = None


class RisImportIn(BaseModel):
    season: Optional[int] = None
    items: list[RisImportItem] = Field(default_factory=list, min_length=1)


@router.get("/status")
def ris_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    club = _club_for_user(db, current_user)
    bvf_club_id = int(getattr(club, "bvf_club_id", 0) or 0) or None
    try:
        seasons = list_seasons()
        year = current_season_year(seasons)
        ok = True
        err = None
    except RisApiError as exc:
        seasons = []
        year = None
        ok = False
        err = exc.message
    return {
        "ok": ok,
        "error": err,
        "bvf_club_id": bvf_club_id,
        "linked": bool(bvf_club_id),
        "season_year": year,
        "seasons": seasons,
    }


@router.get("/seasons")
def ris_seasons(current_user: User = Depends(require_role(*_COACH_ROLES))):
    try:
        return {"data": list_seasons()}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/age-groups")
def ris_age_groups(current_user: User = Depends(require_role(*_COACH_ROLES))):
    try:
        return {"data": list_age_groups()}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/championships")
def ris_championships(
    season: Optional[int] = Query(default=None),
    age_group: Optional[int] = Query(default=None, alias="ageGroup"),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    try:
        year = int(season) if season else current_season_year()
        return {"data": list_championships(year, age_group=age_group)}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/championships/{championship_id}")
def ris_championship_detail(
    championship_id: int,
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    try:
        return {"data": get_championship(championship_id)}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/games/{game_id}")
def ris_game_detail(
    game_id: int,
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    try:
        return {"data": get_game(game_id)}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/next-day")
def ris_next_day(
    season: Optional[int] = Query(default=None),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    try:
        year = int(season) if season else current_season_year()
        return {"data": next_game_day(year)}
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc


@router.get("/club-games")
def ris_club_games(
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
    season: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_COACH_ROLES)),
):
    club = _club_for_user(db, current_user)
    bvf_club_id = _require_bvf_club(club)
    d0 = _parse_ymd(from_date, "from")
    d1 = _parse_ymd(to_date, "to")
    if d1 < d0:
        raise HTTPException(status_code=422, detail="to must be >= from")

    try:
        year = int(season) if season else current_season_year()
        games = list_games(
            year,
            club_id=bvf_club_id,
            date_from=d0,
            date_to=d1,
            page=1,
            page_size=100,
            sort="asc",
        )
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc

    ids = [int(g["id"]) for g in games if isinstance(g, dict) and g.get("id") is not None]
    imported: set[int] = set()
    if ids:
        rows = (
            db.query(ClubCompetitionEvent.ris_game_id)
            .filter(
                ClubCompetitionEvent.club_id == int(club.id),
                ClubCompetitionEvent.ris_game_id.in_(ids),
            )
            .all()
        )
        imported = {int(r[0]) for r in rows if r[0] is not None}

    card_indexes = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.club_id == int(club.id))
        .order_by(BvfCardIndex.year.desc(), BvfCardIndex.age.asc())
        .all()
    )

    out = []
    for g in games:
        if not isinstance(g, dict) or g.get("id") is None:
            continue
        gid = int(g["id"])
        row = summarize_game_for_club(g, bvf_club_id, already_imported=gid in imported)
        row["suggested_card_index_id"] = suggest_card_index_id(card_indexes, g)
        out.append(row)

    return {
        "season_year": year,
        "bvf_club_id": bvf_club_id,
        "from": d0,
        "to": d1,
        "count": len(out),
        "games": out,
    }


@router.post("/import-games")
def ris_import_games(
    payload: RisImportIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*_HEAD_ROLES)),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user)
    bvf_club_id = _require_bvf_club(club)
    club_id = int(club.id)

    try:
        year = int(payload.season) if payload.season else current_season_year()
    except RisApiError as exc:
        raise http_error_from_ris(exc) from exc

    created: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    # Prefetch games once for the date span of requested ids (fetch individually — safer).
    for item in payload.items:
        gid = int(item.ris_game_id)
        existing = (
            db.query(ClubCompetitionEvent)
            .filter(
                ClubCompetitionEvent.club_id == club_id,
                ClubCompetitionEvent.ris_game_id == gid,
            )
            .first()
        )
        if existing:
            skipped.append({"ris_game_id": gid, "competition_id": int(existing.id), "reason": "already_imported"})
            continue

        try:
            game = get_game(gid)
        except RisApiError as exc:
            errors.append({"ris_game_id": gid, "error": exc.message})
            continue
        if not game or game.get("id") is None:
            errors.append({"ris_game_id": gid, "error": "Мачът не е намерен в RIS"})
            continue

        team = db.query(Team).filter(Team.id == int(item.team_id), Team.club_id == club_id).first()
        if not team:
            errors.append({"ris_game_id": gid, "error": "Невалидна тренировъчна група"})
            continue
        if not can_manage_team(db, current_user, club_id, int(team.id), True):
            errors.append({"ris_game_id": gid, "error": "Нямате право за този отбор"})
            continue

        coach = db.query(User).filter(User.id == int(item.coach_id), User.club_id == club_id).first()
        if not coach:
            errors.append({"ris_game_id": gid, "error": "Невалиден треньор"})
            continue

        card_index_id = None
        if item.card_index_id is not None:
            ci = (
                db.query(BvfCardIndex)
                .filter(BvfCardIndex.id == int(item.card_index_id), BvfCardIndex.club_id == club_id)
                .first()
            )
            if not ci:
                errors.append({"ris_game_id": gid, "error": "Невалиден картотечен отбор"})
                continue
            card_index_id = int(ci.id)
        else:
            # Soft suggest
            cis = db.query(BvfCardIndex).filter(BvfCardIndex.club_id == club_id).all()
            card_index_id = suggest_card_index_id(cis, game)

        beg_date = (game.get("begDate") or "").strip()
        if not beg_date:
            errors.append({"ris_game_id": gid, "error": "Мачът няма дата в RIS"})
            continue

        if item.start_time:
            start = parse_beg_time(item.start_time)
        elif time_is_placeholder(game.get("begTime")):
            start = "10:00"
        else:
            start = parse_beg_time(game.get("begTime"))
        end = parse_beg_time(item.end_time) if item.end_time else add_hours(start, 2)

        kind = competition_kind_from_game(game)
        if not is_valid_competition_kind(kind):
            kind = "tournament"

        opponent, _ = opponent_for_club(game, bvf_club_id)
        location = hall_location(game)
        champ_id = championship_id_of(game)
        notes_bits = []
        if item.notes:
            notes_bits.append(item.notes.strip())
        mn = match_number_of(game)
        if mn:
            notes_bits.append(f"БФВ мач №{mn}")
        champ = game.get("championship") if isinstance(game.get("championship"), dict) else {}
        label = (champ.get("label") or champ.get("name") or "").strip()
        if label:
            notes_bits.append(label)
        notes = " · ".join(notes_bits) or None

        event = ClubCompetitionEvent(
            club_id=club_id,
            team_id=int(team.id),
            coach_id=int(coach.id),
            card_index_id=card_index_id,
            date=beg_date,
            start_time=start,
            end_time=end,
            location=location,
            competition_kind=kind,
            opponent_name=opponent,
            notes=notes,
            is_cancelled=False,
            roster_status="pending",
            roster_edit_count=0,
            ris_game_id=gid,
            ris_championship_id=champ_id,
            ris_match_number=mn,
            ris_stream_url=stream_url_of(game),
            ris_synced_at=datetime.utcnow(),
        )
        db.add(event)
        db.flush()
        created.append(
            {
                "ris_game_id": gid,
                "competition_id": int(event.id),
                "date": beg_date,
                "opponent_name": opponent,
                "location": location,
            }
        )

    db.commit()
    return {
        "season_year": year,
        "created_count": len(created),
        "skipped_count": len(skipped),
        "error_count": len(errors),
        "created": created,
        "skipped": skipped,
        "errors": errors,
    }
