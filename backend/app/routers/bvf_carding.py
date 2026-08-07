"""BVF photo sync, documents bridge, link-by-EGN, card indexes."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import (
    Athlete,
    AthleteBvfDocument,
    AthletePhysicalMeasurement,
    BvfCardIndex,
    BvfCardIndexMember,
    BvfSeasonApplication,
    Club,
    User,
    UserRole,
)
from app.routers.bvf_admin import (
    BVF_API_BASE,
    BVF_TIMEOUT,
    CoachesListIn,
    _athlete_for_bvf_action,
    _assert_cred_matches_club,
    _bvf_get,
    _bvf_headers,
    _bvf_post_multipart,
    _club_for_user,
    _ensure_head_with_club,
    _normalize_bearer,
)
from app.services.athlete_identity import apply_birth_date_from_egn, compose_athlete_name
from app.services.athlete_photo import has_cached_photo, save_athlete_photo
from app.services.bvf_season_carding import (
    age_group_label,
    athlete_docs_as_dicts,
    athlete_fits_card_index_rules,
    athlete_has_form_03,
    eligible_athlete_payload,
    list_ready_for_head,
    looks_like_form_03,
    map_sek_season_age_group,
    sek_entry_age_group_label,
    serialize_card_index_row,
)

router = APIRouter(prefix="/api/bvf-admin", tags=["BVF Carding"])

DOC_TYPE_LABELS = {
    0: "Договор / документ",
    1: "Медицински",
    2: "Форма 03 / 03-А (картотекиране)",
    3: "Друг",
}


def _club_for_any_coach(db: Session, user: User, club_id: int | None = None) -> Club:
    if user.role == UserRole.coach:
        if not user.club_id:
            raise HTTPException(status_code=422, detail="Няма клуб")
        club = db.query(Club).filter(Club.id == int(user.club_id)).first()
        if not club:
            raise HTTPException(status_code=404, detail="Клубът не е намерен")
        return club
    return _club_for_user(db, user, club_id)


def _token_matches_club(token: str | None, club: Club) -> str:
    from app.services.bvf_auth import resolve_club_bvf_token

    token_n = resolve_club_bvf_token(club, token)
    _assert_cred_matches_club(token_n, club)
    return token_n


def _can_submit_card_index(user: User) -> bool:
    """Само главен треньор / админ изпраща към федерацията. (бъдещ club_admin тук)"""
    return user.role in (
        UserRole.club_head_coach,
        UserRole.platform_admin,
        UserRole.federation_admin,
    )


def _require_submit_role(user: User) -> None:
    if not _can_submit_card_index(user):
        raise HTTPException(
            status_code=403,
            detail="Само главният треньор / администратор на клуба може да изпраща картотечни отбори към БФВ.",
        )


def _coach_assigned_to_card_index(user: User, local: BvfCardIndex) -> bool:
    uid = int(user.id)
    if local.assigned_coach_user_id and int(local.assigned_coach_user_id) == uid:
        return True
    if getattr(local, "second_coach_user_id", None) and int(local.second_coach_user_id) == uid:
        return True
    if local.created_by_user_id and int(local.created_by_user_id) == uid:
        return True
    return False


def _can_edit_card_index(user: User, local: BvfCardIndex) -> bool:
    if local.is_signed or local.status in ("signed", "pending_bvf_sign"):
        return False
    if _can_submit_card_index(user):
        return True
    if user.role == UserRole.coach:
        return _coach_assigned_to_card_index(user, local)
    return False


def _require_card_index_access(db: Session, user: User, local: BvfCardIndex) -> None:
    if _can_submit_card_index(user):
        return
    if user.role == UserRole.coach and _coach_assigned_to_card_index(user, local):
        return
    if user.role == UserRole.coach:
        raise HTTPException(status_code=403, detail="Този картотечен отбор не е назначен на теб.")
    raise HTTPException(status_code=403, detail="Нямаш достъп до картотечния отбор.")


def _coach_card_index_filter(query, user: User):
    """Ограничава query до отбори, назначени на треньора (главен / втори)."""
    from sqlalchemy import or_

    return query.filter(
        or_(
            BvfCardIndex.assigned_coach_user_id == user.id,
            BvfCardIndex.second_coach_user_id == user.id,
        )
    )


def _local_card_index(db: Session, club: Club, local_id: int) -> BvfCardIndex:
    local = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.id == int(local_id), BvfCardIndex.club_id == club.id)
        .first()
    )
    if not local:
        raise HTTPException(status_code=404, detail="Картотечният отбор не е намерен")
    return local


def _club_coaches(db: Session, club: Club) -> list[User]:
    return (
        db.query(User)
        .filter(
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )


def _detail_payload(db: Session, local: BvfCardIndex, current_user: User) -> dict:
    year = local.year or datetime.utcnow().year
    members_out = []
    all_ready = True
    form_ok = True
    for mem in local.members or []:
        athlete = mem.athlete
        if not athlete:
            continue
        docs = athlete_docs_as_dicts(athlete)
        checklist = _doc_checklist(athlete, docs, year, db=db)
        ready = all(c["ok"] for c in checklist if c["key"] in ("photo", "egn", "carding_form"))
        has_form = athlete_has_form_03(athlete, year, db=db)
        if not ready:
            all_ready = False
        if not has_form:
            form_ok = False
        members_out.append(
            {
                "athlete_id": athlete.id,
                "athlete_name": athlete.athlete_name,
                "bvf_player_id": athlete.bvf_player_id,
                "bvf_player_number": athlete.bvf_player_number,
                "synced": bool(mem.synced),
                "ready": ready,
                "has_form_03": has_form,
                "checklist": checklist,
            }
        )

    return {
        **serialize_card_index_row(db, local),
        "members": members_out,
        "members_count": len(members_out),
        "all_ready": all_ready and len(members_out) > 0 and form_ok,
        "can_submit": _can_submit_card_index(current_user),
        "can_edit": _can_edit_card_index(current_user, local),
        "can_request_head": (
            current_user.role == UserRole.coach
            and _can_edit_card_index(current_user, local)
            and local.status not in ("ready_for_head", "signed", "pending_bvf_sign")
            and len(members_out) > 0
            and form_ok
            and all_ready
        ),
    }


def _bvf_get_bytes(path: str, token: str) -> tuple[bytes, str]:
    url = f"{BVF_API_BASE}{path}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT, follow_redirects=True) as client:
            res = client.get(url, headers=_bvf_headers(token, accept="*/*"))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ API недостъпно: {exc}") from exc
    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="БФВ token е невалиден или изтекъл.")
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=(res.text or "")[:300] or f"БФВ грешка {res.status_code}")
    ctype = res.headers.get("content-type") or "application/octet-stream"
    return res.content, ctype


def _bvf_get_soft(path: str, token: str) -> Any | None:
    """GET към БФВ; 403/404 → None (заобикаля забранения search)."""
    url = f"{BVF_API_BASE}{path}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT) as client:
            res = client.get(url, headers=_bvf_headers(token))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ API недостъпно: {exc}") from exc
    if res.status_code in (403, 404):
        return None
    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="БФВ token е невалиден или изтекъл.")
    if res.status_code >= 400:
        detail = (res.text or "").strip()[:300] or f"БФВ грешка {res.status_code}"
        raise HTTPException(status_code=502, detail=detail)
    try:
        return res.json()
    except Exception:
        return None


def _club_players(token: str, bvf_club_id: int) -> list[dict]:
    remote = _bvf_get(f"/api/clubs/{bvf_club_id}/players", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ players не е списък")
    return [row for row in remote if isinstance(row, dict)]


def _player_detail_soft(token: str, player_id: int) -> dict | None:
    remote = _bvf_get_soft(f"/api/players/{int(player_id)}", token)
    return remote if isinstance(remote, dict) else None


def _norm_name(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _find_bvf_player_by_egn(
    token: str,
    club: Club,
    egn_val: str,
    *,
    first_name: str | None = None,
    last_name: str | None = None,
    birth_year: int | None = None,
) -> dict:
    """
    Обхождаме клубния списък — search е забранен от /api/players/search (403).
    Ползваме /clubs/{id}/players и после EGN от детайл GET /api/players/{id}
    (PlayerDetailDto.egn) за да намерим играча по ЕГН.
    """
    roster = _club_players(token, int(club.bvf_club_id))
    if not roster:
        raise HTTPException(
            status_code=404,
            detail="Клубът няма картотекирани в БФВ. Или ЕГН не е намерен в публичните данни в СЕК.",
        )

    for row in roster:
        if str(row.get("egn") or "").strip() == egn_val:
            try:
                pid = int(row["id"])
            except Exception as exc:
                raise HTTPException(status_code=502, detail="Невалиден БФВ player id") from exc
            return _player_detail_soft(token, pid) or row

    fn = _norm_name(first_name)
    ln = _norm_name(last_name)

    def score(row: dict) -> int:
        s = 0
        if ln and _norm_name(row.get("lastName")) == ln:
            s += 3
        if fn and _norm_name(row.get("firstName")) == fn:
            s += 2
        try:
            by = int(row.get("birthYear")) if row.get("birthYear") is not None else None
        except Exception:
            by = None
        if birth_year and by and by == int(birth_year):
            s += 2
        return s

    ordered = sorted(roster, key=score, reverse=True)
    prioritized = [r for r in ordered if score(r) > 0] + [r for r in ordered if score(r) == 0]

    checked = 0
    for row in prioritized:
        try:
            pid = int(row.get("id"))
        except Exception:
            continue
        detail = _player_detail_soft(token, pid)
        checked += 1
        if detail and str(detail.get("egn") or "").strip() == egn_val:
            return detail
        if checked >= 120:
            break

    raise HTTPException(
        status_code=404,
        detail="Няма състезател с това ЕГН в клуба на БФВ. Или ЕГН не е намерен в публичните данни в СЕК.",
    )


class TokenAthleteIn(BaseModel):
    bvf_token: Optional[str] = None
    athlete_id: int
    club_id: Optional[int] = None


class LinkByEgnIn(BaseModel):
    bvf_token: Optional[str] = None
    athlete_id: int
    egn: Optional[str] = None
    club_id: Optional[int] = None


class CardIndexCreateIn(BaseModel):
    bvf_token: Optional[str] = None
    year: int
    age: int
    sex: int = 0
    senior_coach_id: Optional[int] = None
    coach_id: Optional[int] = None
    club_id: Optional[int] = None


class CardIndexAddPlayersIn(BaseModel):
    bvf_token: Optional[str] = None
    athlete_ids: list[int] = Field(default_factory=list)
    club_id: Optional[int] = None


@router.post("/players/sync-photo")
def sync_athlete_photo(
    payload: TokenAthleteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _require_submit_role(current_user)
    athlete = _athlete_for_bvf_action(db, current_user, payload.athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Състезателят няма БФВ id")
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    remote = _bvf_get(f"/api/players/{athlete.bvf_player_id}", token)
    if not isinstance(remote, dict):
        raise HTTPException(status_code=502, detail="Невалиден БФВ player")
    photo_id = str(remote.get("photoId") or "").strip() or None
    if not photo_id:
        raise HTTPException(status_code=404, detail="Няма снимка в БФВ")
    from app.services.athlete_photo import fetch_bvf_photo_bytes_detailed, save_athlete_photo

    content, reason = fetch_bvf_photo_bytes_detailed(token, photo_id)
    if not content:
        raise HTTPException(status_code=502, detail=reason or "Неуспешно зареждане на снимката от БФВ")
    save_athlete_photo(athlete.id, content)
    athlete.bvf_photo_id = photo_id
    athlete.bvf_synced_at = datetime.utcnow()
    db.commit()
    return {"athlete_id": athlete.id, "bvf_photo_id": photo_id, "has_photo": True}


@router.post("/players/link-by-egn")
def link_player_by_egn(
    payload: LinkByEgnIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _require_submit_role(current_user)
    athlete = _athlete_for_bvf_action(db, current_user, payload.athlete_id)
    if athlete.bvf_player_id:
        raise HTTPException(status_code=409, detail="Вече е свързан с БФВ")
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    egn_val = (payload.egn or athlete.egn or "").strip()
    if len(egn_val) != 10:
        raise HTTPException(status_code=422, detail="ЕГН е задължително (10 цифри)")

    birth_year = None
    if athlete.birth_year:
        try:
            birth_year = int(athlete.birth_year)
        except Exception:
            birth_year = None
    if birth_year is None and athlete.birth_date:
        birth_year = athlete.birth_date.year

    match = _find_bvf_player_by_egn(
        token,
        club,
        egn_val,
        first_name=athlete.first_name,
        last_name=athlete.last_name,
        birth_year=birth_year,
    )

    pid = int(match["id"])
    other = db.query(Athlete).filter(Athlete.bvf_player_id == pid, Athlete.id != athlete.id).first()
    if other:
        raise HTTPException(status_code=409, detail=f"БФВ id {pid} вече е свързан с друг състезател")

    first_n = str(match.get("firstName") or "").strip() or athlete.first_name
    middle_n = str(match.get("middleName") or "").strip() or athlete.middle_name
    last_n = str(match.get("lastName") or "").strip() or athlete.last_name
    photo_id = str(match.get("photoId") or "").strip() or None
    number = match.get("number")
    try:
        number_i = int(number) if number is not None else None
    except Exception:
        number_i = None

    athlete.egn = egn_val
    if first_n:
        athlete.first_name = first_n
    if middle_n:
        athlete.middle_name = middle_n
    if last_n:
        athlete.last_name = last_n
    athlete.athlete_name = compose_athlete_name(
        athlete.first_name, athlete.middle_name, athlete.last_name, athlete.athlete_name
    )
    if match.get("nationality"):
        athlete.nationality = str(match.get("nationality")).strip()

    apply_birth_date_from_egn(athlete)

    athlete.bvf_player_id = pid
    athlete.bvf_player_number = number_i
    athlete.bvf_photo_id = photo_id
    athlete.bvf_synced_at = datetime.utcnow()
    from app.services.sek_athlete_readiness import clear_sek_task

    clear_sek_task(athlete)
    db.commit()
    db.refresh(athlete)

    if photo_id:
        try:
            from app.services.athlete_photo import fetch_bvf_photo_bytes, save_athlete_photo

            content = fetch_bvf_photo_bytes(token, photo_id)
            if content:
                save_athlete_photo(athlete.id, content)
        except Exception:
            pass

    return {
        "athlete_id": athlete.id,
        "bvf_player_id": athlete.bvf_player_id,
        "bvf_player_number": athlete.bvf_player_number,
        "bvf_photo_id": athlete.bvf_photo_id,
        "athlete_name": athlete.athlete_name,
        "birth_date": athlete.birth_date.isoformat() if athlete.birth_date else None,
        "birth_year": athlete.birth_year,
        "egn": athlete.egn,
    }


def _upsert_doc_mirrors(db: Session, athlete: Athlete, docs: list) -> list[dict]:
    now = datetime.utcnow()
    seen: set[str] = set()
    out: list[dict] = []
    for raw in docs or []:
        if not isinstance(raw, dict):
            continue
        doc_id = str(raw.get("id") or "").strip()
        if not doc_id:
            continue
        seen.add(doc_id)
        start_dt = end_dt = None
        try:
            if raw.get("startDate"):
                start_dt = datetime.fromisoformat(str(raw.get("startDate")).replace("Z", "+00:00"))
        except Exception:
            start_dt = None
        try:
            if raw.get("endDate"):
                end_dt = datetime.fromisoformat(str(raw.get("endDate")).replace("Z", "+00:00"))
        except Exception:
            end_dt = None
        season_year = start_dt.year if start_dt else (end_dt.year if end_dt else None)
        row = (
            db.query(AthleteBvfDocument)
            .filter(AthleteBvfDocument.athlete_id == athlete.id, AthleteBvfDocument.bvf_document_id == doc_id)
            .first()
        )
        if not row:
            row = AthleteBvfDocument(athlete_id=athlete.id, bvf_document_id=doc_id)
            db.add(row)
        row.bvf_file_id = str(raw.get("fileId") or "").strip() or None
        try:
            row.doc_type = int(raw.get("type")) if raw.get("type") is not None else None
        except Exception:
            row.doc_type = None
        row.description = str(raw.get("description") or "").strip() or None
        row.start_date = start_dt
        row.end_date = end_dt
        row.season_year = season_year
        row.synced_at = now
        out.append(
            {
                "bvf_document_id": doc_id,
                "bvf_file_id": row.bvf_file_id,
                "doc_type": row.doc_type,
                "type_label": DOC_TYPE_LABELS.get(row.doc_type if row.doc_type is not None else -1, "Документ"),
                "description": row.description,
                "start_date": start_dt.isoformat() if start_dt else None,
                "end_date": end_dt.isoformat() if end_dt else None,
                "season_year": season_year,
            }
        )
    existing = db.query(AthleteBvfDocument).filter(AthleteBvfDocument.athlete_id == athlete.id).all()
    for row in existing:
        # Не трий локални документи (local-...) при sync от БФВ
        if str(row.bvf_document_id or "").startswith("local-"):
            continue
        if row.bvf_document_id not in seen:
            db.delete(row)
    db.commit()
    return out


def _doc_checklist(
    athlete: Athlete, docs: list[dict], season_year: int, db: Session | None = None
) -> list[dict]:
    has_photo = has_cached_photo(athlete.id) or bool(athlete.bvf_photo_id)
    season_docs = [
        d
        for d in docs
        if d.get("season_year") == season_year or str(season_year) in (d.get("description") or "")
    ]
    has_form_docs = any(
        looks_like_form_03(d.get("doc_type"), d.get("description")) for d in (season_docs or docs)
    )
    has_form = (
        athlete_has_form_03(athlete, int(season_year), db=db) if db is not None else has_form_docs
    )
    return [
        {"key": "photo", "label": "Снимка", "ok": has_photo},
        {"key": "egn", "label": "ЕГН", "ok": bool((athlete.egn or "").strip())},
        {"key": "carding_form", "label": f"Форма 03 / 03-А ({season_year})", "ok": has_form},
        {"key": "any_doc", "label": "Има поне документ в СЕК", "ok": len(docs) > 0},
    ]


@router.post("/players/documents/sync")
def sync_player_documents(
    payload: TokenAthleteIn,
    season_year: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _require_submit_role(current_user)
    athlete = _athlete_for_bvf_action(db, current_user, payload.athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Липсва играч / връзка с БФВ")
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    remote = _bvf_get(f"/api/players/{athlete.bvf_player_id}/documents", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ documents не е списък")
    docs = _upsert_doc_mirrors(db, athlete, remote)
    year = season_year or datetime.utcnow().year
    return {
        "athlete_id": athlete.id,
        "documents": docs,
        "checklist": _doc_checklist(athlete, docs, year),
        "season_year": year,
        "type_labels": DOC_TYPE_LABELS,
    }


@router.post("/players/documents/upload")
async def upload_player_document(
    athlete_id: int = Form(...),
    doc_type: int = Form(2),
    description: str = Form(""),
    bvf_token: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _require_submit_role(current_user)
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Липсва връзка / играч в БФВ")
    club = _club_for_any_coach(db, current_user, None)
    token = _token_matches_club(bvf_token, club)
    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Празен файл")
    data = {
        "Type": str(int(doc_type)),
        "Description": (description or "").strip() or DOC_TYPE_LABELS.get(int(doc_type), "Документ"),
    }
    if start_date:
        data["StartDate"] = start_date
    if end_date:
        data["EndDate"] = end_date
    files = {"files": (file.filename or "doc.pdf", content, file.content_type or "application/octet-stream")}
    _bvf_post_multipart(f"/api/players/{athlete.bvf_player_id}/documents", token, data, files)
    remote = _bvf_get(f"/api/players/{athlete.bvf_player_id}/documents", token)
    docs = _upsert_doc_mirrors(db, athlete, remote if isinstance(remote, list) else [])
    year = datetime.utcnow().year
    return {"ok": True, "documents": docs, "checklist": _doc_checklist(athlete, docs, year), "season_year": year}


@router.post("/card-indexes/fetch")
def fetch_card_indexes(
    payload: CoachesListIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    remote = _bvf_get(f"/api/clubs/{club.bvf_club_id}/card-indexes", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ card-indexes не е списък")
    items = []
    for row in remote:
        if not isinstance(row, dict):
            continue
        try:
            cid = int(row.get("id"))
        except Exception:
            continue
        year = int(row.get("year") or 0)
        age = int(row.get("age") or 0)
        sex = int(row.get("sex") or 0)
        local = db.query(BvfCardIndex).filter(BvfCardIndex.bvf_card_index_id == cid).first()
        if not local:
            local = BvfCardIndex(club_id=club.id, bvf_card_index_id=cid, year=year, age=age, sex=sex)
            db.add(local)
        local.year = year
        local.age = age
        local.sex = sex
        local.age_group = str(row.get("ageGroup") or "").strip() or None
        local.is_signed = bool(row.get("isSigned")) if row.get("isSigned") is not None else None
        if local.is_signed:
            local.status = "signed"
        elif local.status not in ("pending_bvf_sign", "ready"):
            local.status = "synced"
        items.append(
            {
                "bvf_card_index_id": cid,
                "year": year,
                "age": age,
                "age_group": local.age_group,
                "sex": sex,
                "is_signed": local.is_signed,
                "status": local.status,
            }
        )
    db.commit()
    for it in items:
        loc = db.query(BvfCardIndex).filter(BvfCardIndex.bvf_card_index_id == it["bvf_card_index_id"]).first()
        it["id"] = loc.id if loc else None
        it["members_count"] = len(loc.members) if loc and loc.members else 0
    items.sort(key=lambda x: (-(x["year"] or 0), x.get("age_group") or ""))
    return {
        "items": items,
        "bvf_club_id": club.bvf_club_id,
        "can_submit": _can_submit_card_index(current_user),
    }


@router.post("/card-indexes/create")
def create_card_index(
    payload: CardIndexCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Създава локален картотечен отбор (огледало в БФВ). Попълването е отделна стъпка."""
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    data = {
        "ClubId": str(int(club.bvf_club_id)),
        "Year": str(int(payload.year)),
        "Age": str(int(payload.age)),
        "Sex": str(int(payload.sex)),
    }
    if payload.senior_coach_id:
        data["SeniorCoachId"] = str(int(payload.senior_coach_id))
    if payload.coach_id:
        data["CoachId"] = str(int(payload.coach_id))
    remote = _bvf_post_multipart("/api/card-indexes", token, data, files={})
    if not isinstance(remote, dict) or not remote.get("id"):
        raise HTTPException(status_code=502, detail="БФВ не върна card index")
    cid = int(remote["id"])
    local = BvfCardIndex(
        club_id=club.id,
        bvf_card_index_id=cid,
        year=int(payload.year),
        age=int(payload.age),
        sex=int(payload.sex),
        age_group=str(remote.get("ageGroup") or "").strip() or None,
        is_signed=bool(remote.get("isSigned")) if remote.get("isSigned") is not None else False,
        senior_coach_bvf_id=payload.senior_coach_id,
        status="synced",
        created_by_user_id=current_user.id,
    )
    db.add(local)
    db.commit()
    db.refresh(local)
    return {
        "id": local.id,
        "bvf_card_index_id": local.bvf_card_index_id,
        "year": local.year,
        "age": local.age,
        "age_group": local.age_group,
        "sex": local.sex,
        "status": local.status,
        "created_by_user_id": local.created_by_user_id,
        "can_submit": _can_submit_card_index(current_user),
    }


