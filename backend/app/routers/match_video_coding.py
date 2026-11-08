# backend/app/routers/match_video_coding.py
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, User
from app.models_matches import (
    Match,
    MatchRosterPlayer,
    MatchSet,
    MatchStatAction,
    MatchStatEvent,
    MatchStatus,
    MatchVideoCodingProposal,
)
from app.routers.matches import COACH_ROLES, _get_match, _load_roster
from app.routers.teams import _ensure_team_owner
from app.schemas.matches import (
    MatchVideoCodingProposalCreate,
    MatchVideoCodingProposalRead,
    MatchVideoCodingSetOption,
    MatchVideoCodingStateRead,
    MatchVideoUrlPut,
)

router = APIRouter(prefix="/api/teams/{team_id}/matches", tags=["Match Video Coding"])

VIDEO_CODING_ACTIONS = {
    MatchStatAction.kill,
    MatchStatAction.ace,
    MatchStatAction.serve_in,
    MatchStatAction.block,
    MatchStatAction.attack_error,
    MatchStatAction.attack_zero,
    MatchStatAction.error,
    MatchStatAction.dig,
    MatchStatAction.pass_1,
    MatchStatAction.pass_2,
    MatchStatAction.pass_3,
    MatchStatAction.pass_error,
    MatchStatAction.opp_error,
    MatchStatAction.indiv_error,
}


def _sets_summary(db: Session, match_id: int) -> list[MatchVideoCodingSetOption]:
    rows = (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match_id)
        .order_by(MatchSet.set_number.asc())
        .all()
    )
    return [
        MatchVideoCodingSetOption(
            id=int(s.id),
            set_number=int(s.set_number),
            our_score=int(s.our_score),
            opp_score=int(s.opp_score),
            status=s.status.value if hasattr(s.status, "value") else str(s.status),
        )
        for s in rows
    ]


def _proposal_read(
    db: Session,
    row: MatchVideoCodingProposal,
    *,
    set_number_by_id: dict[int, int] | None = None,
    athlete_by_id: dict[int, tuple[str, int]] | None = None,
) -> MatchVideoCodingProposalRead:
    set_number = None
    if row.set_id:
        if set_number_by_id is not None:
            set_number = set_number_by_id.get(int(row.set_id))
        else:
            mset = db.query(MatchSet).filter(MatchSet.id == row.set_id).first()
            set_number = int(mset.set_number) if mset else None

    athlete_name = None
    jersey_number = None
    if row.athlete_id:
        if athlete_by_id is not None and int(row.athlete_id) in athlete_by_id:
            athlete_name, jersey_number = athlete_by_id[int(row.athlete_id)]
        else:
            info = (
                db.query(Athlete.athlete_name, MatchRosterPlayer.jersey_number)
                .outerjoin(
                    MatchRosterPlayer,
                    (MatchRosterPlayer.athlete_id == Athlete.id)
                    & (MatchRosterPlayer.match_id == row.match_id),
                )
                .filter(Athlete.id == row.athlete_id)
                .first()
            )
            if info:
                athlete_name = info[0] or ""
                jersey_number = int(info[1]) if info[1] is not None else None

    action = row.action.value if isinstance(row.action, MatchStatAction) else str(row.action)
    return MatchVideoCodingProposalRead(
        id=row.id,
        match_id=row.match_id,
        set_id=row.set_id,
        set_number=set_number,
        athlete_id=row.athlete_id,
        athlete_name=athlete_name,
        jersey_number=jersey_number,
        action=action,  # type: ignore[arg-type]
        video_offset_sec=int(row.video_offset_sec or 0),
        status=row.status,  # type: ignore[arg-type]
        source=row.source if row.source in ("manual", "ai") else "manual",  # type: ignore[arg-type]
        note=row.note,
        approved_event_id=row.approved_event_id,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


def _coding_state(db: Session, match: Match) -> MatchVideoCodingStateRead:
    roster = _load_roster(db, match.id)
    athlete_by_id = {
        int(p.athlete_id): (p.athlete_name or "", int(p.jersey_number)) for p in roster
    }
    set_rows = (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match.id)
        .order_by(MatchSet.set_number.asc())
        .all()
    )
    set_number_by_id = {int(s.id): int(s.set_number) for s in set_rows}
    proposals = (
        db.query(MatchVideoCodingProposal)
        .filter(MatchVideoCodingProposal.match_id == match.id)
        .order_by(MatchVideoCodingProposal.created_at.desc(), MatchVideoCodingProposal.id.desc())
        .limit(200)
        .all()
    )
    reads = [
        _proposal_read(db, p, set_number_by_id=set_number_by_id, athlete_by_id=athlete_by_id)
        for p in proposals
    ]
    pending_count = sum(1 for p in reads if p.status == "pending")
    return MatchVideoCodingStateRead(
        match_id=match.id,
        team_id=match.team_id,
        opponent_name=match.opponent_name,
        status=match.status.value if isinstance(match.status, MatchStatus) else str(match.status),
        video_url=getattr(match, "video_url", None),
        roster=roster,
        sets=_sets_summary(db, match.id),
        proposals=reads,
        pending_count=pending_count,
    )


