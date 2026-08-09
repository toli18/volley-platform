"""Local cache of BVF athlete portrait — not the federation file store."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import httpx

PHOTO_DIR = Path(__file__).resolve().parents[1] / "data" / "athlete_photos"
BVF_API_BASE = "https://db.bvf.bg"
BVF_TIMEOUT = 45.0


def photo_path(athlete_id: int) -> Path:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    return PHOTO_DIR / f"{int(athlete_id)}.jpg"


def has_cached_photo(athlete_id: int) -> bool:
    p = photo_path(athlete_id)
    return p.is_file() and p.stat().st_size > 0


def cached_photo_athlete_ids(athlete_ids: list[int] | set[int] | None = None) -> set[int]:
    """Еднократно сканиране на кеша вместо N× is_file/stat/mkdir."""
    try:
        PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        return set()
    wanted = {int(x) for x in athlete_ids} if athlete_ids is not None else None
    found: set[int] = set()
    try:
        for path in PHOTO_DIR.glob("*.jpg"):
            try:
                aid = int(path.stem)
            except ValueError:
                continue
            if wanted is not None and aid not in wanted:
                continue
            try:
                if path.is_file() and path.stat().st_size > 0:
                    found.add(aid)
            except OSError:
                continue
    except OSError:
        return set()
    return found


def save_athlete_photo(athlete_id: int, content: bytes) -> Path:
    if not content:
        raise ValueError("empty photo")
    path = photo_path(athlete_id)
    path.write_bytes(content)
    return path


def read_athlete_photo(athlete_id: int) -> bytes | None:
    path = photo_path(athlete_id)
    if not path.is_file():
        return None
    data = path.read_bytes()
    return data or None


def _bvf_headers(token: str, *, for_file: bool = False) -> dict:
    from app.services.bvf_auth import bvf_auth_headers

    return bvf_auth_headers(token, accept="*/*" if for_file else "application/json")


def fetch_bvf_photo_bytes(token: str, photo_id: str) -> bytes | None:
    pid = (photo_id or "").strip()
    if not pid:
        return None
    url = f"{BVF_API_BASE}/api/files/{pid}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT, follow_redirects=True) as client:
            res = client.get(url, headers=_bvf_headers(token, for_file=True))
    except httpx.HTTPError:
        return None
    if res.status_code >= 400 or not res.content:
        return None
    # Отхвърли JSON грешки, маскирани като 200
    ctype = (res.headers.get("content-type") or "").lower()
    if "application/json" in ctype and res.content[:1] in (b"{", b"["):
        return None
    return res.content


def fetch_bvf_photo_bytes_detailed(token: str, photo_id: str) -> tuple[bytes | None, str]:
    """Като fetch_bvf_photo_bytes, но с причина при неуспех (за sync API)."""
    pid = (photo_id or "").strip()
    if not pid:
        return None, "Липсва photoId"
    url = f"{BVF_API_BASE}/api/files/{pid}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT, follow_redirects=True) as client:
            res = client.get(url, headers=_bvf_headers(token, for_file=True))
    except httpx.HTTPError as exc:
        return None, f"Мрежова грешка към БФВ files: {exc}"
    if res.status_code == 401:
        return None, "БФВ token е невалиден при изтегляне на файл"
    if res.status_code == 403:
        return None, (
            "Клубният акаунт в БФВ няма право да чете файлове (/api/files). "
            "Качи снимката локално или изчакай API ключ с право за четене на файлове."
        )
    if res.status_code == 404:
        return None, "Файлът не е намерен в БФВ (изтрита снимка?)"
    if res.status_code >= 400:
        return None, f"БФВ files грешка {res.status_code}: {(res.text or '')[:160]}"
    if not res.content:
        return None, "БФВ върна празен файл"
    ctype = (res.headers.get("content-type") or "").lower()
    if "application/json" in ctype and res.content[:1] in (b"{", b"["):
        return None, f"БФВ върна JSON вместо снимка: {res.text[:160]}"
    return res.content, "ok"


def resolve_bvf_photo_id(token: str, athlete) -> Optional[str]:
    existing = (getattr(athlete, "bvf_photo_id", None) or "").strip()
    if existing:
        return existing
    player_id = getattr(athlete, "bvf_player_id", None)
    if not player_id:
        return None
    url = f"{BVF_API_BASE}/api/players/{int(player_id)}"
    try:
        with httpx.Client(timeout=BVF_TIMEOUT, follow_redirects=True) as client:
            res = client.get(url, headers=_bvf_headers(token))
    except httpx.HTTPError:
        return None
    if res.status_code >= 400:
        return None
    try:
        data = res.json()
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    return str(data.get("photoId") or "").strip() or None


def ensure_athlete_photo_from_bvf(athlete, club) -> bytes | None:
    """
    Връща локална снимка; ако липсва и спортистът е свързан с БФВ —
    дърпва я през постоянната клубна връзка и я кешира.
    """
    cached = read_athlete_photo(athlete.id)
    if cached:
        return cached
    if not club or not getattr(club, "bvf_club_id", None):
        return None
    if not getattr(athlete, "bvf_player_id", None) and not (getattr(athlete, "bvf_photo_id", None) or "").strip():
        return None

    from app.services.bvf_auth import club_has_bvf_auth, resolve_club_bvf_token

    if not club_has_bvf_auth(club):
        return None
    try:
        token = resolve_club_bvf_token(club, None)
    except Exception:
        return None

    photo_id = resolve_bvf_photo_id(token, athlete)
    if not photo_id:
        return None
    content = fetch_bvf_photo_bytes(token, photo_id)
    if not content:
        return None
    save_athlete_photo(athlete.id, content)
    if (getattr(athlete, "bvf_photo_id", None) or "").strip() != photo_id:
        athlete.bvf_photo_id = photo_id
    return content
