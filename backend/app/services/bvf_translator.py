"""Превод на методично съдържание към български (OpenAI или Google fallback)."""

from __future__ import annotations

import os
import re
import time
from typing import Optional

import httpx

CHUNK_SIZE = 3500
VOLLEYBALL_PROMPT = (
    "Преведи на български следния волейболен текст. "
    "Използвай стандартна българска терминология (сервис, прием, разпределение, атака, блок, ротация). "
    "Запази markdown, списъци и номерация. Върни САМО преведения текст, без коментари.\n\n"
)


def _split_chunks(text: str, max_len: int = CHUNK_SIZE) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= max_len:
        return [text]
    parts: list[str] = []
    buf = ""
    for para in re.split(r"\n{2,}", text):
        if len(buf) + len(para) + 2 > max_len and buf:
            parts.append(buf.strip())
            buf = para
        else:
            buf = f"{buf}\n\n{para}".strip() if buf else para
    if buf.strip():
        parts.append(buf.strip())
    if not parts:
        parts = [text[i : i + max_len] for i in range(0, len(text), max_len)]
    return parts


def _translate_openai(text: str, source_lang: str = "auto") -> Optional[str]:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key:
        return None
    model = os.getenv("OPENAI_TRANSLATE_MODEL", "gpt-4o-mini")
    lang_note = f"Оригинален език: {source_lang}.\n\n" if source_lang != "auto" else ""
    payload = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": "Ти си професионален преводач по волейбол. Превеждаш точно на български.",
            },
            {"role": "user", "content": VOLLEYBALL_PROMPT + lang_note + text[:12000]},
        ],
        "temperature": 0.2,
    }
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except Exception:
        return None


def _translate_google(text: str, source_lang: str = "auto") -> str:
    from deep_translator import GoogleTranslator

    src = source_lang if source_lang in ("en", "it", "auto") else "auto"
    translator = GoogleTranslator(source=src, target="bg")
    last_err: Exception | None = None
    for attempt in range(4):
        try:
            return translator.translate(text[:4999])
        except Exception as exc:
            last_err = exc
            time.sleep(1.5 * (attempt + 1))
    raise last_err or RuntimeError("translate failed")


def translate_text(text: str, source_lang: str = "auto", pause_sec: float = 0.35) -> str:
    """Превежда дълъг текст на части."""
    chunks = _split_chunks(text)
    if not chunks:
        return ""
    out: list[str] = []
    for i, chunk in enumerate(chunks):
        translated = _translate_openai(chunk, source_lang)
        if not translated:
            translated = _translate_google(chunk, source_lang)
        out.append(translated)
        if i < len(chunks) - 1 and pause_sec:
            time.sleep(pause_sec)
    return "\n\n".join(out)


def translate_title(title: str, source_lang: str = "en") -> str:
    short = (title or "").strip()[:500]
    if not short:
        return title
    t = _translate_openai(short, source_lang)
    if t:
        return t[:512]
    return _translate_google(short, source_lang)[:512]
