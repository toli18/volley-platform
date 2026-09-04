"""Треньорски AI помощник: отговори + насоки за генериране на тренировка."""

from __future__ import annotations

import re
from typing import Any, Optional

from app.national_method.coach_assistant_method import (
    assistant_system_context,
    load_coach_assistant_method,
    qa_cards,
)
from app.services.gemini_client import gemini_available, generate_text

_GENERATE_HINTS = (
    "генерирай",
    "направи тренировка",
    "създай тренировка",
    "план за днес",
    "тренировка за",
    "какво да тренираме",
    "какво да тренираме днес",
)


def _wants_generate(message: str) -> bool:
    low = (message or "").lower()
    return any(h in low for h in _GENERATE_HINTS)


def _fallback_answer(message: str, age_band: str | None) -> str:
    bundle = load_coach_assistant_method()
    low = (message or "").lower()
    for card in qa_cards():
        q = str(card.get("q") or "").lower()
        keys = [w for w in re.split(r"\W+", q) if len(w) > 3]
        if keys and sum(1 for k in keys if k in low) >= max(1, len(keys) // 3):
            return str(card.get("a") or "")

    if "мач" in low and ("утре" in low or "днес" in low):
        return (
            "Ако утре имате мач: днес направете активиране — къса, лека тренировка "
            "с познати елементи, без нови умения. Целта е свежест, не обем."
        )
    if "отскок" in low or "скач" in low:
        return (
            "При проблем с отскока първо проверете техниката: разбег, тайминг, "
            "точка на удар и кацане. Силата е само една възможна причина. "
            "После вижте тестовете за скок и добавете кратък физически блок."
        )
    if "зон" in low:
        return (
            "За зоните: нарисувайте полето, дайте на всеки ясна зона на отговорност "
            "и зона на конфликт (границата между двама). Тренирайте с правило "
            "„кой взима топката по средата“ и кратки ключови думи. "
            "Повторете в игра 3–4 посрещащи с асистенция при къса топка."
        )

    ctx = assistant_system_context(age_band)
    tips = (ctx.get("principles") or [])[:3]
    base = (
        "Мога да помогна с тренировки, годишна програма, посрещане, начален удар, "
        "отскок, зони и подготовка преди мач. "
        "Питай конкретно или кажи „генерирай тренировка“."
    )
    if tips:
        return base + "\n\nАкцент: " + " ".join(tips[:2])
    return base


def _system_prompt(age_band: str | None, extra_context: str) -> str:
    ctx = assistant_system_context(age_band)
    glossary = ctx.get("glossary") or {}
    gloss_lines = "\n".join(f"- {k}: {v}" for k, v in list(glossary.items())[:16])
    principles = "\n".join(f"- {p}" for p in (ctx.get("principles") or [])[:18])
    age_lines = "\n".join(f"- {p}" for p in (ctx.get("age_emphasis") or [])[:6])
    return f"""Ти си треньорски помощник в българска волейболна платформа.
Говориш само на ясен български. Кратки, практически отговори (до 8–12 изречения).
Годишната програма БФВ е водеща. Не измисляй медицински диагнози.
Използвай термините: посрещане, сервиращи, начален удар, разпределител, облекчена тренировка (не казвай „тапер“).

Речник:
{gloss_lines}

Принципи:
{principles}

Акцент за възрастта:
{age_lines}

Контекст от платформата:
{extra_context or "няма допълнителен контекст"}

Ако треньорът иска тренировка, обясни какво предлагаш и в края напиши на отделен ред:
Действие: генерирай_тренировка
"""


def build_reply(
    message: str,
    *,
    age_band: str | None = None,
    context: Optional[dict[str, Any]] = None,
    history: Optional[list[dict[str, str]]] = None,
) -> dict[str, Any]:
    message = (message or "").strip()
    if not message:
        return {
            "reply": "Напиши въпрос — например за мач утре, отскок или зони.",
            "wantsGenerate": False,
            "provider": "local",
        }

    ctx = context or {}
    extra = []
    if age_band:
        extra.append(f"Възрастова група: {age_band}")
    if ctx.get("teamName"):
        extra.append(f"Отбор: {ctx['teamName']}")
    if ctx.get("date"):
        extra.append(f"Дата: {ctx['date']}")
    if ctx.get("daysUntilMatch") is not None:
        extra.append(f"Дни до мач: {ctx['daysUntilMatch']}")
    if ctx.get("programTheme"):
        extra.append(f"Тема по програма: {ctx['programTheme']}")
    extra_context = "\n".join(extra)

    history_txt = ""
    for turn in (history or [])[-6:]:
        role = "Треньор" if turn.get("role") == "user" else "Помощник"
        history_txt += f"{role}: {turn.get('content', '')}\n"

    prompt = f"{history_txt}\nТреньор: {message}\nПомощник:"
    provider = "local"
    reply = ""

    if gemini_available():
        result = generate_text(
            prompt,
            system=_system_prompt(age_band, extra_context),
            temperature=0.35,
        )
        if result.get("ok") and result.get("text"):
            reply = str(result["text"]).strip()
            provider = f"gemini:{result.get('model')}"
        else:
            reply = _fallback_answer(message, age_band)
            provider = f"local_fallback:{result.get('error')}"
    else:
        reply = _fallback_answer(message, age_band)

    wants = _wants_generate(message) or ("генерирай_тренировка" in reply.lower())
    # изчисти служебния маркер от видимия текст
    clean = re.sub(
        r"(?im)^\s*Действие:\s*генерирай_тренировка\s*$",
        "",
        reply,
    ).strip()

    return {
        "reply": clean or reply,
        "wantsGenerate": bool(wants),
        "provider": provider,
        "geminiAvailable": gemini_available(),
    }