def _pick_set(db: Session, match: Match, set_id: int | None) -> MatchSet:
    if set_id is not None:
        mset = db.query(MatchSet).filter(MatchSet.id == set_id, MatchSet.match_id == match.id).first()
        if not mset:
            raise HTTPException(status_code=422, detail="Геймът не е от този мач")
        return mset
    mset = (
        db.query(MatchSet)
        .filter(MatchSet.match_id == match.id)
        .order_by(MatchSet.set_number.desc())
        .first()
    )
    if not mset:
        raise HTTPException(status_code=422, detail="Няма геймове за този мач - стартирайте live първо")
    return mset


@router.get("/{match_id}/video-coding", response_model=MatchVideoCodingStateRead)
def get_video_coding(
    team_id: int,
    match_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    return _coding_state(db, match)


@router.put("/{match_id}/video-coding/url", response_model=MatchVideoCodingStateRead)
def put_video_url(
    team_id: int,
    match_id: int,
    payload: MatchVideoUrlPut,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    raw = (payload.video_url or "").strip()
    match.video_url = raw or None
    db.commit()
    db.refresh(match)
    return _coding_state(db, match)


@router.post("/{match_id}/video-coding/proposals", response_model=MatchVideoCodingProposalRead)
def create_video_coding_proposal(
    team_id: int,
    match_id: int,
    payload: MatchVideoCodingProposalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)

    try:
        action = MatchStatAction(payload.action)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Невалидно действие") from exc
    if action not in VIDEO_CODING_ACTIONS:
        raise HTTPException(status_code=422, detail="Действието не е позволено за видео coding")

    athlete_id = int(payload.athlete_id) if payload.athlete_id else None
    if athlete_id is not None:
        ok = (
            db.query(MatchRosterPlayer)
            .filter(MatchRosterPlayer.match_id == match.id, MatchRosterPlayer.athlete_id == athlete_id)
            .first()
        )
        if not ok:
            raise HTTPException(status_code=422, detail="Състезателят не е в мачовия състав")

    mset = _pick_set(db, match, payload.set_id)
    row = MatchVideoCodingProposal(
        match_id=match.id,
        set_id=mset.id,
        athlete_id=athlete_id,
        action=action,
        video_offset_sec=int(payload.video_offset_sec or 0),
        status="pending",
        source="manual",
        note=(payload.note or "").strip() or None,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _proposal_read(db, row)


@router.post("/{match_id}/video-coding/proposals/{proposal_id}/approve", response_model=MatchVideoCodingProposalRead)
def approve_video_coding_proposal(
    team_id: int,
    match_id: int,
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    row = (
        db.query(MatchVideoCodingProposal)
        .filter(
            MatchVideoCodingProposal.id == proposal_id,
            MatchVideoCodingProposal.match_id == match.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Предложението не е намерено")
    if row.status != "pending":
        raise HTTPException(status_code=422, detail="Предложението вече е прегледано")

    mset = _pick_set(db, match, row.set_id)
    action = row.action if isinstance(row.action, MatchStatAction) else MatchStatAction(str(row.action))
    # Не местяме резултата на приключен/live мач - само статистика в отчета
    ev = MatchStatEvent(
        match_id=match.id,
        set_id=mset.id,
        athlete_id=row.athlete_id,
        action=action,
        rotation=int(mset.rotation or 1),
        our_score=int(mset.our_score or 0),
        opp_score=int(mset.opp_score or 0),
        we_serve=1 if mset.we_serve else 0,
        scored_for=None,
        undone=0,
        video_offset_sec=int(row.video_offset_sec or 0),
    )
    db.add(ev)
    db.flush()
    row.status = "approved"
    row.reviewed_by_user_id = current_user.id
    row.reviewed_at = datetime.utcnow()
    row.approved_event_id = ev.id
    db.commit()
    db.refresh(row)
    return _proposal_read(db, row)


@router.post("/{match_id}/video-coding/proposals/{proposal_id}/reject", response_model=MatchVideoCodingProposalRead)
def reject_video_coding_proposal(
    team_id: int,
    match_id: int,
    proposal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(*COACH_ROLES)),
):
    _ensure_team_owner(db, team_id, current_user)
    match = _get_match(db, team_id, match_id)
    row = (
        db.query(MatchVideoCodingProposal)
        .filter(
            MatchVideoCodingProposal.id == proposal_id,
            MatchVideoCodingProposal.match_id == match.id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Предложението не е намерено")
    if row.status != "pending":
        raise HTTPException(status_code=422, detail="Предложението вече е прегледано")
    row.status = "rejected"
    row.reviewed_by_user_id = current_user.id
    row.reviewed_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return _proposal_read(db, row)
