"""BVF Administration — verified club link + selective player import via federation API."""

from __future__ import annotations

import base64
import json
from datetime import date, datetime
from typing import Any, Optional

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.roles import require_role
from app.models import Athlete, Club, User, UserRole
from app.services.athlete_identity import (
    apply_birth_date_from_egn,
    compose_athlete_name,
    default_nationality_from_city,
    validate_name_part,
)

router = APIRouter(prefix="/api/bvf-admin", tags=["BVF Admin"])

BVF_API_BASE = "https://db.bvf.bg"
BVF_TIMEOUT = 45.0


def _ensure_head_with_club(user: User) -> None:
    if user.role not in (UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin):
        raise HTTPException(status_code=403, detail="Само главен треньор / админ")
    if user.role == UserRole.club_head_coach and not user.club_id:
        raise HTTPException(status_code=422, detail="Главният треньор няма назначен клуб")


def _club_for_user(db: Session, user: User, club_id: int | None = None) -> Club:
    target_id = club_id or user.club_id
    if not target_id:
        raise HTTPException(status_code=422, detail="Няма клуб")
    if user.role == UserRole.club_head_coach and int(user.club_id) != int(target_id):
        raise HTTPException(status_code=403, detail="Нямаш достъп до този клуб")
    club = db.query(Club).filter(Club.id == int(target_id)).first()
    if not club:
        raise HTTPException(status_code=404, detail="Клубът не е намерен")
    return club


def _normalize_bearer(raw: str) -> str:
    from app.services.bvf_auth import normalize_bvf_cred

    token = normalize_bvf_cred(raw)
    if not token:
        raise HTTPException(status_code=422, detail="Липсва БФВ token / API ключ")
    return token


def _jwt_payload_unverified(token: str) -> dict:
    """Чете payload без проверка на подписа — валидността се доказва с live call към БФВ."""
    parts = token.split(".")
    if len(parts) < 2:
        raise HTTPException(status_code=422, detail="Невалиден JWT token")
    try:
        pad = "=" * (-len(parts[1]) % 4)
        return json.loads(base64.urlsafe_b64decode(parts[1] + pad).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Невалиден JWT token") from exc


def _club_id_from_token(token: str) -> int:
    from app.services.bvf_auth import is_api_key

    if is_api_key(token):
        raise HTTPException(
            status_code=422,
            detail="API ключът няма JWT clubId — използвай записания bvf_club_id на клуба.",
        )
    payload = _jwt_payload_unverified(token)
    raw = payload.get("clubId") or payload.get("club_id")
    if raw is None:
        raise HTTPException(
            status_code=422,
            detail="Token-ът няма clubId claim — влез с клубен акаунт в db.bvf.bg",
        )
    try:
        return int(raw)
    except Exception as exc:
        raise HTTPException(status_code=422, detail="Невалиден clubId в token") from exc


def _bvf_headers(token: str, *, accept: str = "application/json") -> dict[str, str]:
    from app.services.bvf_auth import bvf_auth_headers

    return bvf_auth_headers(token, accept=accept)


def _assert_cred_matches_club(cred: str, club: Club) -> None:
    """JWT трябва да носи същия clubId; ApiKey се валидира при запазване срещу клуба."""
    from app.services.bvf_auth import is_api_key

    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Клубът не е свързан с БФВ")
    if is_api_key(cred):
        return
    token_club = _club_id_from_token(cred)
    if int(token_club) != int(club.bvf_club_id):
        raise HTTPException(
            status_code=403,
            detail=f"Token-ът е за БФВ клуб {token_club}, а платформата е свързана с {club.bvf_club_id}",
        )


def _parse_club_options(remote: Any) -> list[dict[str, Any]]:
    if not isinstance(remote, list):
        return []
    out: list[dict[str, Any]] = []
    for row in remote:
        if not isinstance(row, dict):
            continue
        raw_id = row.get("value") if row.get("value") is not None else row.get("id")
        try:
            cid = int(raw_id)
        except Exception:
            continue
        label = str(row.get("label") or row.get("name") or row.get("fullName") or f"Клуб #{cid}").strip()
        out.append({"id": cid, "label": label})
    return out


def _link_status_payload(club: Club, *, remote: dict | None = None, linked_athletes: int | None = None) -> dict:
    from app.services.bvf_auth import club_has_api_key, club_has_bvf_auth, club_has_credentials

    has_key = club_has_api_key(club)
    has_creds = club_has_credentials(club)
    has_auth = club_has_bvf_auth(club)
    auth_mode = "api_key" if has_key else ("password" if has_creds else None)
    payload = {
        "club_id": club.id,
        "club_name": club.name,
        "bvf_club_id": club.bvf_club_id,
        "bvf_club_name": club.bvf_club_name,
        "bvf_linked_at": club.bvf_linked_at.isoformat() if club.bvf_linked_at else None,
        "bvf_username": club.bvf_username if has_creds else None,
        "has_bvf_credentials": has_creds,
        "has_bvf_api_key": has_key,
        "bvf_api_key_prefix": club.bvf_api_key_prefix if has_key else None,
        "auth_mode": auth_mode,
        "requires_bvf_token": not has_auth,
        "permanent_link": bool(club.bvf_club_id and has_auth),
        "bvf_default_first_coach_id": getattr(club, "bvf_default_first_coach_id", None),
        "bvf_default_first_coach_name": getattr(club, "bvf_default_first_coach_name", None),
        "verified": True,
    }
    if linked_athletes is not None:
        payload["linked_athletes"] = linked_athletes
    if remote:
        payload["bvf_full_name"] = remote.get("fullName")
    return payload


def _bvf_get(path: str, token: str) -> Any:
    url = f"{BVF_API_BASE}{path}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT) as client:
            res = client.get(url, headers=_bvf_headers(token))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ API недостъпно: {exc}") from exc

    if res.status_code == 401:
        raise HTTPException(
            status_code=401,
            detail="БФВ token е невалиден или изтекъл. Направи нов login в db.bvf.bg / Swagger.",
        )
    if res.status_code == 403:
        raise HTTPException(status_code=403, detail="Нямаш право за този ресурс в БФВ.")
    if res.status_code >= 400:
        detail = (res.text or "").strip()[:300] or f"БФВ грешка {res.status_code}"
        raise HTTPException(status_code=502, detail=detail)
    try:
        return res.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="БФВ върна невалиден JSON") from exc


