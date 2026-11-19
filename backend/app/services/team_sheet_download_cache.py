"""One-time tokens for team-sheet PDF downloads (mobile-friendly HTTPS links).

Uses the local filesystem so multiple uvicorn workers on the same host share state.
"""

from __future__ import annotations

import json
import secrets
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TeamSheetDownloadEntry:
    expires_at: float
    team_id: int
    user_id: int
    filename: str
    pdf_bytes: bytes


_LOCK = threading.Lock()
DEFAULT_TTL_SEC = 300
_CACHE_DIR = Path(tempfile.gettempdir()) / "vp_team_sheet_dl"


def _dir() -> Path:
    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    return _CACHE_DIR


def _meta_path(token: str) -> Path:
    return _dir() / f"{token}.json"


def _pdf_path(token: str) -> Path:
    return _dir() / f"{token}.pdf"


def _purge_expired(now: float | None = None) -> None:
    ts = time.time() if now is None else now
    try:
        root = _dir()
    except OSError:
        return
    for meta in root.glob("*.json"):
        try:
            data = json.loads(meta.read_text(encoding="utf-8"))
            if float(data.get("expires_at") or 0) <= ts:
                token = meta.stem
                meta.unlink(missing_ok=True)
                _pdf_path(token).unlink(missing_ok=True)
        except Exception:
            try:
                meta.unlink(missing_ok=True)
            except OSError:
                pass


def put_team_sheet_pdf(
    *,
    team_id: int,
    user_id: int,
    filename: str,
    pdf_bytes: bytes,
    ttl_sec: int = DEFAULT_TTL_SEC,
) -> str:
    token = secrets.token_urlsafe(24)
    now = time.time()
    expires_at = now + max(30, int(ttl_sec))
    safe_name = str(filename or f"timov-list-{team_id}.pdf")
    with _LOCK:
        _purge_expired(now)
        meta = {
            "expires_at": expires_at,
            "team_id": int(team_id),
            "user_id": int(user_id),
            "filename": safe_name,
        }
        _pdf_path(token).write_bytes(pdf_bytes)
        _meta_path(token).write_text(json.dumps(meta), encoding="utf-8")
    return token


def take_team_sheet_pdf(token: str, *, team_id: int) -> TeamSheetDownloadEntry | None:
    key = str(token or "").strip()
    if not key or "/" in key or "\\" in key or ".." in key:
        return None
    now = time.time()
    meta_file = _meta_path(key)
    pdf_file = _pdf_path(key)
    with _LOCK:
        _purge_expired(now)
        if not meta_file.exists() or not pdf_file.exists():
            return None
        try:
            data = json.loads(meta_file.read_text(encoding="utf-8"))
            pdf_bytes = pdf_file.read_bytes()
        except Exception:
            return None
        finally:
            meta_file.unlink(missing_ok=True)
            pdf_file.unlink(missing_ok=True)

    if int(data.get("team_id") or 0) != int(team_id):
        return None
    if float(data.get("expires_at") or 0) <= now:
        return None
    return TeamSheetDownloadEntry(
        expires_at=float(data["expires_at"]),
        team_id=int(data["team_id"]),
        user_id=int(data.get("user_id") or 0),
        filename=str(data.get("filename") or f"timov-list-{team_id}.pdf"),
        pdf_bytes=pdf_bytes,
    )
