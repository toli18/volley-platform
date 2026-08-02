"""BVF club authentication — ApiKey (preferred) or username/password → permanent club link."""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
from typing import Any, Optional

import httpx
from fastapi import HTTPException

from app.settings import settings

BVF_API_BASE = "https://db.bvf.bg"
BVF_TIMEOUT = 45.0


def _enc_key() -> bytes:
    return hashlib.sha256(f"{settings.jwt_secret}:bvf-club-cred".encode("utf-8")).digest()


def encrypt_secret(plain: str) -> str:
    raw = (plain or "").encode("utf-8")
    if not raw:
        raise ValueError("empty secret")
    key = _enc_key()
    iv = os.urandom(16)
    out = bytearray()
    block = b""
    while len(out) < len(raw):
        block = hashlib.sha256(key + iv + block).digest()
        for b in block:
            if len(out) >= len(raw):
                break
            out.append(raw[len(out)] ^ b)
    mac = hmac.new(key, iv + bytes(out), hashlib.sha256).digest()[:16]
    return base64.urlsafe_b64encode(iv + mac + bytes(out)).decode("ascii")


def decrypt_secret(token: str) -> str:
    try:
        blob = base64.urlsafe_b64decode((token or "").encode("ascii"))
        iv, mac, data = blob[:16], blob[16:32], blob[32:]
        key = _enc_key()
        expect = hmac.new(key, iv + data, hashlib.sha256).digest()[:16]
        if not hmac.compare_digest(mac, expect):
            raise ValueError("bad mac")
        out = bytearray()
        block = b""
        while len(out) < len(data):
            block = hashlib.sha256(key + iv + block).digest()
            for b in block:
                if len(out) >= len(data):
                    break
                out.append(data[len(out)] ^ b)
        return bytes(out).decode("utf-8")
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Неуспешно четене на записаните БФВ credentials") from exc


def normalize_bvf_cred(raw: Optional[str]) -> str:
    cred = (raw or "").strip()
    if cred.lower().startswith("bearer "):
        cred = cred[7:].strip()
    return cred


def is_api_key(cred: Optional[str]) -> bool:
    return normalize_bvf_cred(cred).startswith("bfv_")


def api_key_display_prefix(key: str) -> str:
    k = normalize_bvf_cred(key)
    return k[:12] if len(k) >= 12 else k


def bvf_auth_headers(cred: str, *, accept: str = "application/json") -> dict[str, str]:
    """Headers for db.bvf.bg — ApiKey (`bfv_…`) or JWT Bearer."""
    c = normalize_bvf_cred(cred)
    if not c:
        raise HTTPException(status_code=422, detail="Липсва БФВ token / API ключ")
    headers = {"Accept": accept}
    if is_api_key(c):
        headers["X-Api-Key"] = c
    else:
        headers["Authorization"] = f"Bearer {c}"
    return headers


def bvf_login(username: str, password: str) -> dict[str, Any]:
    """POST /api/authentication/login → {token, ...}."""
    user = (username or "").strip()
    pwd = password or ""
    if not user or not pwd:
        raise HTTPException(status_code=422, detail="Въведи БФВ потребител и парола")
    try:
        with httpx.Client(timeout=BVF_TIMEOUT) as client:
            res = client.post(
                f"{BVF_API_BASE}/api/authentication/login",
                json={"userName": user, "password": pwd},
                headers={"Accept": "application/json"},
            )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"БФВ login недостъпен: {exc}") from exc

    if res.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="Грешни БФВ потребител или парола")
    if res.status_code >= 400:
        detail = (res.text or "").strip()[:300] or f"БФВ login грешка {res.status_code}"
        raise HTTPException(status_code=502, detail=detail)
    try:
        data = res.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="БФВ login върна невалиден JSON") from exc
    token = (data.get("token") or data.get("accessToken") or "").strip()
    if not token:
        raise HTTPException(status_code=502, detail="БФВ login няма token в отговора")
    data["_token"] = token
    return data


def club_has_credentials(club) -> bool:
    return bool(getattr(club, "bvf_username", None) and getattr(club, "bvf_password_enc", None))


def club_has_api_key(club) -> bool:
    return bool(getattr(club, "bvf_api_key_enc", None))


def club_has_bvf_auth(club) -> bool:
    """Постоянна автентикация: API ключ (предпочитано) или username/password."""
    return club_has_api_key(club) or club_has_credentials(club)


def resolve_club_bvf_token(club, optional_token: Optional[str] = None) -> str:
    """
    Връща credential за клуба (ApiKey `bfv_…` или JWT).
    1) optional_token ако е подаден
    2) записан API ключ
    3) login с криптираните username/password
    """
    raw = normalize_bvf_cred(optional_token)
    if raw:
        return raw
    if club_has_api_key(club):
        return decrypt_secret(club.bvf_api_key_enc)
    if not club_has_credentials(club):
        raise HTTPException(
            status_code=422,
            detail="Няма записан БФВ API ключ — запази ключ от Интеграции → API токени или свържи с потребител/парола.",
        )
    password = decrypt_secret(club.bvf_password_enc)
    data = bvf_login(club.bvf_username, password)
    return data["_token"]
