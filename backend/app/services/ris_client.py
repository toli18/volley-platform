"""Anonymous read client for RIS (ris.bgvolley.dev) — BVF competition public API."""

from __future__ import annotations

import threading
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException

RIS_API_BASE = "https://ris.bgvolley.dev"
RIS_TIMEOUT = 25.0

_cache_lock = threading.Lock()
_cache: dict[str, tuple[float, Any]] = {}


class RisApiError(Exception):
    def __init__(self, status: int, message: str, *, details: Any = None):
        self.status = status
        self.message = message
        self.details = details
        super().__init__(message)


def _cache_get(key: str) -> Any | None:
    now = time.monotonic()
    with _cache_lock:
        row = _cache.get(key)
        if not row:
            return None
        expires, value = row
        if expires < now:
            _cache.pop(key, None)
            return None
        return value


def _cache_set(key: str, value: Any, ttl_sec: float) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic() + ttl_sec, value)


def clear_ris_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _unpack(payload: Any) -> Any:
    if not isinstance(payload, dict):
        raise RisApiError(502, "Невалиден отговор от RIS")
    err = payload.get("error")
    if err:
        status = int(err.get("status") or 502)
        msg = str(err.get("message") or "RIS грешка")
        raise RisApiError(status, msg, details=err.get("details"))
    return payload.get("data")


def ris_get(
    path: str,
    *,
    params: dict[str, Any] | None = None,
    cache_ttl: float = 120.0,
) -> Any:
    """GET /api/public/... and return unwrapped `data`."""
    clean = path if path.startswith("/") else f"/{path}"
    if not clean.startswith("/api/public"):
        clean = f"/api/public{clean}"

    q = {k: v for k, v in (params or {}).items() if v is not None and v != ""}
    cache_key = f"{clean}?{sorted(q.items())}"
    if cache_ttl > 0:
        hit = _cache_get(cache_key)
        if hit is not None:
            return hit

    url = f"{RIS_API_BASE}{clean}"
    try:
        with httpx.Client(timeout=RIS_TIMEOUT) as client:
            resp = client.get(url, params=q)
    except httpx.HTTPError as exc:
        raise RisApiError(502, f"RIS недостъпен: {exc}") from exc

    try:
        payload = resp.json()
    except Exception as exc:
        raise RisApiError(502, f"RIS върна не-JSON (HTTP {resp.status_code})") from exc

    if resp.status_code >= 400 and isinstance(payload, dict) and payload.get("error"):
        data = _unpack(payload)  # raises
        return data

    if resp.status_code >= 400:
        raise RisApiError(resp.status_code, f"RIS HTTP {resp.status_code}")

    data = _unpack(payload)
    if cache_ttl > 0:
        _cache_set(cache_key, data, cache_ttl)
    return data


def list_seasons() -> list[dict]:
    data = ris_get("/api/public/seasons", cache_ttl=600)
    return data if isinstance(data, list) else []


def list_age_groups() -> list[dict]:
    data = ris_get("/api/public/age-groups", cache_ttl=600)
    return data if isinstance(data, list) else []


def list_regions() -> list[dict]:
    data = ris_get("/api/public/regions", cache_ttl=600)
    return data if isinstance(data, list) else []


def list_clubs(season_year: int) -> list[dict]:
    data = ris_get("/api/public/clubs", params={"season": int(season_year)}, cache_ttl=300)
    return data if isinstance(data, list) else []


def list_championships(season_year: int, *, age_group: int | None = None) -> list[dict]:
    params: dict[str, Any] = {"season": int(season_year)}
    if age_group is not None:
        params["ageGroup"] = int(age_group)
    data = ris_get("/api/public/championships", params=params, cache_ttl=180)
    return data if isinstance(data, list) else []


def get_championship(championship_id: int) -> dict:
    data = ris_get(f"/api/public/championships/{int(championship_id)}", cache_ttl=90)
    return data if isinstance(data, dict) else {}


def list_games(
    season_year: int,
    *,
    club_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    age_group: int | None = None,
    region: int | None = None,
    championship: int | None = None,
    page: int = 1,
    page_size: int = 50,
    sort: str = "asc",
) -> list[dict]:
    """Fetch all pages of games matching filters (capped)."""
    page_size = max(1, min(int(page_size), 100))
    out: list[dict] = []
    cur = max(1, int(page))
    max_pages = 20
    for _ in range(max_pages):
        params: dict[str, Any] = {
            "season": int(season_year),
            "page": cur,
            "pageSize": page_size,
            "sort": sort if sort in ("asc", "desc") else "asc",
        }
        if club_id is not None:
            params["club"] = int(club_id)
        if date_from:
            params["from"] = date_from
        if date_to:
            params["to"] = date_to
        if age_group is not None:
            params["ageGroup"] = int(age_group)
        if region is not None:
            params["region"] = int(region)
        if championship is not None:
            params["championship"] = int(championship)

        # Games list uses envelope meta.pagination — fetch raw for pagination.
        clean = "/api/public/games"
        q = {k: v for k, v in params.items() if v is not None and v != ""}
        cache_key = f"{clean}?{sorted(q.items())}"
        cached = _cache_get(cache_key)
        if cached is not None:
            batch, page_count = cached
        else:
            url = f"{RIS_API_BASE}{clean}"
            try:
                with httpx.Client(timeout=RIS_TIMEOUT) as client:
                    resp = client.get(url, params=q)
            except httpx.HTTPError as exc:
                raise RisApiError(502, f"RIS недостъпен: {exc}") from exc
            try:
                payload = resp.json()
            except Exception as exc:
                raise RisApiError(502, f"RIS върна не-JSON (HTTP {resp.status_code})") from exc
            if resp.status_code >= 400:
                _unpack(payload)
                raise RisApiError(resp.status_code, f"RIS HTTP {resp.status_code}")
            batch = _unpack(payload)
            if not isinstance(batch, list):
                batch = []
            meta = payload.get("meta") if isinstance(payload, dict) else {}
            pagination = (meta or {}).get("pagination") or {}
            page_count = int(pagination.get("pageCount") or 1)
            _cache_set(cache_key, (batch, page_count), 90.0)

        out.extend(batch)
        if cur >= page_count or not batch:
            break
        cur += 1
        if page > 1:
            # Caller asked for a single page.
            break
    return out


def get_game(game_id: int) -> dict:
    data = ris_get(f"/api/public/games/{int(game_id)}", cache_ttl=30)
    return data if isinstance(data, dict) else {}


def next_game_day(season_year: int) -> dict:
    data = ris_get("/api/public/games/next-day", params={"season": int(season_year)}, cache_ttl=60)
    return data if isinstance(data, dict) else {}


def current_season_year(seasons: list[dict] | None = None) -> int:
    rows = seasons if seasons is not None else list_seasons()
    if not rows:
        from datetime import date

        return date.today().year
    # Newest first per docs.
    return int(rows[0].get("year") or rows[0].get("id") or 2026)


def http_error_from_ris(exc: RisApiError) -> HTTPException:
    status = 502 if exc.status >= 500 else (400 if exc.status == 400 else 502)
    if exc.status == 404:
        status = 404
    return HTTPException(status_code=status, detail=exc.message)
