"""Минимален клиент за Google Gemini (безплатен API)."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

_ENV_CANDIDATES = (
    Path(__file__).resolve().parents[1] / ".env.gemini",  # backend/app/.env.gemini
    Path(__file__).resolve().parents[2] / ".env.gemini",  # backend/.env.gemini
    Path(__file__).resolve().parents[3] / ".env.gemini",  # repo root
)


def _load_env_file() -> dict[str, str]:
    out: dict[str, str] = {}
    for path in _ENV_CANDIDATES:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
        break
    return out


def gemini_config() -> tuple[Optional[str], str]:
    file_env = _load_env_file()
    key = (
        os.getenv("GEMINI_API_KEY")
        or os.getenv("GOOGLE_API_KEY")
        or file_env.get("GEMINI_API_KEY")
        or file_env.get("GOOGLE_API_KEY")
    )
    model = (
        os.getenv("GEMINI_MODEL")
        or file_env.get("GEMINI_MODEL")
        or "gemini-3.6-flash"
    )
    return (key.strip() if key else None), model.strip()


def gemini_available() -> bool:
    key, _ = gemini_config()
    return bool(key)


def generate_text(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.4,
    timeout_s: float = 60.0,
) -> dict[str, Any]:
    """Връща {ok, text, model, error?}."""
    key, model = gemini_config()
    if not key:
        return {"ok": False, "text": "", "model": model, "error": "missing_api_key"}

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    contents: list[dict[str, Any]] = []
    if system:
        # systemInstruction е поддържан от generateContent
        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }
    else:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature},
        }

    try:
        with httpx.Client(timeout=timeout_s) as client:
            resp = client.post(url, params={"key": key}, json=payload)
        if resp.status_code >= 400:
            logger.warning("gemini_http_%s: %s", resp.status_code, resp.text[:300])
            return {
                "ok": False,
                "text": "",
                "model": model,
                "error": f"http_{resp.status_code}",
                "detail": resp.text[:500],
            }
        data = resp.json()
        parts = (
            ((data.get("candidates") or [{}])[0].get("content") or {}).get("parts")
            or []
        )
        text = "".join(str(p.get("text") or "") for p in parts).strip()
        if not text:
            return {"ok": False, "text": "", "model": model, "error": "empty_response"}
        return {"ok": True, "text": text, "model": model}
    except Exception as exc:  # noqa: BLE001
        logger.exception("gemini_call_failed")
        return {"ok": False, "text": "", "model": model, "error": str(exc)}
