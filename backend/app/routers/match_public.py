# backend/app/routers/match_public.py
"""Публичен достъп до live мач по share token (без login) — преглед + въвеждане."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models_matches import (
    Match,
    MatchRosterPlayer,
    MatchSet,
    MatchSetStatus,
    MatchStatAction,
    MatchStatEvent,
    MatchStatus,
)
from app.routers import match_live as live
from app.schemas.matches import (
    MatchLivePositionsIn,
    MatchLiveScoreIn,
    MatchLiveStatIn,
    MatchLiveSubIn,
    MatchPublicLiveRead,
)
from app.services.match_live import action_point_side, apply_point, is_set_won

router = APIRouter(prefix="/api/public/match-live", tags=["Match Public Live"])


def _match_by_token(db: Session, token: str) -> Match:
    raw = (token or "").strip()
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=404, detail="Линкът не е валиден")
    match = db.query(Match).filter(Match.live_share_token == raw).first()
    if not match:
        raise HTTPException(status_code=410, detail="Линкът е изтрит или мачът е приключен")
    if match.status == MatchStatus.finished:
        match.live_share_token = None
        db.commit()
        raise HTTPException(status_code=410, detail="Мачът е приключен — линкът е изтрит")
    return match


def _assert_public_writable(match: Match) -> None:
    if bool(getattr(match, "live_input_locked", 0)):
        raise HTTPException(status_code=423, detail="Въвеждането е заключено от треньора")


def _to_public(full) -> MatchPublicLiveRead:
    return MatchPublicLiveRead(
        opponent_name=full.opponent_name,
        system=full.system,
        format=full.format,
        status=full.status,
        phase=full.phase,
        set=full.set,
        sets=full.sets,
        sets_won_us=full.sets_won_us,
        sets_won_opp=full.sets_won_opp,
        match_won_by=full.match_won_by,
        court=full.court,
        libero=full.libero,
        bench=list(getattr(full, "bench", None) or []),
        off_court=list(getattr(full, "off_court", None) or []),
        court_positions=dict(getattr(full, "court_positions", None) or {}),
        recent_events=full.recent_events[:40],
        expired=False,
        input_locked=bool(getattr(full, "input_locked", False)),
    )


@router.get("/{token}", response_model=MatchPublicLiveRead)
def public_match_live(token: str, phase: str | None = None, db: Session = Depends(get_db)):
    raw = (token or "").strip()
    if not raw or len(raw) < 12:
        raise HTTPException(status_code=404, detail="Линкът не е валиден")

    match = db.query(Match).filter(Match.live_share_token == raw).first()
    if not match or match.status == MatchStatus.finished:
        if match and match.status == MatchStatus.finished and match.live_share_token:
            match.live_share_token = None
            db.commit()
        return MatchPublicLiveRead(
            opponent_name=match.opponent_name if match else None,
            system="5-1",
            format="bo5",
            status="finished",
            expired=True,
        )

    override = phase if phase in ("base", "serve", "receive") else None
    full = live._state(db, match, phase_override=override)
    return _to_public(full)


@router.post("/{token}/score", response_model=MatchPublicLiveRead)
def public_score(token: str, payload: MatchLiveScoreIn, db: Session = Depends(get_db)):
    match = _match_by_token(db, token)
    _assert_public_writable(match)
    mset = live._active_set(db, match.id)
    if not mset:
        raise HTTPException(status_code=422, detail="Няма активен гейм")

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
    live._record_event(db, match=match, mset=mset, action=action, athlete_id=None, scored_for=payload.side)

    fmt = live._match_format(match)
    if is_set_won(mset.our_score, mset.opp_score, mset.set_number, fmt):
        mset.status = MatchSetStatus.finished
        match.status = MatchStatus.live
        db.flush()
        live._maybe_finish_match(db, match)
    else:
        match.status = MatchStatus.live

    db.commit()
    db.refresh(match)
    if not match.live_share_token:
        return MatchPublicLiveRead(
            opponent_name=match.opponent_name,
            system=match.system.value if hasattr(match.system, "value") else str(match.system),
            format="bo5",
            status="finished",
            expired=True,
        )
    return _to_public(live._state(db, match))


@router.post("/{token}/stat", response_model=MatchPublicLiveRead)
def public_stat(token: str, payload: MatchLiveStatIn, db: Session = Depends(get_db)):
    match = _match_by_token(db, token)
    _assert_public_writable(match)
    mset = live._active_set(db, match.id)
    if not mset:
        raise HTTPException(status_code=422, detail="Няма активен гейм")

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

    live._record_event(db, match=match, mset=mset, action=action, athlete_id=athlete_id, scored_for=scored_for)
    fmt = live._match_format(match)
    if is_set_won(mset.our_score, mset.opp_score, mset.set_number, fmt):
        mset.status = MatchSetStatus.finished
        match.status = MatchStatus.live
        db.flush()
        live._maybe_finish_match(db, match)
    else:
        match.status = MatchStatus.live

    db.commit()
    db.refresh(match)
    if not match.live_share_token:
        return MatchPublicLiveRead(
            opponent_name=match.opponent_name,
            system=match.system.value if hasattr(match.system, "value") else str(match.system),
            format="bo5",
            status="finished",
            expired=True,
        )
    return _to_public(live._state(db, match))


@router.post("/{token}/undo", response_model=MatchPublicLiveRead)
def public_undo(token: str, db: Session = Depends(get_db)):
    match = _match_by_token(db, token)
    _assert_public_writable(match)
    mset = live._active_set(db, match.id)
    if not mset:
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
        mset.rotation = live._set_start_rotation(mset)
        mset.we_serve = 1 if live._set_start_we_serve(mset) else 0
    if mset.status == MatchSetStatus.finished:
        mset.status = MatchSetStatus.in_progress
    match.status = MatchStatus.live
    db.commit()
    db.refresh(match)
    return _to_public(live._state(db, match))


@router.put("/{token}/positions", response_model=MatchPublicLiveRead)
def public_positions(token: str, payload: MatchLivePositionsIn, db: Session = Depends(get_db)):
    """Помощникът също може да запазва влачене на корта."""
    match = _match_by_token(db, token)
    _assert_public_writable(match)
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")
    live.apply_court_positions(match, payload)
    db.commit()
    db.refresh(match)
    return _to_public(live._state(db, match))


@router.post("/{token}/sub", response_model=MatchPublicLiveRead)
def public_sub(token: str, payload: MatchLiveSubIn, db: Session = Depends(get_db)):
    match = _match_by_token(db, token)
    _assert_public_writable(match)
    if match.status == MatchStatus.finished:
        raise HTTPException(status_code=422, detail="Мачът е приключен")
    mset = (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match.id, MatchSet.status == MatchSetStatus.in_progress)
        .first()
    )
    if not mset:
        raise HTTPException(status_code=422, detail="Няма активен гейм")
    live.apply_live_substitution(db, match, out_athlete_id=payload.out_athlete_id, in_athlete_id=payload.in_athlete_id)
    db.commit()
    db.refresh(match)
    return _to_public(live._state(db, match))
