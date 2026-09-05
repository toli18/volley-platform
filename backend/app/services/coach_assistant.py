"""Треньорски AI помощник: отговори + насоки за генериране на тренировка."""

from __future__ import annotations

import json
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
    "направи ми тренировка",
    "създай тренировка",
    "план за днес",
    "тренировка за",
    "какво да тренираме",
    "какво да тренираме днес",
)

_AGE_BAND_PATTERNS: tuple[tuple[str, str, int], ...] = (
    (r"\bu18\b|до\s*18|под\s*18|18\s*г", "U18", 18),
    (r"\bu17\b|17\s*г", "U17", 17),
    (r"\bu16\b|до\s*16|под\s*16|16\s*г", "U16", 16),
    (r"\bu15\b|15\s*г", "U15", 15),
    (r"\bu14\b|до\s*14|под\s*14|14\s*г", "U14", 14),
    (r"\bu13\b|до\s*13|под\s*13|13\s*г|12[-–]13", "U13", 13),
    (r"\bmini\b|8[-–]10|под\s*11", "mini", 11),
)

_FOCUS_RULES: tuple[tuple[tuple[str, ...], str, str | None, str | None], ...] = (
    (("отскок", "скач", "плиометр", "взривн", "скок"), "Координация", "Атака", "physical"),
    (("сил", "физическ", "кондиц", "кор ", "стабилиз"), "Координация", "Защита", "physical"),
    (("посрещ", "прием", "зон"), "Посрещане", "Разпределение", "serve_receive"),
    (("разпредел", "пас ", "подав"), "Разпределение", "Посрещане", "serve_receive"),
    (("атак", "напад", "шпиц"), "Атака", "Блок", "attack_block"),
    (("блок",), "Блок", "Защита", "attack_block"),
    (("сервис", "начален удар", "сервир"), "Сервис", "Посрещане", "serve_receive"),
    (("защит", "диг", "отбрана"), "Защита", "Преход", "defense_transition"),
    (("преход", "контра"), "Преход", "Атака", "defense_transition"),
)


def _wants_generate(message: str) -> bool:
    low = (message or "").lower()
    return any(h in low for h in _GENERATE_HINTS)


def extract_generate_params(
    message: str,
    *,
    age_band: str | None = None,
) -> dict[str, Any]:
    """Детерминирани параметри за генератора от текста на треньора."""
    low = (message or "").lower()
    params: dict[str, Any] = {
        "assistantOverride": True,
        # Без program/textbook линк — иначе BVF денът презаписва фокуса.
        "cycleId": None,
        "cycleWeek": None,
        "cycleDay": None,
        "textbookSlug": "",
        "sessionCode": "",
    }

    resolved_band = age_band
    resolved_age = None
    for pattern, band, age in _AGE_BAND_PATTERNS:
        if re.search(pattern, low):
            resolved_band = band
            resolved_age = age
            break
    if resolved_band:
        params["ageBand"] = resolved_band
    if resolved_age is not None:
        params["age"] = resolved_age

    for keys, main, secondary, orientation in _FOCUS_RULES:
        if any(k in low for k in keys):
            params["mainFocus"] = main
            if secondary:
                params["secondaryFocus"] = secondary
            if orientation:
                params["orientation"] = orientation
            break

    if "мач" in low and ("утре" in low or "днес" in low or "преди" in low):
        params["periodPhase"] = "taper"
        params["intensityTarget"] = "low"
        params["orientation"] = params.get("orientation") or "balanced"
    elif "подготов" in low:
        params["periodPhase"] = "prep"
    elif "състезател" in low:
        params["periodPhase"] = "inseason"

    if any(k in low for k in ("лек", "облекчен", "активиране", "възстанов")):
        params["intensityTarget"] = "low"
    elif any(k in low for k in ("тежк", "висок интенз", "натоварване")):
        params["intensityTarget"] = "high"

    title_bits = []
    if params.get("ageBand"):
        title_bits.append(params["ageBand"])
    if params.get("mainFocus"):
        title_bits.append(params["mainFocus"])
    if title_bits:
        params["trainingTitle"] = " · ".join(title_bits)

    return params


def _parse_params_from_reply(reply: str) -> dict[str, Any]:
    """Извлича JSON блок `ПАРАМЕТРИ: {...}` от отговора на модела."""
    if not reply:
        return {}
    m = re.search(r"ПАРАМЕТРИ\s*:\s*(\{.*?\})", reply, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return {}
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    allowed = {
        "mainFocus",
        "secondaryFocus",
        "age",
        "ageBand",
        "orientation",
        "intensityTarget",
        "periodPhase",
        "durationTotalMin",
        "playersCount",
        "trainingTitle",
    }
    out: dict[str, Any] = {}
    for key, val in data.items():
        if key in allowed and val not in (None, ""):
            out[key] = val
    return out


def _strip_service_markers(reply: str) -> str:
    clean = re.sub(
        r"(?im)^\s*Действие:\s*генерирай_тренировка\s*$",
        "",
        reply or "",
    )
    clean = re.sub(
        r"(?im)^\s*ПАРАМЕТРИ\s*:\s*\{.*?\}\s*$",
        "",
        clean,
        flags=re.DOTALL,
    )
    # ако JSON е на същия ред след текста
    clean = re.sub(r"(?im)\s*ПАРАМЕТРИ\s*:\s*\{.*?\}\s*", "\n", clean)
    return clean.strip()


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

Ако треньорът иска тренировка:
1) Обясни накратко какво предлагаш.
2) На отделен ред напиши точно: Действие: генерирай_тренировка
3) На следващ ред напиши точно JSON (без markdown), с възможни ключове
mainFocus, secondaryFocus, age, ageBand, orientation, intensityTarget, periodPhase, durationTotalMin, trainingTitle.
Пример:
ПАРАМЕТРИ: {{"mainFocus":"Координация","secondaryFocus":"Атака","age":14,"ageBand":"U14","orientation":"physical","intensityTarget":"medium","periodPhase":"inseason","trainingTitle":"U14 · отскок и сила"}}
Допустими mainFocus: Посрещане, Разпределение, Сервис, Атака, Блок, Защита, Преход, Координация, Игра.
Допустими orientation: balanced, serve_receive, attack_block, defense_transition, game_tactics, physical.
Допустими ageBand: mini, U13, U14, U15, U16, U17, U18.
За отскок/сила при юноши ползвай mainFocus=Координация и orientation=physical.
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
            "generateParams": {},
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
    from_model = _parse_params_from_reply(reply)
    local_params = extract_generate_params(message, age_band=age_band)
    # Локалният парсер е база; моделът допълва/уточнява без да трие ключове.
    generate_params = {**local_params, **from_model} if wants else {}
    if wants:
        generate_params["assistantOverride"] = True
        generate_params.setdefault("cycleId", None)
        generate_params.setdefault("textbookSlug", "")
        generate_params.setdefault("sessionCode", "")
        generate_params["sourceMessage"] = message

    clean = _strip_service_markers(reply)

    return {
        "reply": clean or reply,
        "wantsGenerate": bool(wants),
        "generateParams": generate_params,
        "provider": provider,
        "geminiAvailable": gemini_available(),
    }