@router.post("/card-indexes/{bvf_card_index_id}/add-players")
def add_players_to_card_index(
    bvf_card_index_id: int,
    payload: CardIndexAddPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    local = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.bvf_card_index_id == int(bvf_card_index_id), BvfCardIndex.club_id == club.id)
        .first()
    )
    if local and (local.is_signed or local.status == "signed"):
        raise HTTPException(status_code=409, detail="Картотечният отбор е подписан и не може да се променя съставът")
    if local:
        _require_card_index_access(db, current_user, local)
    season_year = (local.year if local else None) or datetime.utcnow().year
    added = 0
    errors: list[str] = []
    for aid in payload.athlete_ids or []:
        athlete = _athlete_for_bvf_action(db, current_user, int(aid))
        if not athlete.bvf_player_id:
            errors.append(f"#{aid} няма БФВ id")
            continue
        if not athlete_has_form_03(athlete, int(season_year), db=db):
            errors.append(f"{athlete.athlete_name}: липсва Форма 03 / 03-А за {season_year}")
            continue
        url = f"{BVF_API_BASE}/api/card-indexes/{int(bvf_card_index_id)}/players"
        ok = False
        try:
            with httpx.Client(timeout=BVF_TIMEOUT) as client:
                res = client.post(
                    url,
                    headers={**_bvf_headers(token), "Content-Type": "application/json"},
                    json={"playerId": int(athlete.bvf_player_id)},
                )
            if res.status_code < 400:
                ok = True
            else:
                # form fallback
                res2 = client.post(
                    url,
                    headers=_bvf_headers(token),
                    data={"playerId": str(int(athlete.bvf_player_id))},
                )
                if res2.status_code < 400:
                    ok = True
                else:
                    errors.append(f"#{aid}: {(res2.text or res.text or '')[:120]}")
        except Exception as ex:
            errors.append(f"#{aid}: {ex}")
            continue
        if not ok:
            continue
        if local:
            mem = (
                db.query(BvfCardIndexMember)
                .filter(BvfCardIndexMember.card_index_id == local.id, BvfCardIndexMember.athlete_id == athlete.id)
                .first()
            )
            if not mem:
                mem = BvfCardIndexMember(card_index_id=local.id, athlete_id=athlete.id)
                db.add(mem)
            mem.bvf_player_id = athlete.bvf_player_id
            mem.synced = True
            if local.status in ("draft", "synced"):
                local.status = "building"
        added += 1
    db.commit()
    return {"added": added, "errors": errors, "bvf_card_index_id": bvf_card_index_id}


class SignCardIndexIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


@router.get("/card-indexes/eligible-athletes")
def list_eligible_card_index_athletes(
    club_id: int | None = None,
    season_year: int | None = None,
    require_form_03: bool = True,
    local_id: int | None = None,
    age: int | None = None,
    sex: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Клубни състезатели със СЕК връзка; за картотека — с форма 03 + пол/възраст на отбора."""
    club = _club_for_any_coach(db, current_user, club_id)
    year = int(season_year or datetime.utcnow().year)
    filter_age = age
    filter_sex = sex
    # Треньорът вижда допустими само в контекста на назначен отбор.
    if local_id is None and current_user.role == UserRole.coach and not _can_submit_card_index(current_user):
        raise HTTPException(
            status_code=422,
            detail="Избери картотечен отбор (local_id), за да видиш допустимите състезатели.",
        )
    if local_id is not None:
        local = _local_card_index(db, club, int(local_id))
        _require_card_index_access(db, current_user, local)
        year = int(local.year or year)
        filter_age = int(local.age)
        filter_sex = int(local.sex)

    q = db.query(Athlete).filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None), Athlete.is_active.is_(True))
    rows = q.order_by(Athlete.athlete_name.asc()).all()
    athletes = [eligible_athlete_payload(a, year, db=db) for a in rows]
    roster = [a for a in athletes if a["eligible_for_roster"]] if require_form_03 else athletes

    if filter_age is not None and filter_sex is not None:
        by_id = {a.id: a for a in rows}
        filtered = []
        for row in roster:
            ath = by_id.get(row["id"])
            if not ath:
                continue
            ok, _reason = athlete_fits_card_index_rules(
                ath, season_year=year, age=int(filter_age), sex=int(filter_sex)
            )
            if ok:
                filtered.append(row)
        roster = filtered

    return {
        "athletes": roster,
        "all_linked": athletes,
        "season_year": year,
        "require_form_03": require_form_03,
        "filter_age": filter_age,
        "filter_sex": filter_sex,
        "can_submit": _can_submit_card_index(current_user),
    }


@router.get("/card-indexes/{bvf_card_index_id}")
def get_card_index_detail(
    bvf_card_index_id: int,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, club_id)
    local = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.bvf_card_index_id == int(bvf_card_index_id), BvfCardIndex.club_id == club.id)
        .first()
    )
    if not local:
        raise HTTPException(status_code=404, detail="Картотечният отбор не е намерен локално и няма огледало от БФВ")
    _require_card_index_access(db, current_user, local)
    return _detail_payload(db, local, current_user)


@router.post("/card-indexes/{bvf_card_index_id}/submit")
def submit_card_index_to_federation(
    bvf_card_index_id: int,
    payload: SignCardIndexIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """
    Изпращане към БФВ (sign). Само главен треньор / админ.
    Проверява готовността на състава; при липса права остава pending.
    """
    _require_submit_role(current_user)
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    local = (
        db.query(BvfCardIndex)
        .filter(BvfCardIndex.bvf_card_index_id == int(bvf_card_index_id), BvfCardIndex.club_id == club.id)
        .first()
    )
    if not local:
        raise HTTPException(status_code=404, detail="Картотечният отбор не е намерен")
    if local.is_signed or local.status == "signed":
        raise HTTPException(status_code=409, detail="Вече е подписан / изпратен към БФВ")

    members = local.members or []
    if not members:
        raise HTTPException(status_code=422, detail="Няма състезатели в картотечния отбор")

    year = local.year or datetime.utcnow().year
    not_ready = []
    for mem in members:
        athlete = mem.athlete
        if not athlete:
            continue
        docs = [
            {"doc_type": d.doc_type, "description": d.description, "season_year": d.season_year}
            for d in (athlete.bvf_documents or [])
        ]
        checklist = _doc_checklist(athlete, docs, year)
        if not all(c["ok"] for c in checklist):
            missing = [c["label"] for c in checklist if not c["ok"]]
            not_ready.append(f"{athlete.athlete_name}: {', '.join(missing)}")
    if not_ready:
        raise HTTPException(
            status_code=422,
            detail="Не са готови състезатели: " + "; ".join(not_ready[:5]),
        )

    url = f"{BVF_API_BASE}/api/card-indexes/{int(bvf_card_index_id)}/sign"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT, follow_redirects=True) as client:
            res = client.put(url, headers=_bvf_headers(token))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ sign недостъпно: {exc}") from exc

    if res.status_code == 403:
        local.status = "pending_bvf_sign"
        local.signed_by_user_id = current_user.id
        local.signed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(
            status_code=403,
            detail=(
                "Недостатъчни права: няма право да подпише в БФВ API (трябва Administrator / API write). "
                "Съставът е запазен локално; статус към БФВ е pending_bvf_sign."
            ),
        )
    if res.status_code == 400:
        raise HTTPException(status_code=409, detail=(res.text or "Подписването беше отказано от БФВ")[:300])
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=(res.text or "")[:300] or f"БФВ sign грешка {res.status_code}")

    local.is_signed = True
    local.status = "signed"
    local.signed_by_user_id = current_user.id
    local.signed_at = datetime.utcnow()
    db.commit()
    return {
        "ok": True,
        "bvf_card_index_id": local.bvf_card_index_id,
        "status": local.status,
        "is_signed": True,
        "signed_at": local.signed_at.isoformat() if local.signed_at else None,
    }


# ---------------------------------------------------------------------------
# Физически показатели към БФВ /players/{id}/developments
# ---------------------------------------------------------------------------


class PhysicalCreateIn(BaseModel):
    athlete_id: int | None = None
    measured_at: Optional[str] = None
    position: Optional[int] = None
    height_cm: Optional[int] = None
    weight_kg: Optional[int] = None
    full_extent_cm: Optional[int] = None
    attack_cm: Optional[int] = None
    block_cm: Optional[int] = None
    notes: Optional[str] = None
    club_id: Optional[int] = None


class PhysicalSendIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


def _parse_measured_at(raw: Optional[str]) -> datetime:
    if not raw or not str(raw).strip():
        return datetime.utcnow()
    s = str(raw).strip()
    try:
        if len(s) == 10:
            return datetime.strptime(s, "%Y-%m-%d")
        return datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Невалидна дата на измерване") from exc


def _serialize_physical(row: AthletePhysicalMeasurement) -> dict:
    return {
        "id": row.id,
        "athlete_id": row.athlete_id,
        "measured_at": row.measured_at.isoformat() if row.measured_at else None,
        "position": row.position,
        "height_cm": row.height_cm,
        "weight_kg": row.weight_kg,
        "full_extent_cm": row.full_extent_cm,
        "attack_cm": row.attack_cm,
        "block_cm": row.block_cm,
        "notes": row.notes,
        "bvf_development_id": row.bvf_development_id,
        "bvf_synced_at": row.bvf_synced_at.isoformat() if row.bvf_synced_at else None,
        "synced": bool(row.bvf_development_id),
    }


def _push_physical_row_to_bvf(row: AthletePhysicalMeasurement, athlete: Athlete, token: str) -> AthletePhysicalMeasurement:
    """Локални редове към БФВ като developments + локален sync."""
    data = {"Date": row.measured_at.strftime("%Y-%m-%dT%H:%M:%S")}
    if row.position is not None:
        data["Position"] = str(int(row.position))
    if row.height_cm is not None:
        data["Height"] = str(int(row.height_cm))
    if row.weight_kg is not None:
        data["Weight"] = str(int(row.weight_kg))
    if row.full_extent_cm is not None:
        data["FullExtent"] = str(int(row.full_extent_cm))
    if row.attack_cm is not None:
        data["Attack"] = str(int(row.attack_cm))
    if row.block_cm is not None:
        data["Block"] = str(int(row.block_cm))

    remote = _bvf_post_multipart(f"/api/players/{int(athlete.bvf_player_id)}/developments", token, data, files={})
    if isinstance(remote, dict) and remote.get("id") is not None:
        try:
            row.bvf_development_id = int(remote.get("id"))
        except Exception:
            row.bvf_development_id = None
    else:
        remote_list = _bvf_get(f"/api/players/{int(athlete.bvf_player_id)}/developments", token)
        if isinstance(remote_list, list) and remote_list:
            last = remote_list[-1] if isinstance(remote_list[-1], dict) else None
            if last and last.get("id") is not None:
                try:
                    row.bvf_development_id = int(last["id"])
                except Exception:
                    pass

    row.bvf_synced_at = datetime.utcnow()
    return row


@router.get("/players/{athlete_id}/physical")
def list_physical_measurements(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    rows = (
        db.query(AthletePhysicalMeasurement)
        .filter(AthletePhysicalMeasurement.athlete_id == athlete.id)
        .order_by(AthletePhysicalMeasurement.measured_at.desc())
        .all()
    )
    from app.services.physical_from_tests import latest_bvf_fields_from_tests

    from_tests = latest_bvf_fields_from_tests(db, athlete.id)
    return {
        "athlete_id": athlete.id,
        "bvf_player_id": athlete.bvf_player_id,
        "can_send_to_bvf": bool(athlete.bvf_player_id),
        "from_tests": from_tests,
        "items": [_serialize_physical(r) for r in rows],
    }


@router.get("/players/{athlete_id}/physical/from-tests")
def physical_from_tests_preview(
    athlete_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    from app.services.physical_from_tests import latest_bvf_fields_from_tests

    return latest_bvf_fields_from_tests(db, athlete.id)


@router.post("/players/{athlete_id}/physical")
def create_physical_measurement(
    athlete_id: int,
    payload: PhysicalCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if not any(
        [
            payload.height_cm,
            payload.weight_kg,
            payload.full_extent_cm,
            payload.attack_cm,
            payload.block_cm,
        ]
    ):
        raise HTTPException(status_code=422, detail="Липсва поне едно измерване (височина, тегло, …)")
    row = AthletePhysicalMeasurement(
        athlete_id=athlete.id,
        measured_at=_parse_measured_at(payload.measured_at),
        position=payload.position,
        height_cm=payload.height_cm,
        weight_kg=payload.weight_kg,
        full_extent_cm=payload.full_extent_cm,
        attack_cm=payload.attack_cm,
        block_cm=payload.block_cm,
        notes=(payload.notes or "").strip() or None,
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _serialize_physical(row)


@router.post("/players/{athlete_id}/physical/send-from-tests")
def send_physical_from_tests(
    athlete_id: int,
    payload: PhysicalSendIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Взима измерванията от тестирания и ги праща към БФВ developments."""
    from app.services.physical_from_tests import (
        find_matching_synced,
        latest_bvf_fields_from_tests,
        upsert_pending_from_tests,
    )

    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Липсва връзка на състезателя с БФВ")

    preview = latest_bvf_fields_from_tests(db, athlete.id)
    if not preview["has_data"]:
        raise HTTPException(status_code=422, detail="Няма подходящи тестове за измерване (височина/тегло/…)")

    matched = find_matching_synced(db, athlete.id, preview["fields"])
    if matched is not None:
        return {
            **_serialize_physical(matched),
            "already_synced": True,
            "from_tests": preview,
        }

    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)

    row = upsert_pending_from_tests(db, athlete.id, user_id=current_user.id)
    if row is None:
        raise HTTPException(status_code=422, detail="Няма подходящи тестове за измерване")

    _push_physical_row_to_bvf(row, athlete, token)
    db.commit()
    db.refresh(row)
    return {
        **_serialize_physical(row),
        "already_synced": False,
        "from_tests": preview,
    }