def _bvf_post_multipart(path: str, token: str, data: dict, files: dict | None = None) -> Any:
    url = f"{BVF_API_BASE}{path}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT) as client:
            kwargs: dict[str, Any] = {
                "headers": _bvf_headers(token),
                "data": data,
            }
            if files:
                kwargs["files"] = files
            res = client.post(url, **kwargs)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ API недостъпно: {exc}") from exc

    if res.status_code == 401:
        raise HTTPException(status_code=401, detail="БФВ token е невалиден или изтекъл.")
    if res.status_code == 403:
        raise HTTPException(status_code=403, detail="Нямаш право за този ресурс в БФВ.")
    if res.status_code >= 400:
        detail = (res.text or "").strip()[:500] or f"БФВ грешка {res.status_code}"
        raise HTTPException(status_code=502, detail=detail)
    try:
        return res.json()
    except Exception:
        return {"ok": True, "raw": (res.text or "")[:200]}


def _athlete_for_bvf_action(db: Session, user: User, athlete_id: int) -> Athlete:
    athlete = db.query(Athlete).filter(Athlete.id == int(athlete_id)).first()
    if not athlete:
        raise HTTPException(status_code=404, detail="Състезателят не е намерен")
    if user.role in (UserRole.platform_admin, UserRole.federation_admin):
        return athlete
    if user.role == UserRole.club_head_coach:
        if not user.club_id or int(athlete.club_id or 0) != int(user.club_id):
            raise HTTPException(status_code=403, detail="Нямаш достъп до този състезател")
        return athlete
    if user.role == UserRole.coach:
        if int(athlete.coach_id) != int(user.id):
            raise HTTPException(status_code=403, detail="Нямаш достъп до този състезател")
        return athlete
    raise HTTPException(status_code=403, detail="Няма достъп")


def _parse_birth_date(raw: Any) -> date | None:
    if not raw:
        return None
    if isinstance(raw, date) and not isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except Exception:
        try:
            return date.fromisoformat(s[:10])
        except Exception:
            return None


def _sex_to_gender(sex: Any) -> str | None:
    if sex is None:
        return None
    try:
        n = int(sex)
    except Exception:
        return None
    if n == 0:
        return "male"
    if n == 1:
        return "female"
    return None


def _display_name(row: dict) -> str:
    parts = [
        str(row.get("firstName") or "").strip(),
        str(row.get("middleName") or "").strip(),
        str(row.get("lastName") or "").strip(),
    ]
    return " ".join(p for p in parts if p) or f"Състезател #{row.get('id') or '?'}"


def _preview_rows(db: Session, club: Club, players: list) -> dict:
    existing = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None))
        .all()
    )
    by_bvf = {int(a.bvf_player_id): a for a in existing if a.bvf_player_id}
    by_egn = {
        str(a.egn).strip(): a
        for a in db.query(Athlete).filter(Athlete.club_id == club.id, Athlete.egn.isnot(None)).all()
        if a.egn
    }

    rows = []
    for raw in players or []:
        if not isinstance(raw, dict):
            continue
        try:
            pid_i = int(raw.get("id"))
        except Exception:
            continue
        egn = str(raw.get("egn") or "").strip() or None
        linked = by_bvf.get(pid_i)
        egn_hit = by_egn.get(egn) if egn else None
        status = "new"
        platform_athlete_id = None
        if linked:
            status = "linked"
            platform_athlete_id = linked.id
        elif egn_hit:
            status = "egn_match"
            platform_athlete_id = egn_hit.id

        coach = raw.get("currentCoach") if isinstance(raw.get("currentCoach"), dict) else {}
        city = raw.get("city") if isinstance(raw.get("city"), dict) else {}
        rows.append(
            {
                "bvf_player_id": pid_i,
                "bvf_player_number": raw.get("number"),
                "name": _display_name(raw),
                "firstName": raw.get("firstName"),
                "middleName": raw.get("middleName"),
                "lastName": raw.get("lastName"),
                "birthYear": raw.get("birthYear"),
                "birthDate": (str(raw.get("birthDate") or "")[:10] or None),
                "sex": raw.get("sex"),
                "gender": _sex_to_gender(raw.get("sex")),
                "has_egn": bool(egn),
                "egn": egn,
                "currentCoach": coach.get("name"),
                "city": city.get("name"),
                "isDeleted": bool(raw.get("isDeleted")),
                "status": status,
                "platform_athlete_id": platform_athlete_id,
                "_raw": raw,
            }
        )

    rows.sort(key=lambda r: (r.get("birthYear") or 0, r.get("name") or ""))
    return {
        "club_id": club.id,
        "bvf_club_id": club.bvf_club_id,
        "total": len(rows),
        "already_linked": sum(1 for r in rows if r["status"] == "linked"),
        "egn_matches": sum(1 for r in rows if r["status"] == "egn_match"),
        "new": sum(1 for r in rows if r["status"] == "new"),
        "players": rows,
    }


