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
    "упражнен",
    "силов",
    "дай ми няколко",
    "предложи упражнен",
)

_YOUTH_PHYSICAL_PACK: tuple[dict[str, Any], ...] = (
    {
        "title": "Клекове с отскок и контрол на кацане",
        "blockType": "Изграждане",
        "minutes": 8,
        "skill": "Координация",
        "instructions": "3×6–8 повторения. Меко кацане, колене над пръстите. Пауза 45–60 сек. Без тежести за U14.",
    },
    {
        "title": "Планк с докосване на рамо",
        "blockType": "Изграждане",
        "minutes": 6,
        "skill": "Координация",
        "instructions": "3×20–30 сек. Таз стабилен, без въртене. Дишане равномерно.",
    },
    {
        "title": "Медицинска топка — подавания от гърди",
        "blockType": "Изграждане",
        "minutes": 8,
        "skill": "Координация",
        "instructions": "3×8–10 подавания в двойка. Лека топка. Експлозивно избутване, мек прием.",
    },
    {
        "title": "Напади на място (контролирани)",
        "blockType": "Активиране",
        "minutes": 6,
        "skill": "Координация",
        "instructions": "2×8 на крак. Коляното на предния крак стабилно. Подготовка за отскок, не максимална сила.",
    },
)

_SETTER_PACK: tuple[dict[str, Any], ...] = (
    {
        "title": "Придвижване към топката + висока точка на контакт",
        "blockType": "Изграждане",
        "minutes": 10,
        "skill": "Разпределение",
        "instructions": "Серии: старт от зона 1/6 → спринт под топката → стоп → пас към зона 4/2. Краката спират преди контакт.",
    },
    {
        "title": "Пас към 4 и 2 без „телеграфиране“",
        "blockType": "Изграждане",
        "minutes": 10,
        "skill": "Разпределение",
        "instructions": "Еднаква подготовка на тялото; посоката се решава късно с ръцете. 3×8 паса във всяка посока.",
    },
    {
        "title": "Разпределение след посрещане (синтетично)",
        "blockType": "Интеграция",
        "minutes": 12,
        "skill": "Разпределение",
        "instructions": "Прием → разпределител → атака зона 4/2. Без темпо 1, ако групата още не е стабилна на високо подаване.",
    },
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
        (("разпредел", "пас ", "подав", "разпределител", "сетър", "setter"), "Разпределение", "Посрещане", "serve_receive"),
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
    return _sanitize_generate_params(out)


_PERIOD_ALIASES = {
    "prep": "prep",
    "подготов": "prep",
    "подготвителен": "prep",
    "inseason": "inseason",
    "състезател": "inseason",
    "състезателен": "inseason",
    "taper": "taper",
    "пик": "taper",
    "облекчен": "taper",
    "offseason": "offseason",
    "преход": "offseason",
    "преходен": "offseason",
}
_INTENSITY_ALIASES = {
    "low": "low",
    "нис": "low",
    "лек": "low",
    "medium": "medium",
    "сред": "medium",
    "high": "high",
    "вис": "high",
    "теж": "high",
}
_ORIENTATION_OK = {
    "balanced",
    "serve_receive",
    "attack_block",
    "defense_transition",
    "game_tactics",
    "physical",
}
_FOCUS_OK = {
    "Посрещане",
    "Разпределение",
    "Сервис",
    "Атака",
    "Блок",
    "Защита",
    "Преход",
    "Координация",
    "Игра",
}


def _sanitize_generate_params(params: dict[str, Any]) -> dict[str, Any]:
    """Нормализира стойности от Gemini към API enum-ите."""
    out = dict(params or {})

    period = str(out.get("periodPhase") or "").strip().lower()
    if period:
        mapped = None
        for key, val in _PERIOD_ALIASES.items():
            if key in period:
                mapped = val
                break
        if mapped:
            out["periodPhase"] = mapped
        else:
            out.pop("periodPhase", None)

    intensity = str(out.get("intensityTarget") or "").strip().lower()
    if intensity:
        mapped = None
        for key, val in _INTENSITY_ALIASES.items():
            if key in intensity:
                mapped = val
                break
        if mapped:
            out["intensityTarget"] = mapped
        else:
            out.pop("intensityTarget", None)

    orientation = str(out.get("orientation") or "").strip()
    if orientation and orientation not in _ORIENTATION_OK:
        low = orientation.lower()
        if "phys" in low or "сил" in low or "отскок" in low:
            out["orientation"] = "physical"
        else:
            out.pop("orientation", None)

    for key in ("mainFocus", "secondaryFocus"):
        focus = out.get(key)
        if focus and focus not in _FOCUS_OK:
            # опитай case-insensitive match
            match = next((f for f in _FOCUS_OK if f.lower() == str(focus).lower()), None)
            if match:
                out[key] = match
            else:
                out.pop(key, None)

    if "age" in out:
        try:
            out["age"] = int(out["age"])
        except (TypeError, ValueError):
            out.pop("age", None)

    if "durationTotalMin" in out:
        try:
            out["durationTotalMin"] = int(out["durationTotalMin"])
        except (TypeError, ValueError):
            out.pop("durationTotalMin", None)

    if "playersCount" in out:
        try:
            out["playersCount"] = int(out["playersCount"])
        except (TypeError, ValueError):
            out.pop("playersCount", None)

    return out


def _normalize_exercise(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    title = str(raw.get("title") or raw.get("name") or "").strip()
    if not title:
        return None
    block = str(raw.get("blockType") or raw.get("block") or "Изграждане").strip()
    if block not in ("Активиране", "Изграждане", "Интеграция", "Състезателност"):
        block = "Изграждане"
    try:
        minutes = int(raw.get("minutes") or 8)
    except (TypeError, ValueError):
        minutes = 8
    minutes = max(4, min(20, minutes))
    return {
        "title": title[:120],
        "blockType": block,
        "minutes": minutes,
        "skill": str(raw.get("skill") or "Координация")[:60],
        "instructions": str(raw.get("instructions") or raw.get("desc") or "").strip()[:600],
        "source": str(raw.get("source") or "assistant"),
    }


def _parse_exercises_from_reply(reply: str) -> list[dict[str, Any]]:
    if not reply:
        return []
    m = re.search(r"УПРАЖНЕНИЯ\s*:\s*(\[.*?\])", reply, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return []
    try:
        data = json.loads(m.group(1))
    except json.JSONDecodeError:
        return []
    if not isinstance(data, list):
        return []
    out: list[dict[str, Any]] = []
    for item in data[:8]:
        norm = _normalize_exercise(item)
        if norm:
            out.append(norm)
    return out


def default_physical_exercises(age_band: str | None = None) -> list[dict[str, Any]]:
    """Локален пакет силови/отскок упражнения (без тежести за юноши)."""
    _ = age_band
    return [dict(x) for x in _YOUTH_PHYSICAL_PACK]


def default_setter_exercises(age_band: str | None = None) -> list[dict[str, Any]]:
    _ = age_band
    return [dict(x) for x in _SETTER_PACK]


def _strip_service_markers(reply: str) -> str:
    clean = re.sub(
        r"(?im)^\s*Действие:\s*генерирай_тренировка\s*$",
        "",
        reply or "",
    )
    clean = re.sub(
        r"(?is)\s*ПАРАМЕТРИ\s*:\s*\{.*?\}\s*",
        "\n",
        clean,
    )
    clean = re.sub(
        r"(?is)\s*УПРАЖНЕНИЯ\s*:\s*\[.*?\]\s*",
        "\n",
        clean,
    )
    return clean.strip()


def _repair_truncated_reply(reply: str) -> str:
    """Почиства очевидно срязан край (markdown / полудума)."""
    text = (reply or "").rstrip()
    if not text:
        return text
    # Срязан bold/list край: "* **К" / "**Крач" и т.н.
    text = re.sub(r"(?:\n|^)\s*[\*\-]\s*\*\*[^*\n]{0,40}$", "", text).rstrip()
    text = re.sub(r"\*\*[^*\n]{0,24}$", "", text).rstrip()
    # Отворен markdown bold без затваряне
    if text.count("**") % 2 == 1:
        text = text.rsplit("**", 1)[0].rstrip()
    # Ако завършва с двоеточие/„ето какво“ без съдържание — махни последния ред
    lines = text.splitlines()
    if lines:
        last = lines[-1].strip()
        if last.endswith(":") or re.search(r"кажи(ш)? на корта:?\s*$", last, re.I):
            text = "\n".join(lines[:-1]).rstrip()
    return text.strip()


def _session_live_drill_cues(card: dict[str, Any]) -> str:
    title = str(card.get("title") or "упражнението")
    desc = str(card.get("description") or "").strip()
    mistakes = str(card.get("commonMistakes") or "").strip()
    points = str(card.get("coachingPoints") or "").strip()
    progressions = str(card.get("progressions") or "").strip()

    cue = points
    if not cue and "отзад" in desc.lower():
        cue = "„хвърли → сет → атака от зона 6; гледай топката, не мрежата“"
    if not cue and any(k in title.lower() for k in ("пеперуд", "pipe", "тръбн")):
        cue = "„сет към центъра/зад, разбег от дълбочина, удар над рамото“"
    if not cue:
        cue = "„едно движение наведнъж — бавно, после темпо“"

    simplify = progressions or (
        "Без защита първо: само хвърляне → подаване → удар. "
        "После добави 1 защитник; накрая пълната схема."
    )
    watch = mistakes or "бързане, лош тайминг на разбега, топка твърде ниско/далеч"

    return (
        f"За „{title}“ сега на терена:\n"
        f"1) Спри — пусни опростена версия: {simplify}\n"
        f"2) Cue към играчите: {cue}\n"
        f"3) 5–6 чисти повторения; гледай: {watch}.\n"
        f"Ако още не разбират: нарисувай схемата на пода с конуси (кой къде стои) и пусни 2 бавни демонстрации."
    )


def _session_live_technique_answer(
    message: str,
    *,
    session_pack: Optional[dict[str, Any]] = None,
) -> Optional[str]:
    """Технически cues — преди drill-match, за да не се hijack-ва въпросът."""
    low = (message or "").lower()
    title = str((session_pack or {}).get("title") or "тази тренировка")
    focus = str((session_pack or {}).get("mainFocus") or "")
    secondary = str((session_pack or {}).get("secondaryFocus") or "")

    if any(k in low for k in ("как да кажа", "какво да кажа", "какво точно да кажа", "на детето")):
        if any(k in low for k in ("сил", "удар", "скок", "отскок")):
            return (
                "Кажи късо, едно изречение на детето: "
                "„Силата е от краката — бързи последни две стъпки, после скачай и удряй пред тялото.“ "
                "После 4 чисти опита само с този cue — без дълги обяснения."
            )
        return (
            "На детето — една фраза, не лекция. Спри 20 сек и кажи според грешката: "
            "„гледай топката“ / „бързи последни стъпки“ / „кажи МОЯ“. "
            "Пет повторения само с този cue, после продължете."
        )

    jumpish = any(
        k in low
        for k in (
            "скочи",
            "скок",
            "отскок",
            "скач",
            "подскок",
            "по-високо",
            "по високо",
            "плио",
        )
    )
    add_block = any(k in low for k in ("добав", "искам", "вмъкн", "включи", "още"))

    if jumpish and add_block:
        return (
            f"В „{title}“ (фокус {focus or 'координация'}"
            f"{f' + {secondary}' if secondary else ''}) добави 6–8 мин отскок преди атаката: "
            "2×6 вертикални подскока с меко кацане, после 2×4 подхода само до отскок без удар. "
            "Cue: „бързи последни две → тласък от земята → кацане на две“. "
            "После върни към упражнението от плана — вече с малко повече височина в удара. "
            "Без тежести; ако кацането се разпада — спри сериите."
        )

    if jumpish:
        return (
            "За по-висок и по-правилен отскок сега: "
            "спри „само с ръце нагоре“. "
            "Cue: „бързи последни две стъпки, колене меки, тласък нагоре, кацане на две като на пружина“. "
            "6 подхода без топка (само разбег+скок), после 6 с леко подаване. "
            "Гледай последната стъпка да спира (не да плъзга) — оттам идва височината. "
            "Ако искаш повече сила в същата тренировка: 2 кратки серии подскоци между блоковете, не в края до отказ."
        )

    # Сила на удара / откъде идва силата (биомеханика)
    hit_power = any(
        k in low
        for k in (
            "сила на удар",
            "силата на удар",
            "сила удара",
            "силата удара",
            "взема сила",
            "от къде",
            "откъде",
            "мощност",
        )
    ) or (
        "сил" in low
        and any(k in low for k in ("удар", "атак", "маха", "ръка", "рамо"))
    )
    if hit_power or (
        "сил" in low and not any(k in low for k in ("плио", "физик", "серия"))
    ):
        attackish = any(
            k in (focus + " " + secondary).lower() for k in ("атак", "нападен", "удар")
        )
        if hit_power or attackish or "удар" in low:
            return (
                "Силата на удара не е от рамото сама. "
                "Кажи: „бързи последни 2 → скачай → завърти тялото → удари пред себе си“. "
                "4–6 опита: първо махане без топка, после леко подаване. "
                "Гледай кацане на две и топка пред тялото (не зад главата). "
                "Крака + корем + махане — ръката е последният бич."
            )

    if any(k in low for k in ("заход", "разбег", "стъпк", "approach", "обратн")):
        four = any(k in low for k in ("четири", "4 ", "4-ст", "4 ст"))
        if four or "заход" in low:
            return (
                "За 4-стъпков заход: първо само крака, без топка. "
                "За дясна ръка cue: „дясна – лява – дясна – лява+скок“ — "
                "последните две по-бързи, последната по-дълга и спираща. "
                "Шест без топка, шест с леко подаване; гледай ритъма и кацане на две. "
                "Ако се бъркат — сложи 4 конуса като отпечатъци."
            )
        return (
            "За разбега: покажи само последните 2–3 стъпки без топка. "
            "Cue: „лява–дясна–скок“ (или огледално), последната стъпка спира. "
            "Три без топка, три с леко подаване; кацане на две. "
            "Конус на последната стъпка помага, ако още се бъркат."
        )

    if any(k in low for k in ("физик", "серия")) and "сил" in low:
        return (
            f"За сила/плио в „{title}“: качество пред обем — "
            "3–4 серии × 4–6 чисти усилия, не до отказ. "
            "Cue: „меко кацане, колене над пръстите, пълен размах“. "
            "40–60 сек походка между сериите, после обратно към техниката от плана."
        )

    return None


def _fallback_answer(
    message: str,
    age_band: str | None,
    *,
    session_live: bool = False,
    session_pack: Optional[dict[str, Any]] = None,
    matched_drills: Optional[list[dict[str, Any]]] = None,
    history: Optional[list[dict[str, str]]] = None,
) -> str:
    low = (message or "").lower()

    if session_live:
        # 1) Техника първо — не замествай с грешен drill
        tech = _session_live_technique_answer(message, session_pack=session_pack)
        if tech:
            return tech

        confused = any(
            k in low
            for k in (
                "не се получ",
                "не върви",
                "трудност",
                "обърк",
                "разбира",
                "опрости",
                "не им се",
                "какво е",
                "как се",
                "не знаят",
                "не зная",
            )
        )

        drills = list(matched_drills or [])
        if not drills and session_pack:
            # Само пълно име на упражнение от плана
            for card in session_pack.get("drills") or []:
                title = str(card.get("title") or "").lower().strip()
                if title and len(title) >= 6 and title in low:
                    drills.append(card)

        # Drill cues само при ясно име ИЛИ объркване + силен match
        if drills and (confused or any(
            str(d.get("title") or "").lower() in low for d in drills
        )):
            return _session_live_drill_cues(drills[0])

        if "зон" in low:
            return (
                "За зоните на терена:\n"
                "1) Покажи с ръка „твоята зона / границата“.\n"
                "2) Cue: „ако е между двама — казваш МОЯ“.\n"
                "3) 4 топки само на границата; после продължете упражнението."
            )
        if any(k in low for k in ("разпредел", "сетър", "setter")) or (
            "подава" in low and "удар" not in low
        ):
            return (
                "За разпределителя:\n"
                "1) Спри ритъма — 3 подавания само към центъра с висок дъга.\n"
                "2) Cue: „топката над челото, после тласък“.\n"
                "3) След 5 чисти — върнете към упражнението от плана."
            )
        if any(k in low for k in ("малко", "нямаме", "8 души", "по-малко")) and "играч" in low:
            return (
                "При по-малко играчи:\n"
                "1) Намали полето / махни една зона.\n"
                "2) Един треньор подава вместо липсващия.\n"
                "3) Дръж целта на блока (напр. синхрон), не пълния 6v6."
            )
        if confused:
            names = [
                str(d.get("title"))
                for d in ((session_pack or {}).get("drills") or [])[:5]
                if d.get("title")
            ]
            hint = f" Напр. от плана: {', '.join(names)}." if names else ""
            return (
                "Сега на терена:\n"
                "1) Назови упражнението с име (или кажи техниката: разбег, сила на удара, зони)."
                f"{hint}\n"
                "2) Опрости: без топка → бавно с топка → нормално темпо.\n"
                "3) Дай един cue (1 изречение) и 5 чисти повторения преди да продължите."
            )
        names = [
            str(d.get("title"))
            for d in ((session_pack or {}).get("drills") or [])[:5]
            if d.get("title")
        ]
        if names:
            return (
                f"От плана виждам: {', '.join(names)}.\n"
                "Кажи кое работите сега, или питай директно за техника "
                "(разбег, сила на удара, зони) — ще ти дам 2–3 cues."
            )
        return (
            "Кажи името на упражнението или техниката "
            "(разбег, сила на удара, зони, брой играчи). Ще ти дам 2–3 cues за терена."
        )

    bundle = load_coach_assistant_method()
    _ = bundle
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


def _system_prompt(age_band: str | None, extra_context: str, *, session_live: bool = False) -> str:
    ctx = assistant_system_context(age_band)
    glossary = ctx.get("glossary") or {}
    gloss_lines = "\n".join(f"- {k}: {v}" for k, v in list(glossary.items())[:16])
    principles = "\n".join(f"- {p}" for p in (ctx.get("principles") or [])[:18])
    age_lines = "\n".join(f"- {p}" for p in (ctx.get("age_emphasis") or [])[:6])

    if session_live:
        return f"""Ти си опитен български волейболен треньор-помощник НА ТЕРЕНА.
Говори само на български — като колега на корта: ясно, човешки, без канцелария и без „мога да помогна с…“.

Как да ползваш контекста:
- Контекстът (отбор, възраст, фокус на тренировката, план, упражнения) е ЗАЗЕМЯВАНЕ.
- Отговорът идва от треньорските ти знания — не рецитирай списъка с упражнения и не питай „кое работите“, ако въпросът вече е ясен (отскок, заход, сила, cues, зони).
- Ако пита за техника — отговори директно. Ако иска да добави блок (отскок/сила) — кажи КАК да го вмъкне в ТАЗИ тренировка за 6–10 мин.
- Споменавай упражнение от плана само ако треньорът го е назовал или пита как да го опрости.

Стил:
- 4–8 изречения. Можеш кратък списък, но не задължително 1) 2) 3) всеки път.
- Дай конкретно КАКВО да каже на играчите (1–2 cues) и КАКВО да гледа.
- Винаги ЗАВЪРШВАЙ отговора — без срязан край и без празен „Ето какво да кажеш:“.
- Без генериране на цяла нова тренировка, освен при изрична молба.
Не казвай „тапер“. Ползвай: посрещане, разпределител, сервиращи, облекчена.

Акцент за възрастта:
{age_lines}

=== КОНТЕКСТ (отбор + тренировка) ===
{extra_context or "няма"}
=== КРАЙ ===
"""

    return f"""Ти си треньорски помощник в българска волейболна платформа (Volley Coach).
Говориш само на ясен български. Кратки, практически отговори (до 8–12 изречения).
Годишната програма БФВ е водеща. Не измисляй медицински диагнози и не предписвай лекарства.
Използвай термините: посрещане, сервиращи, начален удар, разпределител, облекчена тренировка (не казвай „тапер“).

Можеш да съветваш по: техника, тактика, физика (юношески подходяща), психика
(фокус, комуникация, роли, справяне с грешки, напрежение преди мач), организация на седмицата.

Речник:
{gloss_lines}

Принципи:
{principles}

Акцент за възрастта:
{age_lines}

=== КОНТЕКСТ ЗА ТОЗИ ТРЕНЬОР / ОТБОР (използвай го; не питай отново ако е дадено) ===
{extra_context or "няма допълнителен контекст"}
=== КРАЙ НА КОНТЕКСТА ===

Ако треньорът иска тренировка или упражнения:
1) Обясни накратко какво предлагаш (може да изброиш упражненията на човешки език).
2) На отделен ред напиши точно: Действие: генерирай_тренировка
3) На следващ ред: ПАРАМЕТРИ: {{...}} с ключове
mainFocus, secondaryFocus, age, ageBand, orientation, intensityTarget, periodPhase, durationTotalMin, trainingTitle.
4) На следващ ред JSON масив с конкретните упражнения (задължително при сила/отскок/физика):
УПРАЖНЕНИЯ: [{{"title":"...","blockType":"Изграждане","minutes":8,"instructions":"...","skill":"Координация"}}]
blockType е едно от: Активиране, Изграждане, Интеграция, Състезателност.
Допустими mainFocus: Посрещане, Разпределение, Сервис, Атака, Блок, Защита, Преход, Координация, Игра.
Допустими orientation: balanced, serve_receive, attack_block, defense_transition, game_tactics, physical.
Допустими ageBand: mini, U13, U14, U15, U16, U17, U18.
За отскок/сила при юноши: mainFocus=Координация, orientation=physical, без тежести.
Ако в контекста има тема/фокус от годишната програма — ползвай ги по подразбиране, освен ако треньорът иска друго.
Ако daysUntilMatch <= 1 — предлагай облекчена / активиране преди мач.
Не разчитай само на техническата база — за физика винаги попълвай УПРАЖНЕНИЯ.
"""


def build_reply(
    message: str,
    *,
    age_band: str | None = None,
    context: Optional[dict[str, Any]] = None,
    history: Optional[list[dict[str, str]]] = None,
    platform_context: Optional[dict[str, Any]] = None,
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
    plat = platform_context or {}
    defaults = plat.get("generateDefaults") or {}

    # age band: платформа > payload > defaults
    effective_age = (
        age_band
        or (plat.get("activeTeam") or {}).get("ageBand")
        or defaults.get("ageBand")
        or None
    )

    extra_parts = []
    if plat.get("promptText"):
        extra_parts.append(str(plat["promptText"]))
    # thin client hints (legacy)
    if ctx.get("teamName") and not plat.get("activeTeam"):
        extra_parts.append(f"Отбор (от клиента): {ctx['teamName']}")
    if ctx.get("date"):
        extra_parts.append(f"Дата (от клиента): {ctx['date']}")
    if ctx.get("daysUntilMatch") is not None and defaults.get("daysUntilMatch") is None:
        extra_parts.append(f"Дни до мач: {ctx['daysUntilMatch']}")
    if ctx.get("programTheme") and not defaults.get("programTheme"):
        extra_parts.append(f"Тема по програма: {ctx['programTheme']}")
    extra_context = "\n".join(extra_parts)

    history_txt = ""
    for turn in (history or [])[-6:]:
        role = "Треньор" if turn.get("role") == "user" else "Помощник"
        history_txt += f"{role}: {turn.get('content', '')}\n"

    prompt = f"{history_txt}\nТреньор: {message}\nПомощник:"
    provider = "local"
    reply = ""
    session_live = (
        str(ctx.get("mode") or "") == "session_live" or bool(plat.get("sessionTraining"))
    )
    session_pack = plat.get("sessionTraining") if isinstance(plat.get("sessionTraining"), dict) else None
    matched_drills = plat.get("matchedDrills") if isinstance(plat.get("matchedDrills"), list) else None

    if gemini_available():
        # Live: по-свободен тон от Gemini; контекстът заземява, знанията отговарят
        result = generate_text(
            prompt,
            system=_system_prompt(effective_age, extra_context, session_live=session_live),
            temperature=0.55 if session_live else 0.35,
            max_output_tokens=4096 if session_live else 2048,
        )
        if result.get("ok") and result.get("text"):
            reply = str(result["text"]).strip()
            provider = f"gemini:{result.get('model')}"
            if result.get("continued"):
                provider += "+cont"
        elif session_live:
            # Втори опит с по-кратък system — често спасява при странен model/prompt
            short_system = (
                "Български волейболен треньор на терена. Отговори директно и човешки на въпроса. "
                "Ползвай контекста по-долу само като фон. Не питай кое упражнение, ако въпросът е ясен. "
                "Държи отговора завършен — без срязан край.\n\n"
                f"{extra_context[:3500]}"
            )
            retry = generate_text(
                prompt,
                system=short_system,
                temperature=0.6,
                max_output_tokens=4096,
            )
            if retry.get("ok") and retry.get("text"):
                reply = str(retry["text"]).strip()
                provider = f"gemini_retry:{retry.get('model')}"
            else:
                reply = _fallback_answer(
                    message,
                    effective_age,
                    session_live=session_live,
                    session_pack=session_pack,
                    matched_drills=matched_drills,
                    history=history,
                )
                provider = f"local_fallback:{result.get('error')}"
        else:
            reply = _fallback_answer(
                message,
                effective_age,
                session_live=session_live,
                session_pack=session_pack,
                matched_drills=matched_drills,
                history=history,
            )
            provider = f"local_fallback:{result.get('error')}"
    else:
        reply = _fallback_answer(
            message,
            effective_age,
            session_live=session_live,
            session_pack=session_pack,
            matched_drills=matched_drills,
            history=history,
        )

    wants = _wants_generate(message) or ("генерирай_тренировка" in reply.lower())
    if session_live:
        # Live на терена: само изрична молба за нов план
        low = message.lower()
        explicit_new = any(
            x in low
            for x in (
                "нова тренировка",
                "генерирай нова",
                "друг план",
                "изцяло нова",
            )
        )
        if not explicit_new:
            wants = False

    from_model = _parse_params_from_reply(reply)
    local_params = extract_generate_params(message, age_band=effective_age)
    proposed = _parse_exercises_from_reply(reply)

    # Ред: програмни defaults < локален парсер < модел (с sanitize)
    generate_params: dict[str, Any] = {}
    if wants:
        for key in (
            "mainFocus",
            "secondaryFocus",
            "age",
            "ageBand",
            "orientation",
            "intensityTarget",
            "periodPhase",
            "durationTotalMin",
            "trainingTitle",
            "textbookSlug",
        ):
            if defaults.get(key) not in (None, ""):
                generate_params[key] = defaults[key]
        generate_params.update(local_params)
        generate_params.update(from_model)
        generate_params = _sanitize_generate_params(generate_params)
        generate_params["assistantOverride"] = True
        generate_params.setdefault("cycleId", None)
        generate_params.setdefault("textbookSlug", generate_params.get("textbookSlug") or "")
        generate_params.setdefault("sessionCode", "")
        generate_params["sourceMessage"] = message
        if defaults.get("teamId"):
            generate_params["teamId"] = defaults["teamId"]
        if defaults.get("sessionDate"):
            generate_params["sessionDate"] = defaults["sessionDate"]
        if defaults.get("daysUntilMatch") is not None:
            generate_params["daysUntilMatch"] = defaults["daysUntilMatch"]
            # match-day auto override unless user asked for heavy work
            if int(defaults["daysUntilMatch"]) <= 1 and not any(
                k in message.lower() for k in ("сил", "тежк", "отскок")
            ):
                generate_params["periodPhase"] = "taper"
                generate_params["intensityTarget"] = "low"

        is_physical = (
            generate_params.get("orientation") == "physical"
            or generate_params.get("mainFocus") == "Координация"
            or any(k in message.lower() for k in ("силов", "отскок", "физическ", "скач"))
        )
        is_setter = generate_params.get("mainFocus") == "Разпределение" or any(
            k in message.lower() for k in ("разпределител", "сетър", "setter")
        )
        if not proposed and is_physical:
            proposed = default_physical_exercises(generate_params.get("ageBand") or effective_age)
        elif not proposed and is_setter:
            proposed = default_setter_exercises(generate_params.get("ageBand") or effective_age)
        if proposed:
            generate_params["proposedExercises"] = proposed
        # Чатът е водещ — не позволявай учебник да върне „темпо 1“ вместо исканото умение
        generate_params["assistantOverride"] = True
        generate_params["textbookSlug"] = ""
        generate_params["sessionCode"] = ""
        generate_params["cycleId"] = None

    clean = _strip_service_markers(reply)
    if session_live:
        clean = _repair_truncated_reply(clean)

    return {
        "reply": clean or reply,
        "wantsGenerate": bool(wants),
        "generateParams": generate_params,
        "provider": provider,
        "geminiAvailable": gemini_available(),
        "platformContext": {
            "activeTeam": plat.get("activeTeam"),
            "needsTeamPick": plat.get("needsTeamPick"),
            "knownFacts": plat.get("knownFacts") or [],
            "generateDefaults": defaults,
            "program": plat.get("program"),
            "calendar": plat.get("calendar"),
        },
    }