@router.post("/players/physical/{measurement_id}/send-bvf")
def send_physical_to_bvf(
    measurement_id: int,
    payload: PhysicalSendIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    row = db.query(AthletePhysicalMeasurement).filter(AthletePhysicalMeasurement.id == int(measurement_id)).first()
    if not row:
        raise HTTPException(status_code=404, detail="Измерването не е намерено")
    athlete = _athlete_for_bvf_action(db, current_user, row.athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Липсва връзка на състезателя с БФВ")
    if row.bvf_development_id:
        return {**_serialize_physical(row), "already_synced": True}

    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    _push_physical_row_to_bvf(row, athlete, token)
    db.commit()
    db.refresh(row)
    return {**_serialize_physical(row), "already_synced": False}


@router.post("/players/{athlete_id}/physical/fetch-bvf")
def fetch_physical_from_bvf(
    athlete_id: int,
    payload: PhysicalSendIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Липсва връзка на състезателя с БФВ")
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    remote = _bvf_get(f"/api/players/{int(athlete.bvf_player_id)}/developments", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ developments не е списък")

    imported = 0
    for raw in remote:
        if not isinstance(raw, dict):
            continue
        try:
            did = int(raw.get("id"))
        except Exception:
            continue
        existing = (
            db.query(AthletePhysicalMeasurement)
            .filter(AthletePhysicalMeasurement.bvf_development_id == did)
            .first()
        )
        if existing:
            continue
        measured = _parse_measured_at(str(raw.get("date") or "")) if raw.get("date") else datetime.utcnow()
        try:
            position = int(raw["position"]) if raw.get("position") is not None else None
        except Exception:
            position = None
        def _i(key_a, key_b=None):
            val = raw.get(key_a) if key_b is None else raw.get(key_a, raw.get(key_b))
            try:
                return int(val) if val is not None else None
            except Exception:
                return None

        row = AthletePhysicalMeasurement(
            athlete_id=athlete.id,
            measured_at=measured,
            position=position,
            height_cm=_i("height"),
            weight_kg=_i("weight"),
            full_extent_cm=_i("fullExtent"),
            attack_cm=_i("attack"),
            block_cm=_i("block"),
            bvf_development_id=did,
            bvf_synced_at=datetime.utcnow(),
            created_by_user_id=current_user.id,
        )
        db.add(row)
        imported += 1
    db.commit()
    rows = (
        db.query(AthletePhysicalMeasurement)
        .filter(AthletePhysicalMeasurement.athlete_id == athlete.id)
        .order_by(AthletePhysicalMeasurement.measured_at.desc())
        .all()
    )
    return {"imported": imported, "items": [_serialize_physical(r) for r in rows], "remote_count": len(remote)}


# ---------------------------------------------------------------------------
# Сезонна заявка + локални картотеки (без write token към БФВ)
# ---------------------------------------------------------------------------


class SeasonApplicationUpsertIn(BaseModel):
    year: int
    note: Optional[str] = None
    club_id: Optional[int] = None


class SeasonApplicationCloseIn(BaseModel):
    year: int
    club_id: Optional[int] = None
    note: Optional[str] = None


class SeasonImportFromSekIn(BaseModel):
    year: Optional[int] = None
    club_id: Optional[int] = None
    bvf_token: Optional[str] = None
    # Форма 03 остава ръчна (Eurotrust) — по подразбиране не отваряме сезона.
    open_if_needed: bool = False


class SeasonAssignCoachIn(BaseModel):
    year: Optional[int] = None
    age: int
    sex: int = 0
    coach_user_id: int
    second_coach_user_id: Optional[int] = None
    doctor_name: Optional[str] = None
    club_id: Optional[int] = None


class LocalAddPlayersIn(BaseModel):
    athlete_ids: list[int] = Field(default_factory=list)
    club_id: Optional[int] = None


class RequestHeadIn(BaseModel):
    note: Optional[str] = None
    club_id: Optional[int] = None


class MarkForm03In(BaseModel):
    athlete_id: int
    season_year: Optional[int] = None
    club_id: Optional[int] = None
    note: Optional[str] = None


@router.post("/players/documents/mark-form-03")
def mark_form_03_local(
    payload: MarkForm03In,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Затваря сезонна заявка и спира да иска се форми."""
    raise HTTPException(
        status_code=410,
        detail=(
            "Сезонната заявка още не може да се активира. "
            "Активирай отделно Форма 03 / 03-А когато е готово с Eurotrust, "
            "или качи PDF към БФВ."
        ),
    )


@router.get("/club-coaches")
def list_club_coaches_for_carding(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, club_id)
    if current_user.role == UserRole.coach and not _can_submit_card_index(current_user):
        return [{"id": current_user.id, "name": current_user.name, "role": "coach"}]
    return [
        {
            "id": c.id,
            "name": c.name,
            "role": c.role.value if hasattr(c.role, "value") else str(c.role),
        }
        for c in _club_coaches(db, club)
    ]


@router.get("/season-applications")
def get_or_list_season_application(
    year: int | None = None,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, club_id)
    y = int(year or datetime.utcnow().year)
    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == y)
        .first()
    )
    indexes_q = db.query(BvfCardIndex).filter(BvfCardIndex.club_id == club.id, BvfCardIndex.year == y)
    if current_user.role == UserRole.coach and not _can_submit_card_index(current_user):
        indexes_q = _coach_card_index_filter(indexes_q, current_user)
    indexes = indexes_q.order_by(BvfCardIndex.age.asc(), BvfCardIndex.sex.asc()).all()
    return {
        "application": None
        if not app
        else {
            "id": app.id,
            "year": app.year,
            "status": app.status,
            "forms_active": bool(getattr(app, "forms_active", False)),
            "note": app.note,
            "created_by_user_id": app.created_by_user_id,
        },
        "year": y,
        "slots": [serialize_card_index_row(db, r) for r in indexes],
        "age_options": [{"age": a, "label": age_group_label(a)} for a in (12, 13, 14, 16, 18, 20, 99)],
        "can_manage": _can_submit_card_index(current_user),
        "ready_for_head": list_ready_for_head(db, club.id) if _can_submit_card_index(current_user) else [],
    }


@router.post("/season-applications")
def upsert_season_application(
    payload: SeasonApplicationUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Отваря сезон за картотекиране (назначение/състав). Не активира Форма 03."""
    club = _club_for_user(db, current_user, payload.club_id)
    y = int(payload.year)
    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == y)
        .first()
    )
    if not app:
        app = BvfSeasonApplication(
            club_id=club.id,
            year=y,
            status="open",
            forms_active=False,
            created_by_user_id=current_user.id,
        )
        db.add(app)
    app.status = "open"
    # Не пипаме forms_active — активира се с отделен бутон.
    if payload.note is not None:
        app.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(app)
    return {
        "id": app.id,
        "year": app.year,
        "status": app.status,
        "note": app.note,
        "forms_active": bool(app.forms_active),
        "message": (
            f"Сезон {app.year} е отворен за картотекиране. "
            + (
                "Форма 03 вече е активна."
                if app.forms_active
                else "Форма 03 още не е активна — ползвай „Активирай Форма 03“."
            )
        ),
    }


@router.post("/season-applications/activate-forms")
def activate_season_forms(
    payload: SeasonApplicationUpsertIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Активира Форма 03/03-А за родителите. Изисква отворен сезон."""
    club = _club_for_user(db, current_user, payload.club_id)
    y = int(payload.year)
    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == y)
        .first()
    )
    if not app or app.status != "open":
        raise HTTPException(
            status_code=409,
            detail="Първо отворете сезона с „Отвори сезон“, после активирайте Форма 03.",
        )
    app.forms_active = True
    if payload.note is not None:
        app.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(app)
    return {
        "id": app.id,
        "year": app.year,
        "status": app.status,
        "note": app.note,
        "forms_active": True,
        "message": f"Форма 03 / 03-А е активна за сезон {app.year} (родители без подпис).",
    }


@router.post("/season-applications/close")
def close_season_application(
    payload: SeasonApplicationCloseIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Затваря сезон — спира картотекиране и Форма 03."""
    club = _club_for_user(db, current_user, payload.club_id)
    y = int(payload.year)
    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == y)
        .first()
    )
    if not app:
        raise HTTPException(status_code=404, detail="Няма сезонна заявка за тази година")
    app.status = "closed"
    app.forms_active = False
    if payload.note is not None:
        app.note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(app)
    return {
        "id": app.id,
        "year": app.year,
        "status": app.status,
        "note": app.note,
        "forms_active": False,
        "message": "Сезонът е затворен. Форма 03 / 03-А вече не се изисква от родителите.",
    }


@router.post("/season-applications/import-from-sek")
def import_season_teams_from_sek(
    payload: SeasonImportFromSekIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Дърпа заявените отбори от СЕК (GET /clubs/{id}/season-applications) → локални картотеки.

    Не назначава треньори автоматично (няма ги в SEK заявката) — главният ги слага след импорта.
    По подразбиране НЕ отваря локалния сезон / Форма 03 (остава ръчно заради Eurotrust).
    """
    club = _club_for_user(db, current_user, payload.club_id)
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Клубът не е свързан със СЕК")
    token = _token_matches_club(payload.bvf_token, club)

    y = int(payload.year or datetime.utcnow().year)
    path = f"/api/clubs/{int(club.bvf_club_id)}/season-applications?season={y}"
    remote = _bvf_get(path, token)
    if not isinstance(remote, dict):
        raise HTTPException(status_code=502, detail="СЕК върна неочакван отговор за сезонната заявка")

    remote_year = int(remote.get("year") or y)
    entries = remote.get("entries") if isinstance(remote.get("entries"), list) else []
    window = remote.get("window") if isinstance(remote.get("window"), dict) else {}

    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == remote_year)
        .first()
    )
    opened_now = False
    if not app:
        app = BvfSeasonApplication(
            club_id=club.id,
            year=remote_year,
            status="open" if payload.open_if_needed else "draft",
            created_by_user_id=current_user.id,
            note="Импорт от СЕК заявка за участие",
        )
        db.add(app)
        db.flush()
        opened_now = payload.open_if_needed
    elif payload.open_if_needed and app.status != "open":
        app.status = "open"
        opened_now = True
    # Без open_if_needed: ако няма app → draft; ако има closed/open — не пипаме статуса.
    created = 0
    updated = 0
    skipped = 0
    unknown = 0
    slots_out: list[dict] = []

    for entry in entries:
        if not isinstance(entry, dict):
            skipped += 1
            continue
        # SeasonApplicationStatus: 0 active, 1 withdrawn
        try:
            status_code = int(entry.get("status") if entry.get("status") is not None else 0)
        except (TypeError, ValueError):
            status_code = 0
        if status_code == 1:
            skipped += 1
            continue

        mapped = map_sek_season_age_group(entry.get("ageGroup"))
        if not mapped:
            unknown += 1
            continue
        age, sex, _base_lbl = mapped
        label = sek_entry_age_group_label(entry.get("ageGroup"), entry.get("league"))

        existing = (
            db.query(BvfCardIndex)
            .filter(
                BvfCardIndex.club_id == club.id,
                BvfCardIndex.year == remote_year,
                BvfCardIndex.age == age,
                BvfCardIndex.sex == sex,
                BvfCardIndex.season_application_id == app.id,
            )
            .first()
        )
        if not existing:
            # Fallback: same year/age/sex without season link (mirror / old drafts)
            existing = (
                db.query(BvfCardIndex)
                .filter(
                    BvfCardIndex.club_id == club.id,
                    BvfCardIndex.year == remote_year,
                    BvfCardIndex.age == age,
                    BvfCardIndex.sex == sex,
                )
                .order_by(BvfCardIndex.id.asc())
                .first()
            )

        if existing:
            if existing.is_signed or existing.status in ("signed", "pending_bvf_sign"):
                skipped += 1
                slots_out.append(serialize_card_index_row(db, existing))
                continue
            existing.season_application_id = app.id
            existing.age_group = label or existing.age_group
            if not existing.status:
                existing.status = "draft"
            updated += 1
            slots_out.append(serialize_card_index_row(db, existing))
        else:
            local = BvfCardIndex(
                club_id=club.id,
                bvf_card_index_id=None,
                year=remote_year,
                age=age,
                sex=sex,
                age_group=label,
                status="draft",
                created_by_user_id=current_user.id,
                season_application_id=app.id,
            )
            db.add(local)
            db.flush()
            created += 1
            slots_out.append(serialize_card_index_row(db, local))

    db.commit()
    slots_out.sort(key=lambda r: (r.get("age") or 0, r.get("sex") or 0))

    return {
        "year": remote_year,
        "season_id": remote.get("seasonId"),
        "window_open": bool(window.get("isOpen")) if window else None,
        "remote_entry_count": len(entries),
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "unknown_age_groups": unknown,
        "opened_local_season": opened_now,
        "application": {
            "id": app.id,
            "year": app.year,
            "status": app.status,
        },
        "slots": slots_out,
        "message": (
            f"Импорт от СЕК: нови {created}, обновени {updated}, пропуснати {skipped}"
            + (f", неизвестни възрасти {unknown}" if unknown else "")
            + (
                ". Локалният сезон е отворен (Форма 03 активна)."
                if opened_now
                else ". Форма 03 не е пипана — отвори сезона ръчно, когато е готово."
            )
        ),
    }


@router.post("/season-applications/assign-coach")
def assign_coach_to_age_slot(
    payload: SeasonAssignCoachIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Назначава треньор(и) и лекар по възраст/пол. Не отваря сезона — само бутонът „Отвори сезон“."""
    club = _club_for_user(db, current_user, payload.club_id)
    year = int(payload.year or datetime.utcnow().year)
    app = (
        db.query(BvfSeasonApplication)
        .filter(BvfSeasonApplication.club_id == club.id, BvfSeasonApplication.year == year)
        .first()
    )
    if not app or app.status != "open":
        raise HTTPException(
            status_code=409,
            detail="Първо отворете сезона с „Отвори сезон“. Назначаването не активира Форма 03.",
        )

    coach = (
        db.query(User)
        .filter(
            User.id == int(payload.coach_user_id),
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not coach:
        raise HTTPException(status_code=404, detail="Треньорът не е от този клуб")

    second_coach = None
    if payload.second_coach_user_id:
        if int(payload.second_coach_user_id) == int(coach.id):
            raise HTTPException(status_code=422, detail="Вторият треньор трябва да е различен от основния")
        second_coach = (
            db.query(User)
            .filter(
                User.id == int(payload.second_coach_user_id),
                User.club_id == club.id,
                User.role.in_([UserRole.coach, UserRole.club_head_coach]),
            )
            .first()
        )
        if not second_coach:
            raise HTTPException(status_code=404, detail="Вторият треньор не е от този клуб")

    doctor_name = (payload.doctor_name or "").strip() or None

    age = int(payload.age)
    sex = int(payload.sex)
    existing = (
        db.query(BvfCardIndex)
        .filter(
            BvfCardIndex.club_id == club.id,
            BvfCardIndex.year == app.year,
            BvfCardIndex.age == age,
            BvfCardIndex.sex == sex,
            BvfCardIndex.season_application_id == app.id,
        )
        .first()
    )
    if existing:
        if existing.is_signed or existing.status in ("signed", "pending_bvf_sign"):
            raise HTTPException(status_code=409, detail="Отборът вече е подписан и не може да се преназначава")
        existing.assigned_coach_user_id = coach.id
        existing.second_coach_user_id = second_coach.id if second_coach else None
        existing.doctor_name = doctor_name
        local = existing
    else:
        local = BvfCardIndex(
            club_id=club.id,
            bvf_card_index_id=None,
            year=app.year,
            age=age,
            sex=sex,
            age_group=age_group_label(age),
            status="draft",
            created_by_user_id=current_user.id,
            assigned_coach_user_id=coach.id,
            second_coach_user_id=second_coach.id if second_coach else None,
            doctor_name=doctor_name,
            season_application_id=app.id,
        )
        db.add(local)
    db.commit()
    db.refresh(local)
    return serialize_card_index_row(db, local)



@router.delete("/card-indexes/local/{local_id}")
def delete_local_card_index(
    local_id: int,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Изтрива локална чернова преди заявка към главния / запис в СЕК."""
    club = _club_for_user(db, current_user, club_id)
    local = _local_card_index(db, club, local_id)
    status = (local.status or "").strip()
    if local.bvf_card_index_id is not None or bool(local.is_signed):
        raise HTTPException(status_code=409, detail="Отборът вече е в СЕК и не може да се изтрие оттук")
    if status not in ("draft", "building"):
        raise HTTPException(
            status_code=409,
            detail="Може да се изтрие само преди заявка към главния треньор (чернова / в изграждане)",
        )
    db.delete(local)
    db.commit()
    return {"ok": True, "deleted_id": int(local_id)}


@router.get("/card-indexes/local")
def list_local_card_indexes(
    year: int | None = None,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, club_id)
    q = db.query(BvfCardIndex).filter(BvfCardIndex.club_id == club.id)
    if year:
        q = q.filter(BvfCardIndex.year == int(year))
    if current_user.role == UserRole.coach and not _can_submit_card_index(current_user):
        q = _coach_card_index_filter(q, current_user)
    rows = q.order_by(BvfCardIndex.year.desc(), BvfCardIndex.age.asc(), BvfCardIndex.sex.asc()).all()
    return {
        "items": [serialize_card_index_row(db, r) for r in rows],
        "can_submit": _can_submit_card_index(current_user),
        "ready_for_head_count": len([r for r in rows if r.status == "ready_for_head"]),
    }


@router.get("/card-indexes/local/{local_id}")
def get_local_card_index_detail(
    local_id: int,
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    club = _club_for_any_coach(db, current_user, club_id)
    local = _local_card_index(db, club, local_id)
    _require_card_index_access(db, current_user, local)
    return _detail_payload(db, local, current_user)


@router.post("/card-indexes/local/{local_id}/add-players")
def add_players_to_local_card_index(
    local_id: int,
    payload: LocalAddPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Добавя допустими играчи. Без БФВ id / несъвместими ги пропуска (грешки без write token)."""
    club = _club_for_any_coach(db, current_user, payload.club_id)
    local = _local_card_index(db, club, local_id)
    _require_card_index_access(db, current_user, local)
    if not _can_edit_card_index(current_user, local):
        raise HTTPException(status_code=409, detail="Съставът е заключен")
    if local.status == "ready_for_head" and not _can_submit_card_index(current_user):
        raise HTTPException(status_code=409, detail="Съставът чака главния треньор и е заключен за промени")

    season_year = local.year or datetime.utcnow().year
    added = 0
    errors: list[str] = []
    for aid in payload.athlete_ids or []:
        athlete = _athlete_for_bvf_action(db, current_user, int(aid))
        if not athlete.bvf_player_id:
            errors.append(f"#{aid} няма БФВ id (не е в СЕК)")
            continue
        if not athlete_has_form_03(athlete, int(season_year), db=db):
            errors.append(f"{athlete.athlete_name}: липсва Форма 03 / 03-А за {season_year}")
            continue
        ok_fit, reason = athlete_fits_card_index_rules(
            athlete,
            season_year=int(season_year),
            age=int(local.age),
            sex=int(local.sex),
        )
        if not ok_fit:
            errors.append(f"{athlete.athlete_name}: {reason or 'не съвпада с отбора'}")
            continue
        mem = (
            db.query(BvfCardIndexMember)
            .filter(BvfCardIndexMember.card_index_id == local.id, BvfCardIndexMember.athlete_id == athlete.id)
            .first()
        )
        if not mem:
            mem = BvfCardIndexMember(card_index_id=local.id, athlete_id=athlete.id)
            db.add(mem)
        mem.bvf_player_id = athlete.bvf_player_id
        mem.synced = False
        added += 1

    if added and local.status in ("draft", "synced"):
        local.status = "building"
    db.commit()
    return {"added": added, "errors": errors, "id": local.id, "status": local.status}


@router.post("/card-indexes/local/{local_id}/request-head")
def request_card_index_to_head(
    local_id: int,
    payload: RequestHeadIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Изпраща заявка към главния за запис на отбора в БФВ."""
    club = _club_for_any_coach(db, current_user, payload.club_id)
    local = _local_card_index(db, club, local_id)
    _require_card_index_access(db, current_user, local)
    if local.is_signed or local.status in ("signed", "pending_bvf_sign"):
        raise HTTPException(status_code=409, detail="Съставът вече е изпратен към БФВ")
    detail = _detail_payload(db, local, current_user)
    if not detail["members_count"]:
        raise HTTPException(status_code=422, detail="Няма състезатели в състава")
    if not detail["all_ready"]:
        raise HTTPException(
            status_code=422,
            detail="Не всички в състава са готови (снимка, ЕГН, Форма 03 / 03-А).",
        )
    local.status = "ready_for_head"
    local.requested_at = datetime.utcnow()
    local.requested_by_user_id = current_user.id
    local.request_note = (payload.note or "").strip() or None
    db.commit()
    db.refresh(local)
    return {
        "ok": True,
        "id": local.id,
        "status": local.status,
        "requested_at": local.requested_at.isoformat() if local.requested_at else None,
        "message": "Заявката е към главния треньор. Записът в БФВ е следваща стъпка.",
    }


@router.post("/card-indexes/local/{local_id}/reopen")
def reopen_card_index_for_coach(
    local_id: int,
    payload: RequestHeadIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Връща отбора обратно на треньора за корекции."""
    club = _club_for_user(db, current_user, payload.club_id)
    local = _local_card_index(db, club, local_id)
    if local.status not in ("ready_for_head", "building"):
        raise HTTPException(status_code=409, detail="Съставът не може да се върне в този статус")
    local.status = "building"
    local.requested_at = None
    local.requested_by_user_id = None
    local.request_note = (payload.note or "").strip() or None
    db.commit()
    return {"ok": True, "id": local.id, "status": local.status}


@router.post("/card-indexes/local/{local_id}/submit")
def submit_local_card_index_to_federation(
    local_id: int,
    payload: SignCardIndexIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """
    Главен треньор записва картотечния отбор в БФВ.
    Без write token: само локално; статусът остава ready_for_head.
    """
    _require_submit_role(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    local = _local_card_index(db, club, local_id)
    detail = _detail_payload(db, local, current_user)
    if not detail["all_ready"]:
        raise HTTPException(status_code=422, detail="Съставът не е готов (Форма 03 / снимка / ЕГН).")

    if local.bvf_card_index_id:
        return submit_card_index_to_federation(local.bvf_card_index_id, payload, db, current_user)

    try:
        token = _token_matches_club(payload.bvf_token, club)
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Съставът е готов при нас, но няма връзка към БФВ / write token. "
                f"Причина: {exc.detail}"
            ),
        ) from exc

    data = {
        "ClubId": str(int(club.bvf_club_id)),
        "Year": str(int(local.year)),
        "Age": str(int(local.age)),
        "Sex": str(int(local.sex)),
    }
    primary = db.query(User).filter(User.id == local.assigned_coach_user_id).first() if local.assigned_coach_user_id else None
    if primary and getattr(primary, "bvf_coach_id", None):
        data["SeniorCoachId"] = str(int(primary.bvf_coach_id))
    second = (
        db.query(User).filter(User.id == local.second_coach_user_id).first()
        if getattr(local, "second_coach_user_id", None)
        else None
    )
    if second and getattr(second, "bvf_coach_id", None):
        data["CoachId"] = str(int(second.bvf_coach_id))
    doctor = (getattr(local, "doctor_name", None) or "").strip()
    if doctor:
        data["DoctorName"] = doctor
    try:
        remote = _bvf_post_multipart("/api/card-indexes", token, data, files={})
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Съставът е запазен локално. Записът в БФВ иска write ApiKey. "
                f"БФВ: {exc.detail}"
            ),
        ) from exc

    if not isinstance(remote, dict) or not remote.get("id"):
        raise HTTPException(
            status_code=503,
            detail="Съставът е готов локално. БФВ не върна card index — провери write token.",
        )

    cid = int(remote["id"])
    local.bvf_card_index_id = cid
    local.age_group = str(remote.get("ageGroup") or "").strip() or local.age_group
    local.status = "synced"
    db.commit()

    for mem in local.members or []:
        if not mem.bvf_player_id:
            continue
        url = f"{BVF_API_BASE}/api/card-indexes/{cid}/players"
        try:
            with httpx.Client(timeout=BVF_TIMEOUT) as client:
                res = client.post(
                    url,
                    headers={**_bvf_headers(token), "Content-Type": "application/json"},
                    json={"playerId": int(mem.bvf_player_id)},
                )
                if res.status_code < 400:
                    mem.synced = True
        except Exception:
            pass
    db.commit()
    return submit_card_index_to_federation(cid, payload, db, current_user)


class ClubPhysicalBulkIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None
    only_pending: bool = True
    athlete_ids: list[int] = Field(default_factory=list)


@router.get("/physical/club-preview")
def preview_club_physical_from_tests(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Преглед: кои свързани със СЕК имат тестове за Height/Weight/FullExtent/Attack/Block."""
    from app.services.physical_from_tests import find_matching_synced, latest_bvf_fields_from_tests

    club = _club_for_user(db, current_user, club_id)
    athletes = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None), Athlete.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    items = []
    ready = already = no_tests = 0
    for a in athletes:
        preview = latest_bvf_fields_from_tests(db, a.id)
        matched = find_matching_synced(db, a.id, preview["fields"]) if preview["has_data"] else None
        if not preview["has_data"]:
            status = "no_tests"
            no_tests += 1
        elif matched is not None:
            status = "already_synced"
            already += 1
        else:
            status = "ready"
            ready += 1
        items.append(
            {
                "athlete_id": a.id,
                "athlete_name": a.athlete_name,
                "bvf_player_id": a.bvf_player_id,
                "bvf_player_number": a.bvf_player_number,
                "status": status,
                "measured_at": preview.get("measured_at"),
                "fields": preview.get("fields") or {},
                "has_data": bool(preview.get("has_data")),
            }
        )
    return {
        "club_id": club.id,
        "total_linked": len(athletes),
        "ready": ready,
        "already_synced": already,
        "no_tests": no_tests,
        "items": items,
        "mapping": [
            {"field": "height_cm", "test": "ANTH_HEIGHT", "bvf": "Height", "label": "Височина"},
            {"field": "weight_kg", "test": "ANTH_WEIGHT", "bvf": "Weight", "label": "Тегло"},
            {"field": "full_extent_cm", "test": "ANTH_REACH", "bvf": "FullExtent", "label": "Размах / разтег"},
            {"field": "attack_cm", "test": "PHYS_JUMP_APPROACH", "bvf": "Attack", "label": "Атака"},
            {"field": "block_cm", "test": "PHYS_JUMP_2ARM", "bvf": "Block", "label": "Блок"},
        ],
    }


@router.post("/physical/club-send-from-tests")
def club_send_physical_from_tests(
    payload: ClubPhysicalBulkIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Изпраща физическите данни от тестовете към СЕК за всички (или избрани) свързани състезатели."""
    from app.services.physical_from_tests import (
        find_matching_synced,
        latest_bvf_fields_from_tests,
        upsert_pending_from_tests,
    )

    club = _club_for_user(db, current_user, payload.club_id)
    try:
        token = _token_matches_club(payload.bvf_token, club)
    except HTTPException as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Няма валидна БФВ връзка / write token за developments. {exc.detail}",
        ) from exc

    q = db.query(Athlete).filter(
        Athlete.club_id == club.id,
        Athlete.bvf_player_id.isnot(None),
        Athlete.is_active.is_(True),
    )
    if payload.athlete_ids:
        q = q.filter(Athlete.id.in_([int(x) for x in payload.athlete_ids]))
    athletes = q.order_by(Athlete.athlete_name.asc()).all()

    sent = skipped_synced = skipped_no_tests = errors = 0
    results: list[dict] = []
    for a in athletes:
        preview = latest_bvf_fields_from_tests(db, a.id)
        if not preview["has_data"]:
            skipped_no_tests += 1
            results.append({"athlete_id": a.id, "athlete_name": a.athlete_name, "status": "no_tests"})
            continue
        matched = find_matching_synced(db, a.id, preview["fields"])
        if matched is not None and payload.only_pending:
            skipped_synced += 1
            results.append(
                {
                    "athlete_id": a.id,
                    "athlete_name": a.athlete_name,
                    "status": "already_synced",
                    "bvf_development_id": matched.bvf_development_id,
                }
            )
            continue
        try:
            row = upsert_pending_from_tests(db, a.id, user_id=current_user.id)
            if row is None:
                skipped_no_tests += 1
                results.append({"athlete_id": a.id, "athlete_name": a.athlete_name, "status": "no_tests"})
                continue
            _push_physical_row_to_bvf(row, a, token)
            db.commit()
            db.refresh(row)
            sent += 1
            results.append(
                {
                    "athlete_id": a.id,
                    "athlete_name": a.athlete_name,
                    "status": "sent",
                    "bvf_development_id": row.bvf_development_id,
                    "fields": preview["fields"],
                }
            )
        except HTTPException as exc:
            db.rollback()
            errors += 1
            results.append(
                {
                    "athlete_id": a.id,
                    "athlete_name": a.athlete_name,
                    "status": "error",
                    "error": str(exc.detail),
                }
            )
        except Exception as exc:
            db.rollback()
            errors += 1
            results.append(
                {
                    "athlete_id": a.id,
                    "athlete_name": a.athlete_name,
                    "status": "error",
                    "error": str(exc)[:200],
                }
            )

    return {
        "ok": errors == 0,
        "sent": sent,
        "skipped_synced": skipped_synced,
        "skipped_no_tests": skipped_no_tests,
        "errors": errors,
        "results": results,
    }