class LinkClubIn(BaseModel):
    """Еднократна оторизация: клубен username/password в db.bvf.bg (legacy) или JWT."""

    username: Optional[str] = None
    password: Optional[str] = None
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


class LinkApiKeyIn(BaseModel):
    """Постоянна връзка чрез стоящ API ключ (X-Api-Key) от Интеграции → API токени."""

    api_key: str
    bvf_club_id: Optional[int] = None
    club_id: Optional[int] = None


class FetchPlayersIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


class ImportPlayersIn(BaseModel):
    players: list[dict] = Field(default_factory=list)
    club_id: Optional[int] = None
    assign_coach_id: Optional[int] = None


class CoachesListIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


@router.get("/status")
def bvf_admin_status(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    if current_user.role == UserRole.coach:
        if not current_user.club_id:
            raise HTTPException(status_code=422, detail="Няма клуб")
        club = db.query(Club).filter(Club.id == int(current_user.club_id)).first()
        if not club:
            raise HTTPException(status_code=404, detail="Клубът не е намерен")
    else:
        _ensure_head_with_club(current_user)
        club = _club_for_user(db, current_user, club_id)
    linked_count = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.bvf_player_id.isnot(None))
        .count()
    )
    payload = _link_status_payload(club, linked_athletes=linked_count)
    payload.pop("verified", None)
    return payload


