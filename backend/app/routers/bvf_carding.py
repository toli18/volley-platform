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
    BvfCardIndex,
    BvfCardIndexMember,
    Club,
    User,
    UserRole,
)
from app.routers.bvf_admin import (
    BVF_API_BASE,
    BVF_TIMEOUT,
    CoachesListIn,
    _athlete_for_bvf_action,
    _bvf_get,
    _bvf_headers,
    _bvf_post_multipart,
    _club_for_user,
    _club_id_from_token,
    _ensure_head_with_club,
    _normalize_bearer,
)
from app.services.athlete_identity import apply_birth_date_from_egn, compose_athlete_name
from app.services.athlete_photo import has_cached_photo, save_athlete_photo

router = APIRouter(prefix="/api/bvf-admin", tags=["BVF Carding"])

DOC_TYPE_LABELS = {
    0: "Договор / документ",
    1: "Медицински",
    2: "Форма за картотекиране",
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
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Клубът не е свързан с БФВ")
    if int(_club_id_from_token(token_n)) != int(club.bvf_club_id):
        raise HTTPException(status_code=403, detail="Token-ът не е за свързания БФВ клуб")
    return token_n


def _bvf_get_bytes(path: str, token: str) -> tuple[bytes, str]:
    url = f"{BVF_API_BASE}{path}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT) as client:
            res = client.get(url, headers=_bvf_headers(token))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ API недостъпно: {exc}") from exc
    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="БФВ token е невалиден или изтекъл.")
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail=(res.text or "")[:300] or f"БФВ грешка {res.status_code}")
    ctype = res.headers.get("content-type") or "application/octet-stream"
    return res.content, ctype


def _bvf_get_soft(path: str, token: str) -> Any | None:
    """GET към БФВ; 403/404 → None (клубният акаунт няма глобален search)."""
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
    Клубната роля няма достъп до /api/players/search (403).
    Списъкът /clubs/{id}/players е без EGN → взимаме GET /api/players/{id}
    (PlayerDetailDto.egn) само за играчите на клуба.
    """
    roster = _club_players(token, int(club.bvf_club_id))
    if not roster:
        raise HTTPException(
            status_code=404,
            detail="Клубът няма състезатели в БФВ. Ако още не е регистриран — използвай „Създай в БФВ“.",
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
        detail="Няма състезател с това ЕГН в клуба на БФВ. Ако още не е регистриран — използвай „Създай в БФВ“.",
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
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
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
    from app.services.athlete_photo import fetch_bvf_photo_bytes, save_athlete_photo

    content = fetch_bvf_photo_bytes(token, photo_id)
    if not content:
        raise HTTPException(status_code=502, detail="Неуспешно изтегляне на снимката от БФВ")
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
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, payload.athlete_id)
    if athlete.bvf_player_id:
        raise HTTPException(status_code=409, detail="Вече е свързан с БФВ")
    club = _club_for_any_coach(db, current_user, payload.club_id)
    token = _token_matches_club(payload.bvf_token, club)
    egn_val = (payload.egn or athlete.egn or "").strip()
    if len(egn_val) != 10:
        raise HTTPException(status_code=422, detail="ЕГН е задължително (10 символа)")

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
    db.commit()
    db.refresh(athlete)

    if photo_id:
        try:
            content, _ = _bvf_get_bytes(f"/api/files/{photo_id}", token)
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
        if row.bvf_document_id not in seen:
            db.delete(row)
    db.commit()
    return out


def _doc_checklist(athlete: Athlete, docs: list[dict], season_year: int) -> list[dict]:
    has_photo = has_cached_photo(athlete.id) or bool(athlete.bvf_photo_id)
    season_docs = [
        d
        for d in docs
        if d.get("season_year") == season_year or str(season_year) in (d.get("description") or "")
    ]
    has_form = any(
        (d.get("doc_type") == 2) or ("форм" in (d.get("description") or "").lower()) for d in (season_docs or docs)
    )
    return [
        {"key": "photo", "label": "Снимка", "ok": has_photo},
        {"key": "egn", "label": "ЕГН", "ok": bool((athlete.egn or "").strip())},
        {"key": "carding_form", "label": f"Форма картотекиране {season_year}", "ok": has_form},
        {"key": "any_doc", "label": "Поне един документ в БФВ", "ok": len(docs) > 0},
    ]


@router.post("/players/documents/sync")
def sync_player_documents(
    payload: TokenAthleteIn,
    season_year: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, payload.athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Първо свържи / създай в БФВ")
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
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if not athlete.bvf_player_id:
        raise HTTPException(status_code=422, detail="Първо свържи / създай в БФВ")
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
        local.status = "signed" if local.is_signed else "synced"
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
    items.sort(key=lambda x: (-(x["year"] or 0), x.get("age_group") or ""))
    return {"items": items, "bvf_club_id": club.bvf_club_id}


@router.post("/card-indexes/create")
def create_card_index(
    payload: CardIndexCreateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
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
    added = 0
    errors: list[str] = []
    for aid in payload.athlete_ids or []:
        athlete = _athlete_for_bvf_action(db, current_user, int(aid))
        if not athlete.bvf_player_id:
            errors.append(f"#{aid} няма БФВ id")
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
        added += 1
    db.commit()
    return {"added": added, "errors": errors, "bvf_card_index_id": bvf_card_index_id}
