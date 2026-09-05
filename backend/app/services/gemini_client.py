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

# Ако GEMINI_MODEL е грешен/остарял — опитваме тези по ред
_MODEL_FALLBACKS = (
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-1.5-flash",
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
        or "gemini-2.5-flash"
    )
    return (key.strip() if key else None), model.strip()


def gemini_available() -> bool:
    key, _ = gemini_config()
    return bool(key)


def _model_candidates(primary: str) -> list[str]:
    out: list[str] = []
    for m in (primary, *_MODEL_FALLBACKS):
        if m and m not in out:
            out.append(m)
    return out


def _call_gemini(
    *,
    key: str,
    model: str,
    prompt: str,
    system: str | None,
    temperature: float,
    timeout_s: float,
) -> dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    if system:
        payload: dict[str, Any] = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": 900,
            },
        }
    else:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": 900,
            },
        }

    with httpx.Client(timeout=timeout_s) as client:
        resp = client.post(url, params={"key": key}, json=payload)
    if resp.status_code >= 400:
        logger.warning("gemini_http_%s model=%s: %s", resp.status_code, model, resp.text[:300])
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


def generate_text(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.4,
    timeout_s: float = 60.0,
) -> dict[str, Any]:
    """Връща {ok, text, model, error?}."""
    key, primary = gemini_config()
    if not key:
        return {"ok": False, "text": "", "model": primary, "error": "missing_api_key"}

    last: dict[str, Any] = {
        "ok": False,
        "text": "",
        "model": primary,
        "error": "no_attempt",
    }
    for model in _model_candidates(primary):
        try:
            last = _call_gemini(
                key=key,
                model=model,
                prompt=prompt,
                system=system,
                temperature=temperature,
                timeout_s=timeout_s,
            )
            if last.get("ok"):
                if model != primary:
                    logger.info("gemini_fallback_ok primary=%s used=%s", primary, model)
                return last
            # 404/400 model not found → try next; other errors also try next once
            err = str(last.get("error") or "")
            if err.startswith("http_404") or err.startswith("http_400") or err == "empty_response":
                continue
            # rate limit / auth — don't spin forever
            if err.startswith("http_429") or err.startswith("http_403"):
                return last
        except Exception as exc:  # noqa: BLE001
            logger.exception("gemini_call_failed model=%s", model)
            last = {"ok": False, "text": "", "model": model, "error": str(exc)}
            continue
    return last