@router.put("/link-api-key")
def link_api_key(
    payload: LinkApiKeyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """
    Записва стоящ API ключ (bfv_…) за клуба.
    Разпознава БФВ клуба през GET /api/clubs/options (+ опционален bvf_club_id).
    """
    from app.services.bvf_auth import (
        api_key_display_prefix,
        encrypt_secret,
        is_api_key,
        normalize_bvf_cred,
    )

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    key = normalize_bvf_cred(payload.api_key)
    if not is_api_key(key):
        raise HTTPException(
            status_code=422,
            detail="Очаква се API ключ, започващ с bvf_ (от Интеграции → API токени в db.bvf.bg).",
        )

    options = _parse_club_options(_bvf_get("/api/clubs/options", key))
    if not options:
        raise HTTPException(
            status_code=403,
            detail="Ключът няма достъп до клубове (Clubs: четене). Провери правата на токена.",
        )

    wanted = payload.bvf_club_id or club.bvf_club_id
    if wanted is not None:
        bvf_club_id = int(wanted)
        if bvf_club_id not in {o["id"] for o in options}:
            raise HTTPException(
                status_code=403,
                detail=f"Ключът няма достъп до БФВ клуб {bvf_club_id}.",
            )
    elif len(options) == 1:
        bvf_club_id = options[0]["id"]
    else:
        labels = ", ".join(f"{o['id']} ({o['label']})" for o in options[:8])
        raise HTTPException(
            status_code=422,
            detail=f"Ключът покрива няколко клуба — подай bvf_club_id. Налични: {labels}",
        )

    other = (
        db.query(Club)
        .filter(Club.bvf_club_id == bvf_club_id, Club.id != club.id)
        .first()
    )
    if other:
        raise HTTPException(
            status_code=409,
            detail=f"БФВ клуб {bvf_club_id} вече е свързан с „{other.name}“",
        )

    remote = _bvf_get(f"/api/clubs/{bvf_club_id}", key)
    if not isinstance(remote, dict) or int(remote.get("id") or 0) != bvf_club_id:
        raise HTTPException(status_code=502, detail="БФВ върна неочакван профил на клуб")

    club.bvf_club_id = bvf_club_id
    club.bvf_club_name = (
        str(remote.get("name") or remote.get("fullName") or "").strip() or f"БФВ клуб {bvf_club_id}"
    )
    club.bvf_linked_at = datetime.utcnow()
    club.bvf_api_key_enc = encrypt_secret(key)
    club.bvf_api_key_prefix = api_key_display_prefix(key)
    from app.services.club_profile_sync import apply_bvf_club_remote_to_local, sync_coach_phones_from_bvf

    apply_bvf_club_remote_to_local(club, remote)
    try:
        coaches_remote = _bvf_get(f"/api/clubs/{bvf_club_id}/coaches", key)
        if isinstance(coaches_remote, list):
            sync_coach_phones_from_bvf(db, club, coaches_remote)
    except Exception:
        pass
    db.commit()
    db.refresh(club)
    return _link_status_payload(club, remote=remote)


@router.put("/link-club")
def link_club(
    payload: LinkClubIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """
    Legacy постоянна връзка клуб ↔ БФВ чрез username/password (JWT login).
    Предпочитан път: PUT /link-api-key.
    """
    from app.services.bvf_auth import bvf_login, encrypt_secret, is_api_key

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)

    username = (payload.username or "").strip()
    password = payload.password or ""
    stored_user = None
    stored_enc = None

    if username and password:
        login = bvf_login(username, password)
        token = login["_token"]
        stored_user = username
        stored_enc = encrypt_secret(password)
    elif payload.bvf_token:
        token = _normalize_bearer(payload.bvf_token)
        if is_api_key(token):
            raise HTTPException(
                status_code=422,
                detail="За API ключ използвай „Запази API ключ“ (link-api-key), не username/password формата.",
            )
    else:
        raise HTTPException(
            status_code=422,
            detail="Въведи БФВ потребител и парола, или запази API ключ от Интеграции.",
        )

    bvf_club_id = _club_id_from_token(token)

    other = (
        db.query(Club)
        .filter(Club.bvf_club_id == bvf_club_id, Club.id != club.id)
        .first()
    )
    if other:
        raise HTTPException(
            status_code=409,
            detail=f"БФВ клуб {bvf_club_id} вече е свързан с „{other.name}“",
        )

    remote = _bvf_get(f"/api/clubs/{bvf_club_id}", token)
    if not isinstance(remote, dict) or int(remote.get("id") or 0) != bvf_club_id:
        raise HTTPException(status_code=502, detail="БФВ върна неочакван профил на клуб")

    club.bvf_club_id = bvf_club_id
    club.bvf_club_name = (
        str(remote.get("name") or remote.get("fullName") or "").strip() or f"БФВ клуб {bvf_club_id}"
    )
    club.bvf_linked_at = datetime.utcnow()
    if stored_user and stored_enc:
        club.bvf_username = stored_user
        club.bvf_password_enc = stored_enc
    from app.services.club_profile_sync import apply_bvf_club_remote_to_local, sync_coach_phones_from_bvf

    apply_bvf_club_remote_to_local(club, remote)
    try:
        coaches_remote = _bvf_get(f"/api/clubs/{bvf_club_id}/coaches", token)
        if isinstance(coaches_remote, list):
            sync_coach_phones_from_bvf(db, club, coaches_remote)
    except Exception:
        pass
    db.commit()
    db.refresh(club)
    return _link_status_payload(club, remote=remote)


@router.delete("/link-club")
def unlink_club(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    club.bvf_club_id = None
    club.bvf_club_name = None
    club.bvf_linked_at = None
    club.bvf_username = None
    club.bvf_password_enc = None
    club.bvf_api_key_enc = None
    club.bvf_api_key_prefix = None
    db.commit()
    return {"ok": True, "club_id": club.id}


@router.post("/players/fetch")
def fetch_players(
    payload: FetchPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Дърпа състезателите от БФВ — ApiKey / credentials автоматично."""
    from app.services.bvf_auth import resolve_club_bvf_token

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Първо свържи клуба с БФВ")
    token = resolve_club_bvf_token(club, payload.bvf_token)
    _assert_cred_matches_club(token, club)

    remote = _bvf_get(f"/api/clubs/{club.bvf_club_id}/players", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ players response не е списък")

    return _preview_rows(db, club, remote)


@router.post("/players/import")
def import_players(
    payload: ImportPlayersIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Импортира само избраните състезатели (от fetch preview)."""
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Първо свържи клуба с БФВ")

    assign_coach_id = payload.assign_coach_id or current_user.id
    coach = db.query(User).filter(User.id == int(assign_coach_id)).first()
    if current_user.role == UserRole.club_head_coach:
        assign_coach_id = current_user.id
    elif not coach:
        raise HTTPException(status_code=422, detail="Невалиден треньор за assign")

    created = 0
    linked = 0
    skipped = 0
    errors: list[str] = []

    for raw in payload.players or []:
        if not isinstance(raw, dict):
            skipped += 1
            continue
        # Accept either preview row or raw BVF player
        if raw.get("_raw") and isinstance(raw["_raw"], dict):
            raw = raw["_raw"]
        elif raw.get("bvf_player_id") and not raw.get("id"):
            raw = {
                **raw,
                "id": raw.get("bvf_player_id"),
                "number": raw.get("bvf_player_number"),
                "firstName": raw.get("firstName"),
                "middleName": raw.get("middleName"),
                "lastName": raw.get("lastName"),
            }

        try:
            pid = int(raw.get("id") or raw.get("bvf_player_id"))
        except Exception:
            skipped += 1
            continue

        name = _display_name(raw)
        egn = str(raw.get("egn") or "").strip() or None
        birth_date = _parse_birth_date(raw.get("birthDate"))
        birth_year = raw.get("birthYear")
        try:
            birth_year = int(birth_year) if birth_year is not None else (birth_date.year if birth_date else None)
        except Exception:
            birth_year = birth_date.year if birth_date else None
        gender = _sex_to_gender(raw.get("sex"))
        number = raw.get("number") or raw.get("bvf_player_number")
        try:
            number_i = int(number) if number is not None else None
        except Exception:
            number_i = None

        existing = db.query(Athlete).filter(Athlete.bvf_player_id == pid).first()
        first_n = str(raw.get("firstName") or "").strip() or None
        middle_n = str(raw.get("middleName") or "").strip() or None
        last_n = str(raw.get("lastName") or "").strip() or None
        nationality = str(raw.get("nationality") or "").strip() or None
        photo_id = str(raw.get("photoId") or "").strip() or None

        if existing:
            existing.athlete_name = name
            if first_n:
                existing.first_name = first_n
            if middle_n:
                existing.middle_name = middle_n
            if last_n:
                existing.last_name = last_n
            if nationality:
                existing.nationality = nationality
            if photo_id:
                existing.bvf_photo_id = photo_id
            if egn:
                existing.egn = egn
            if birth_date:
                existing.birth_date = birth_date
            if birth_year:
                existing.birth_year = birth_year
            if gender:
                existing.gender = gender
            if number_i:
                existing.bvf_player_number = number_i
            existing.bvf_synced_at = datetime.utcnow()
            if existing.club_id is None:
                existing.club_id = club.id
            linked += 1
            continue

        if egn:
            by_egn = (
                db.query(Athlete)
                .filter(Athlete.club_id == club.id, Athlete.egn == egn)
                .first()
            )
            if by_egn:
                by_egn.bvf_player_id = pid
                by_egn.bvf_player_number = number_i
                by_egn.athlete_name = name or by_egn.athlete_name
                if first_n:
                    by_egn.first_name = first_n
                if middle_n:
                    by_egn.middle_name = middle_n
                if last_n:
                    by_egn.last_name = last_n
                if nationality:
                    by_egn.nationality = nationality
                if photo_id:
                    by_egn.bvf_photo_id = photo_id
                if birth_date:
                    by_egn.birth_date = birth_date
                if birth_year:
                    by_egn.birth_year = birth_year
                if gender:
                    by_egn.gender = gender
                by_egn.bvf_synced_at = datetime.utcnow()
                linked += 1
                continue

        athlete = Athlete(
            coach_id=int(assign_coach_id),
            club_id=club.id,
            athlete_name=name,
            first_name=first_n,
            middle_name=middle_n,
            last_name=last_n,
            birth_date=birth_date,
            birth_year=birth_year,
            place_of_birth=(raw.get("city") or {}).get("name")
            if isinstance(raw.get("city"), dict)
            else None,
            nationality=nationality or "България",
            gender=gender,
            egn=egn,
            bvf_player_id=pid,
            bvf_player_number=number_i,
            bvf_photo_id=photo_id,
            bvf_synced_at=datetime.utcnow(),
            is_active=True,
            notes="Импортиран от БФВ картотека",
        )
        db.add(athlete)
        created += 1

    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Неуспешен запис: {exc}") from exc

    return {
        "created": created,
        "linked": linked,
        "skipped": skipped,
        "errors": errors,
        "club_id": club.id,
    }





@router.post("/coaches/list")
def list_bvf_coaches(
    payload: CoachesListIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    from app.services.bvf_auth import resolve_club_bvf_token

    club = _club_for_user(db, current_user, payload.club_id) if current_user.role != UserRole.coach else None
    if current_user.role == UserRole.coach:
        if not current_user.club_id:
            raise HTTPException(status_code=422, detail="Няма клуб")
        club = db.query(Club).filter(Club.id == int(current_user.club_id)).first()
        if not club:
            raise HTTPException(status_code=404, detail="Клубът не е намерен")
    if not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Първо свържи клуба с БФВ")
    token = resolve_club_bvf_token(club, payload.bvf_token)
    _assert_cred_matches_club(token, club)
    remote = _bvf_get(f"/api/clubs/{club.bvf_club_id}/coaches", token)
    if not isinstance(remote, list):
        raise HTTPException(status_code=502, detail="БФВ coaches response не е списък")
    coaches = []
    for row in remote:
        if not isinstance(row, dict):
            continue
        try:
            cid = int(row.get("id"))
        except Exception:
            continue
        name = (
            str(row.get("name") or "").strip()
            or " ".join(
                p
                for p in [
                    str(row.get("firstName") or "").strip(),
                    str(row.get("middleName") or "").strip(),
                    str(row.get("lastName") or "").strip(),
                ]
                if p
            )
            or f"Треньор #{cid}"
        )
        phone = (
            str(row.get("contactNumber") or row.get("phone") or row.get("mobilePhone") or "").strip()
            or None
        )
        coaches.append({"id": cid, "name": name, "phone": phone})
    coaches.sort(key=lambda c: c["name"])
    return {"coaches": coaches, "bvf_club_id": club.bvf_club_id}


@router.post("/players/resolve-first-coach")
def resolve_first_coach_for_athlete(
    athlete_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.coach,
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    """Предложен FirstCoachId от мапинга треньор ↔ СЕК (или клубен default)."""
    from app.services.bvf_coach_link import resolve_first_coach_bvf_id, resolve_first_coach_label, sek_link_status

    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    club = db.query(Club).filter(Club.id == athlete.club_id).first() if athlete.club_id else None
    coach = db.query(User).filter(User.id == athlete.coach_id).first() if athlete.coach_id else None
    resolved = resolve_first_coach_bvf_id(coach, club)
    source = None
    if coach and getattr(coach, "bvf_coach_id", None):
        source = "coach_self"
    elif coach and getattr(coach, "bvf_first_coach_proxy_id", None):
        source = "coach_proxy"
    elif club and getattr(club, "bvf_default_first_coach_id", None):
        source = "club_default"
    return {
        "athlete_id": athlete.id,
        "coach_user_id": coach.id if coach else None,
        "coach_name": coach.name if coach else None,
        "sek_link_status": sek_link_status(coach) if coach else "none",
        "first_coach_id": resolved,
        "first_coach_name": resolve_first_coach_label(coach, club),
        "source": source,
        "ready": resolved is not None,
    }


@router.post("/players/create-from-athlete")
async def create_player_from_athlete(
    athlete_id: int = Form(...),
    first_coach_id: Optional[int] = Form(None),
    bvf_token: Optional[str] = Form(None),
    egn: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(
            UserRole.club_head_coach,
            UserRole.platform_admin,
            UserRole.federation_admin,
        )
    ),
):
    """
    Създава състезател в БФВ от локалния профил + снимка.
    Записва bvf_player_id / number / photoId обратно; идентичността се заключва.
    FirstCoachId: подаден ръчно, иначе от мапинга на треньора / клубен default.
    Само главен треньор / админ.
    """
    _ensure_head_with_club(current_user)
    from app.services.bvf_auth import resolve_club_bvf_token
    from app.services.bvf_coach_link import resolve_first_coach_bvf_id, resolve_first_coach_label

    athlete = _athlete_for_bvf_action(db, current_user, athlete_id)
    if athlete.bvf_player_id:
        raise HTTPException(status_code=409, detail="Състезателят вече е свързан с БФВ")

    club = None
    if athlete.club_id:
        club = db.query(Club).filter(Club.id == athlete.club_id).first()
    if not club or not club.bvf_club_id:
        raise HTTPException(status_code=422, detail="Клубът не е свързан с БФВ")

    token = resolve_club_bvf_token(club, bvf_token)
    _assert_cred_matches_club(token, club)
    egn_val = (egn or athlete.egn or "").strip()
    if len(egn_val) != 10:
        raise HTTPException(status_code=422, detail="ЕГН е задължително (10 символа)")

    coach = db.query(User).filter(User.id == athlete.coach_id).first() if athlete.coach_id else None
    resolved_coach_id = first_coach_id
    if resolved_coach_id is None:
        resolved_coach_id = resolve_first_coach_bvf_id(coach, club)
    if not resolved_coach_id:
        raise HTTPException(
            status_code=422,
            detail=(
                "Няма FirstCoachId: задай разпознаване в СЕК за треньора "
                "(Админ → Треньори) или клубен default лицензиран треньор."
            ),
        )

    try:
        first_name = validate_name_part("Собствено име", athlete.first_name)
        middle_name = validate_name_part("Бащино име", athlete.middle_name)
        last_name = validate_name_part("Фамилия", athlete.last_name)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"{exc}. Попълни трите имена в профила преди създаване в БФВ.",
        ) from exc

    place = (athlete.place_of_birth or "").strip()
    if not place:
        raise HTTPException(status_code=422, detail="Градът на раждане е задължителен")
    nationality = default_nationality_from_city(place, athlete.nationality)

    photo_bytes = await file.read()
    if not photo_bytes:
        raise HTTPException(status_code=422, detail="Снимката е задължителна")
    filename = file.filename or "photo.jpg"
    content_type = file.content_type or "image/jpeg"

    form_data = {
        "FirstClubId": str(int(club.bvf_club_id)),
        "FirstCoachId": str(int(resolved_coach_id)),
        "FirstName": first_name,
        "MiddleName": middle_name,
        "LastName": last_name,
        "Egn": egn_val,
        "Nationality": nationality,
        "CityName": place[:25],
    }
    files = {"file": (filename, photo_bytes, content_type)}
    remote = _bvf_post_multipart("/api/players", token, form_data, files)
    if not isinstance(remote, dict):
        raise HTTPException(status_code=502, detail="БФВ не върна профил на състезател")

    try:
        pid = int(remote.get("id"))
    except Exception as exc:
        raise HTTPException(status_code=502, detail="БФВ не върна валиден player id") from exc

    number = remote.get("number")
    try:
        number_i = int(number) if number is not None else None
    except Exception:
        number_i = None
    photo_id = str(remote.get("photoId") or "").strip() or None

    athlete.egn = egn_val
    athlete.first_name = first_name
    athlete.middle_name = middle_name
    athlete.last_name = last_name
    athlete.athlete_name = compose_athlete_name(first_name, middle_name, last_name)
    athlete.nationality = nationality
    apply_birth_date_from_egn(athlete)
    athlete.bvf_player_id = pid
    athlete.bvf_player_number = number_i
    athlete.bvf_photo_id = photo_id
    athlete.bvf_synced_at = datetime.utcnow()
    from app.services.sek_athlete_readiness import clear_sek_task

    clear_sek_task(athlete)
    db.commit()
    db.refresh(athlete)

    try:
        from app.services.athlete_photo import save_athlete_photo

        save_athlete_photo(athlete.id, photo_bytes)
    except Exception:
        pass

    return {
        "athlete_id": athlete.id,
        "bvf_player_id": athlete.bvf_player_id,
        "bvf_player_number": athlete.bvf_player_number,
        "bvf_photo_id": athlete.bvf_photo_id,
        "athlete_name": athlete.athlete_name,
        "first_coach_id": int(resolved_coach_id),
        "first_coach_name": resolve_first_coach_label(coach, club),
        "has_photo": True,
    }


class SekTaskRequestIn(BaseModel):
    club_id: Optional[int] = None


@router.get("/athletes/sek-board")
def sek_athletes_board(
    club_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Локални състезатели на клуба: в СЕК vs липсват + готовност за link/create."""
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, club_id)
    from app.services.club_membership_consent import apply_athlete_identity_from_consent
    from app.services.sek_athlete_readiness import compute_sek_board_row, refresh_open_sek_task

    athletes = (
        db.query(Athlete)
        .filter(Athlete.club_id == club.id, Athlete.is_active.is_(True))
        .order_by(Athlete.athlete_name.asc())
        .all()
    )
    coach_ids = {int(a.coach_id) for a in athletes if a.coach_id}
    coaches = {}
    if coach_ids:
        for u in db.query(User).filter(User.id.in_(coach_ids)).all():
            coaches[int(u.id)] = u.name

    healed_any = False
    in_sek: list[dict] = []
    missing_sek: list[dict] = []
    for a in athletes:
        if apply_athlete_identity_from_consent(db, a):
            refresh_open_sek_task(a)
            healed_any = True
        row = compute_sek_board_row(a, coach_name=coaches.get(int(a.coach_id)) if a.coach_id else None)
        if row["in_sek"]:
            in_sek.append(row)
        else:
            missing_sek.append(row)
    if healed_any:
        db.commit()

    return {
        "club_id": club.id,
        "club_name": club.name,
        "bvf_club_id": club.bvf_club_id,
        "counts": {
            "total": len(athletes),
            "in_sek": len(in_sek),
            "missing_sek": len(missing_sek),
            "ready_create": sum(1 for r in missing_sek if r["can_create"]),
            "can_link": sum(1 for r in missing_sek if r["can_link"]),
            "open_tasks": sum(1 for r in missing_sek if r.get("sek_task_code")),
        },
        "in_sek": in_sek,
        "missing_sek": missing_sek,
    }


@router.post("/athletes/{athlete_id}/request-sek-task")
def request_sek_task_for_athlete(
    athlete_id: int,
    payload: SekTaskRequestIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Съобщава на груповия треньор, че липсва снимка/данни за СЕК."""
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id if payload else None)
    athlete = db.query(Athlete).filter(Athlete.id == int(athlete_id)).first()
    if not athlete or int(athlete.club_id or 0) != int(club.id):
        raise HTTPException(status_code=404, detail="Състезателят не е намерен в клуба")
    if athlete.bvf_player_id:
        raise HTTPException(status_code=409, detail="Състезателят вече е в СЕК")

    from app.services.sek_athlete_readiness import build_task_from_missing, set_sek_task

    code, detail = build_task_from_missing(athlete)
    if not code:
        raise HTTPException(
            status_code=409,
            detail="Няма липси за СЕК — задача към треньора не е нужна.",
        )
    set_sek_task(athlete, code=code, detail=detail, by_user_id=current_user.id)
    db.commit()
    db.refresh(athlete)

    coach = db.query(User).filter(User.id == athlete.coach_id).first()
    return {
        "ok": True,
        "athlete_id": athlete.id,
        "athlete_name": athlete.athlete_name,
        "coach_id": athlete.coach_id,
        "coach_name": coach.name if coach else None,
        "sek_task_code": athlete.sek_task_code,
        "sek_task_detail": athlete.sek_task_detail,
        "sek_task_at": athlete.sek_task_at,
    }


@router.post("/athletes/{athlete_id}/clear-sek-task")
def clear_sek_task_for_athlete(
    athlete_id: int,
    payload: SekTaskRequestIn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id if payload else None)
    athlete = db.query(Athlete).filter(Athlete.id == int(athlete_id)).first()
    if not athlete or int(athlete.club_id or 0) != int(club.id):
        raise HTTPException(status_code=404, detail="Състезателят не е намерен в клуба")
    from app.services.sek_athlete_readiness import clear_sek_task

    clear_sek_task(athlete)
    db.commit()
    return {"ok": True, "athlete_id": athlete.id}



class ClubProfileUpdateIn(BaseModel):
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    website_url: Optional[str] = None
    facebook_page_url: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    club_id: Optional[int] = None


class CoachPhoneUpdateIn(BaseModel):
    phone: Optional[str] = None
    phone_visible_to_parents: Optional[bool] = None
    club_id: Optional[int] = None


class ClubProfileSyncIn(BaseModel):
    bvf_token: Optional[str] = None
    club_id: Optional[int] = None


@router.get("/club-profile")
def get_club_profile(
    club_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.coach, UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Профил на клуба — отключен след връзка със СЕК."""
    from app.services.club_profile_sync import club_profile_unlocked, serialize_club_profile

    if current_user.role == UserRole.coach:
        if not current_user.club_id:
            raise HTTPException(status_code=422, detail="Няма клуб")
        club = db.query(Club).filter(Club.id == int(current_user.club_id)).first()
        if not club:
            raise HTTPException(status_code=404, detail="Клубът не е намерен")
    else:
        _ensure_head_with_club(current_user)
        club = _club_for_user(db, current_user, club_id)

    coaches = (
        db.query(User)
        .filter(
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )
    # Обикновен треньор вижда телефоните; редакцията е за главен
    can_edit = current_user.role in (
        UserRole.club_head_coach,
        UserRole.platform_admin,
        UserRole.federation_admin,
    )
    payload = serialize_club_profile(club, coaches=coaches)
    payload["can_edit"] = can_edit and club_profile_unlocked(club)
    payload["can_sync"] = can_edit and club_profile_unlocked(club)
    return payload


@router.post("/club-profile/sync")
def sync_club_profile_from_sek(
    payload: ClubProfileSyncIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    """Изтегля профила на клуба и телефоните на треньорите от СЕК."""
    from app.services.bvf_auth import resolve_club_bvf_token
    from app.services.club_profile_sync import (
        apply_bvf_club_remote_to_local,
        club_profile_unlocked,
        serialize_club_profile,
        sync_coach_phones_from_bvf,
    )

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club_profile_unlocked(club):
        raise HTTPException(
            status_code=423,
            detail="Профилът на клуба е заключен. Първо свържи клуба със СЕК в Администрация БФВ.",
        )
    token = resolve_club_bvf_token(club, payload.bvf_token)
    _assert_cred_matches_club(token, club)
    remote = _bvf_get(f"/api/clubs/{int(club.bvf_club_id)}", token)
    if not isinstance(remote, dict):
        raise HTTPException(status_code=502, detail="БФВ не върна профил на клуб")
    club_changes = apply_bvf_club_remote_to_local(club, remote)
    coach_stats = {"coaches_matched": 0, "phones_updated": 0, "local_coaches": 0}
    try:
        coaches_remote = _bvf_get(f"/api/clubs/{int(club.bvf_club_id)}/coaches", token)
        if isinstance(coaches_remote, list):
            coach_stats = sync_coach_phones_from_bvf(db, club, coaches_remote)
    except Exception:
        pass
    db.commit()
    db.refresh(club)
    coaches = (
        db.query(User)
        .filter(
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )
    out = serialize_club_profile(club, coaches=coaches)
    out["can_edit"] = True
    out["can_sync"] = True
    out["sync"] = {**club_changes, **coach_stats}
    return out


@router.patch("/club-profile")
def update_club_profile_local(
    payload: ClubProfileUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    from app.services.club_profile_sync import club_profile_unlocked, serialize_club_profile

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club_profile_unlocked(club):
        raise HTTPException(status_code=423, detail="Профилът е заключен до връзка със СЕК.")
    data = payload.model_dump(exclude_unset=True)
    data.pop("club_id", None)
    for key, val in data.items():
        if key == "facebook_page_url":
            cleaned = str(val or "").strip() or None
            if cleaned:
                low = cleaned.lower()
                if not cleaned.startswith("http"):
                    cleaned = f"https://{cleaned}"
                    low = cleaned.lower()
                if "facebook.com" not in low and "fb.com" not in low:
                    raise HTTPException(status_code=422, detail="Невалиден Facebook линк")
                cleaned = cleaned[:500]
            club.facebook_page_url = cleaned
            continue
        if val is None:
            continue
        cleaned = str(val).strip() or None
        if key == "website_url" and cleaned and not cleaned.startswith("http"):
            cleaned = f"https://{cleaned}"
        setattr(club, key, cleaned)
    db.commit()
    db.refresh(club)
    coaches = (
        db.query(User)
        .filter(
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .order_by(User.name.asc())
        .all()
    )
    out = serialize_club_profile(club, coaches=coaches)
    out["can_edit"] = True
    out["can_sync"] = True
    return out


@router.patch("/club-profile/coaches/{coach_id}")
def update_coach_phone_in_club_profile(
    coach_id: int,
    payload: CoachPhoneUpdateIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_role(UserRole.club_head_coach, UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    from app.services.club_profile_sync import club_profile_unlocked

    _ensure_head_with_club(current_user)
    club = _club_for_user(db, current_user, payload.club_id)
    if not club_profile_unlocked(club):
        raise HTTPException(status_code=423, detail="Профилът е заключен до връзка със СЕК.")
    coach = (
        db.query(User)
        .filter(
            User.id == int(coach_id),
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not coach:
        raise HTTPException(status_code=404, detail="Треньорът не е намерен в клуба")
    if payload.phone is not None:
        coach.phone = (payload.phone or "").strip() or None
    if payload.phone_visible_to_parents is not None:
        coach.phone_visible_to_parents = bool(payload.phone_visible_to_parents)
    db.commit()
    db.refresh(coach)
    return {
        "id": coach.id,
        "name": coach.name,
        "phone": coach.phone,
        "phone_visible_to_parents": bool(coach.phone_visible_to_parents),
    }
