from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


PHASES_BG = ["Активиране", "Изграждане", "Интеграция", "Състезателност"]
BLOCK_TO_PLAN_KEY = {
    "Активиране": "warmup",
    "Изграждане": "technique",
    "Интеграция": "serve_receive",
    "Състезателност": "game",
}

_SKILL_CANONICAL = ["Посрещане", "Разпределение", "Сервис", "Атака", "Блок", "Защита"]
_SKILL_SYNONYMS: Dict[str, Tuple[str, ...]] = {
    "Посрещане": ("посрещане", "приемане", "serve receive", "serve-receive", "reception", "посрещане на сервис"),
    "Разпределение": ("разпределение", "пас", "разиграване", "setting", "подаване"),
    "Сервис": ("сервис", "начален удар", "serve"),
    "Атака": ("атака", "нападение", "attack"),
    "Блок": ("блок", "block"),
    "Защита": ("защита", "defense", "диг"),
}


@dataclass
class PickedState:
    selected: List[Dict[str, Any]]
    picked_ids: Set[int]
    picked_skill_set: Set[str]
    progression_skill_base: Set[str]
    max_skill_count_so_far: int
    build_pair_ready: bool
    recent_rank_by_id: Dict[int, int]


def _safe_str(value: Any) -> str:
    return str(value).strip() if value is not None else ""


def _norm(value: Any) -> str:
    return _safe_str(value).lower()


def _split_values(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [_safe_str(x) for x in raw if _safe_str(x)]
    text = _safe_str(raw)
    if not text:
        return []
    for sep in ["|", ";", "/", "\n"]:
        text = text.replace(sep, ",")
    return [x.strip() for x in text.split(",") if x.strip()]


def _get_field(source: Any, *names: str) -> Any:
    for name in names:
        if isinstance(source, dict) and name in source:
            return source.get(name)
        if hasattr(source, name):
            return getattr(source, name)
    return None


def _drill_to_dict(drill: Any) -> Dict[str, Any]:
    return {
        "id": int(_get_field(drill, "id") or 0),
        "name": _safe_str(_get_field(drill, "name", "title")),
        "category": _safe_str(_get_field(drill, "category")),
        "skillFocus": _safe_str(_get_field(drill, "skillFocus", "skill_focus")),
        "goal": _safe_str(_get_field(drill, "goal")),
        "description": _safe_str(_get_field(drill, "description")),
        "training_goal": _safe_str(_get_field(drill, "training_goal")),
        "technical_focus": _get_field(drill, "technical_focus", "technicalFocus"),
        "tactical_focus": _get_field(drill, "tactical_focus", "tacticalFocus"),
        "game_phases": _get_field(drill, "game_phases", "gamePhases"),
        "type_of_drill": _safe_str(_get_field(drill, "type_of_drill", "typeOfDrill")),
        "durationMin": _get_field(drill, "durationMin", "duration_min"),
        "durationMax": _get_field(drill, "durationMax", "duration_max"),
        "age_min": _get_field(drill, "age_min", "ageMin"),
        "age_max": _get_field(drill, "age_max", "ageMax"),
        "videoUrls": _get_field(drill, "videoUrls", "video_urls"),
        "imageUrls": _get_field(drill, "imageUrls", "image_urls"),
        "rpe": _get_field(drill, "rpe"),
        "intensity_type": _safe_str(_get_field(drill, "intensity_type", "intensityType")),
        "complexity_level": _safe_str(_get_field(drill, "complexity_level", "complexityLevel")),
        "decision_level": _safe_str(_get_field(drill, "decision_level", "decisionLevel")),
    }


def normalizeSkill(text: Any) -> str:
    probe = _norm(text)
    if not probe:
        return ""
    for canonical in _SKILL_CANONICAL:
        for synonym in _SKILL_SYNONYMS[canonical]:
            syn = _norm(synonym)
            if probe == syn or syn in probe:
                return canonical
    return ""


def normalizeSkillsFromSkillFocus(skillFocusString: Any) -> List[str]:
    skills: List[str] = []
    chunks = _split_values(skillFocusString) if not isinstance(skillFocusString, list) else skillFocusString
    for chunk in chunks:
        direct = normalizeSkill(chunk)
        if direct:
            skills.append(direct)
            continue
        for token in _safe_str(chunk).split():
            mapped = normalizeSkill(token)
            if mapped:
                skills.append(mapped)
    unique: List[str] = []
    for skill in skills:
        if skill not in unique:
            unique.append(skill)
    return unique


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def phaseWeightsFromCategory(categoryString: Any) -> Dict[str, float]:
    category = _norm(categoryString)
    weights = {phase: 0.0 for phase in PHASES_BG}
    if "загрявка" in category:
        weights["Активиране"] = max(weights["Активиране"], 0.9)
    if "основна фаза 1" in category:
        weights["Изграждане"] = max(weights["Изграждане"], 0.8)
    if "основна фаза 2" in category:
        weights["Интеграция"] = max(weights["Интеграция"], 0.7)
    if "игрова ситуация" in category:
        weights["Интеграция"] = max(weights["Интеграция"], 0.6)
        weights["Състезателност"] = max(weights["Състезателност"], 0.4)
    if "затваряне" in category:
        weights["Състезателност"] = max(weights["Състезателност"], 0.9)
    if "техническа подготовка" in category:
        weights["Изграждане"] = max(weights["Изграждане"], 0.6)
        weights["Интеграция"] = max(weights["Интеграция"], 0.4)
    if "тактика" in category:
        weights["Интеграция"] = max(weights["Интеграция"], 0.7)
        weights["Състезателност"] = max(weights["Състезателност"], 0.3)
    return weights


def phaseMatchScore(drill: Dict[str, Any], targetPhaseName: str) -> float:
    weights = phaseWeightsFromCategory(drill.get("category"))
    score = float(weights.get(targetPhaseName, 0.0))
    text = _norm(f"{drill.get('goal', '')} {drill.get('description', '')} {drill.get('training_goal', '')}")

    competitive_kw = ("точки", "гейм", "сет", "резултат", "състезание")
    if targetPhaseName == "Състезателност" and any(kw in text for kw in competitive_kw):
        score += 0.2

    if any(kw in text for kw in ("6v6", "6 срещу 6")):
        if targetPhaseName in {"Интеграция", "Състезателност"}:
            score += 0.15

    if any(kw in text for kw in ("3v3", "4v4", "малка игра")) and targetPhaseName == "Интеграция":
        score += 0.15

    if any(kw in text for kw in ("по двойки", "индивидуално", "контрол")):
        build_weight = weights.get("Изграждане", 0.0)
        activation_weight = weights.get("Активиране", 0.0)
        preferred = "Изграждане" if build_weight >= activation_weight else "Активиране"
        if targetPhaseName == preferred:
            score += 0.15

    return _clamp01(score)


def inferPhase(drill: Dict[str, Any], targetPhaseName: str) -> float:
    return phaseMatchScore(drill, targetPhaseName)


def inferGameContext(drill: Dict[str, Any]) -> str:
    text = _norm(
        " ".join(
            [
                _safe_str(drill.get("name")),
                _safe_str(drill.get("goal")),
                _safe_str(drill.get("description")),
                _safe_str(drill.get("type_of_drill")),
                " ".join(_split_values(drill.get("game_phases"))),
            ]
        )
    )
    if any(kw in text for kw in ("точки", "гейм", "сет", "резултат")):
        return "точки"
    if any(kw in text for kw in ("6v6", "6 срещу 6")):
        return "6v6"
    if any(kw in text for kw in ("3v3", "4v4", "малка игра")):
        return "малка група"
    if "по двойки" in text:
        return "двойки"
    if "индивидуално" in text:
        return "индивидуално"
    return "малка група"


def inferSkillCount(drill: Dict[str, Any]) -> int:
    return len(set(normalizeSkillsFromSkillFocus(drill.get("skillFocus"))))


def inferDurationTarget(drill: Dict[str, Any]) -> Optional[float]:
    dmin = drill.get("durationMin")
    dmax = drill.get("durationMax")
    if isinstance(dmin, (int, float)) and isinstance(dmax, (int, float)):
        if dmin > 0 and dmax > 0:
            return (float(dmin) + float(dmax)) / 2.0
    if isinstance(dmin, (int, float)) and dmin > 0:
        return float(dmin)
    if isinstance(dmax, (int, float)) and dmax > 0:
        return float(dmax)
    return None


def _token_set(text: str) -> Set[str]:
    out: Set[str] = set()
    current = ""
    for ch in _norm(text):
        if ch.isalnum():
            current += ch
        elif len(current) > 2:
            out.add(current)
            current = ""
        else:
            current = ""
    if len(current) > 2:
        out.add(current)
    return out


def _jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa = set(a)
    sb = set(b)
    if not sa and not sb:
        return 0.0
    return len(sa.intersection(sb)) / max(1, len(sa.union(sb)))


def _drill_skill_set(drill: Dict[str, Any]) -> Set[str]:
    skills = set(normalizeSkillsFromSkillFocus(drill.get("skillFocus")))
    tech = " ".join(_split_values(drill.get("technical_focus")))
    tact = " ".join(_split_values(drill.get("tactical_focus")))
    for canonical in _SKILL_CANONICAL:
        if normalizeSkill(canonical) and canonical in (normalizeSkill(tech), normalizeSkill(tact)):
            skills.add(canonical)
    return skills


def _phase_skill_count_ok(target_phase: str, skill_count: int) -> bool:
    if target_phase == "Активиране":
        return skill_count == 1
    if target_phase == "Изграждане":
        return skill_count in {1, 2}
    if target_phase == "Интеграция":
        return skill_count in {2, 3}
    return skill_count in {3, 4}


def _phase_context_ok(target_phase: str, context: str) -> bool:
    allowed = {
        "Активиране": {"индивидуално", "двойки"},
        "Изграждане": {"двойки", "малка група"},
        "Интеграция": {"малка група", "6v6"},
        "Състезателност": {"6v6", "точки"},
    }
    return context in allowed.get(target_phase, set())


def _phase_duration_ok(target_phase: str, duration_target: Optional[float]) -> bool:
    if duration_target is None:
        return True
    if target_phase == "Активиране":
        return duration_target <= 8
    if target_phase in {"Изграждане", "Интеграция"}:
        return 7 <= duration_target <= 14
    return duration_target >= 10


def _has_valid_video(drill: Dict[str, Any]) -> bool:
    videos = drill.get("videoUrls")
    if videos is None:
        return False
    if isinstance(videos, list):
        values = [_norm(x) for x in videos if _safe_str(x)]
        return any(v not in {"няма данни", "-", "n/a", "unknown"} for v in values)
    single = _norm(videos)
    return bool(single and single not in {"няма данни", "-", "n/a", "unknown"})


def _parse_level_range(level: Any) -> Optional[Tuple[int, int]]:
    text = _norm(level)
    if not text.startswith("u"):
        return None
    nums = "".join(ch for ch in text if ch.isdigit())
    if not nums:
        return None
    upper = int(nums)
    return max(6, upper - 2), upper


def _parse_age_range(request_data: Dict[str, Any]) -> Tuple[int, int]:
    age_min = request_data.get("ageMin")
    age_max = request_data.get("ageMax")
    if isinstance(age_min, int) and isinstance(age_max, int):
        return min(age_min, age_max), max(age_min, age_max)

    age_input = request_data.get("sessionAge", request_data.get("age"))
    if isinstance(age_input, int):
        return age_input, age_input
    if isinstance(age_input, str):
        compact = age_input.replace(" ", "")
        if "-" in compact:
            left, right = compact.split("-", 1)
            if left.isdigit() and right.isdigit():
                a = int(left)
                b = int(right)
                return min(a, b), max(a, b)
        if compact.isdigit():
            n = int(compact)
            return n, n

    level_range = _parse_level_range(request_data.get("level"))
    if level_range:
        return level_range
    return 0, 99


def _age_matches(drill: Dict[str, Any], session_age_min: int, session_age_max: int) -> bool:
    dmin = drill.get("age_min")
    dmax = drill.get("age_max")
    if isinstance(dmin, int) and session_age_max < dmin:
        return False
    if isinstance(dmax, int) and session_age_min > dmax:
        return False
    return True


def _is_too_similar(drill: Dict[str, Any], selected: Sequence[Dict[str, Any]]) -> bool:
    name_tokens = _token_set(drill.get("name", ""))
    skill_set = _drill_skill_set(drill)
    category = _norm(drill.get("category"))
    for picked in selected:
        picked_tokens = _token_set(_safe_str(picked.get("name")))
        if _jaccard(name_tokens, picked_tokens) >= 0.65:
            return True
        picked_skill_set = set(picked.get("__skills", []))
        picked_category = _norm(picked.get("category"))
        if category and picked_category and category == picked_category:
            if _jaccard(skill_set, picked_skill_set) >= 0.8:
                return True
    return False


def _secondary_bonus(target_phase: str, has_secondary: bool) -> int:
    if not has_secondary:
        return 0
    if target_phase == "Интеграция":
        return 30
    return 10


def _reason_sentence(reasons: List[str], fallback: str) -> str:
    if not reasons:
        return fallback
    main = reasons[:2]
    sentence = " и ".join(main)
    if not sentence.endswith("."):
        sentence += "."
    return sentence


def _build_recent_rank_map(request_data: Dict[str, Any]) -> Dict[int, int]:
    """
    rank=1 -> last training, rank=2 -> second last, rank=3 -> third last
    """
    recent_rank: Dict[int, int] = {}
    grouped = request_data.get("recentDrillIdsBySession")
    if isinstance(grouped, list):
        for idx, bucket in enumerate(grouped[:3], start=1):
            if not isinstance(bucket, list):
                continue
            for raw in bucket:
                try:
                    did = int(raw)
                except Exception:
                    continue
                if did not in recent_rank:
                    recent_rank[did] = idx
    flat = request_data.get("recentDrillIds")
    if isinstance(flat, list):
        for raw in flat:
            try:
                did = int(raw)
            except Exception:
                continue
            if did not in recent_rank:
                recent_rank[did] = 3
    return recent_rank


def scoreDrill(
    drill: Dict[str, Any],
    targetPhase: str,
    sessionFocus: Dict[str, str],
    pickedSoFar: PickedState,
) -> Dict[str, Any]:
    skills = _drill_skill_set(drill)
    primary = normalizeSkill(sessionFocus.get("primary"))
    secondary = normalizeSkill(sessionFocus.get("secondary"))

    primary_match = bool(primary and primary in skills)
    secondary_match = bool(secondary and secondary in skills)
    phase_score = inferPhase(drill, targetPhase)
    skill_count = max(1, inferSkillCount(drill))
    context = inferGameContext(drill)
    duration_target = inferDurationTarget(drill)

    score = 0.0
    reasons: List[str] = []
    if primary_match:
        score += 100
        reasons.append(f"съдържа основния фокус {primary}")
    if secondary_match:
        sec_bonus = _secondary_bonus(targetPhase, True)
        score += sec_bonus
        reasons.append(f"подкрепя вторичния фокус {secondary}")

    score += 20 * phase_score
    if phase_score >= 0.5:
        reasons.append(f"подходящо е за фаза {targetPhase}")

    if _phase_skill_count_ok(targetPhase, skill_count):
        score += 10
    if _phase_context_ok(targetPhase, context):
        score += 10
    if _phase_duration_ok(targetPhase, duration_target):
        score += 5

    if _is_too_similar(drill, pickedSoFar.selected):
        score -= 15

    selected_count = len(pickedSoFar.selected)
    without_primary = sum(1 for d in pickedSoFar.selected if not d.get("__primary_match"))
    if not primary_match and selected_count >= 3:
        projected_without_primary = without_primary + 1
        projected_total = selected_count + 1
        if projected_without_primary > int(projected_total * 0.2):
            score -= 10

    base = pickedSoFar.progression_skill_base
    if base and base.issubset(skills) and len(skills) >= (len(base) + 1):
        score += 15
        reasons.append("надгражда уменията от предходната част")

    if targetPhase == "Интеграция" and pickedSoFar.build_pair_ready:
        has_triad = {"Сервис", "Посрещане", "Разпределение"}.issubset(skills) and skill_count >= 3
        has_alt = {"Посрещане", "Разпределение"}.issubset(skills) and (
            "Атака" in skills or "Защита" in skills
        )
        if has_triad:
            score += 15
            reasons.append("надгражда с верига Сервис-Посрещане-Разпределение")
        elif has_alt:
            score += 10
            reasons.append("надгражда с Посрещане-Разпределение и завършващо решение")

    try:
        drill_id = int(drill.get("id"))
    except Exception:
        drill_id = 0
    recency_rank = pickedSoFar.recent_rank_by_id.get(drill_id)
    if recency_rank:
        anti_repeat_penalty = {1: 40, 2: 25, 3: 15}.get(recency_rank, 15)
        score -= anti_repeat_penalty
        reasons.append(f"получава по-нисък приоритет заради скорошно използване (последни {recency_rank} тренировки)")
        novelty_score = 0
    else:
        novelty_score = 12
        score += novelty_score
        reasons.append("получава novelty бонус, защото не е ползвано в последните 3 тренировки")

    return {
        "score": round(score, 4),
        "phaseMatchScore": round(phase_score, 4),
        "primaryMatch": primary_match,
        "secondaryMatch": secondary_match,
        "skillCount": skill_count,
        "context": context,
        "durationTarget": duration_target,
        "skills": sorted(skills),
        "reasons": reasons,
        "noveltyScore": novelty_score,
    }


def _target_minutes(total_minutes: int) -> Dict[str, int]:
    ratios = {"Активиране": 0.18, "Изграждане": 0.32, "Интеграция": 0.32, "Състезателност": 0.18}
    minutes = {phase: int(round(total_minutes * ratios[phase])) for phase in PHASES_BG}
    diff = total_minutes - sum(minutes.values())
    idx = 0
    while diff != 0 and idx < 20:
        phase = PHASES_BG[idx % len(PHASES_BG)]
        minutes[phase] += 1 if diff > 0 else -1
        diff += -1 if diff > 0 else 1
        idx += 1
    return minutes


def _target_count_for_phase(target_minutes: int) -> int:
    if target_minutes <= 20:
        return 2
    if target_minutes <= 36:
        return 3
    return 4


def _allocate_minutes(target_minutes: int, drills: List[Dict[str, Any]]) -> None:
    if not drills:
        return
    duration_hints: List[int] = []
    for drill in drills:
        hint = drill.get("__duration")
        if isinstance(hint, (int, float)) and hint > 0:
            duration_hints.append(max(3, int(round(hint))))
        else:
            duration_hints.append(max(4, target_minutes // len(drills)))
    total = sum(duration_hints)
    if total == target_minutes:
        for idx, drill in enumerate(drills):
            drill["minutes"] = duration_hints[idx]
        return
    if total < target_minutes:
        idx = 0
        while total < target_minutes and idx < 500:
            pos = idx % len(duration_hints)
            duration_hints[pos] += 1
            total += 1
            idx += 1
    else:
        idx = 0
        while total > target_minutes and idx < 500:
            pos = idx % len(duration_hints)
            if duration_hints[pos] > 3:
                duration_hints[pos] -= 1
                total -= 1
            idx += 1
    for idx, drill in enumerate(drills):
        drill["minutes"] = duration_hints[idx]


def selectDrillsForPhase(
    drills: Sequence[Dict[str, Any]],
    targetPhase: str,
    targetMinutes: int,
    sessionFocus: Dict[str, str],
    pickedSoFar: PickedState,
) -> List[Dict[str, Any]]:
    available = [d for d in drills if int(d["id"]) not in pickedSoFar.picked_ids]
    with_video = [d for d in available if _has_valid_video(d)]
    if len(with_video) >= 2:
        available = with_video

    scored: List[Tuple[float, Dict[str, Any], Dict[str, Any]]] = []
    for drill in available:
        meta = scoreDrill(drill, targetPhase, sessionFocus, pickedSoFar)
        scored.append((meta["score"], drill, meta))
    scored.sort(key=lambda item: (item[0], item[2]["phaseMatchScore"], -int(item[1]["id"])), reverse=True)

    target_count = max(2, min(4, _target_count_for_phase(targetMinutes)))
    selected: List[Dict[str, Any]] = []
    for _, drill, meta in scored:
        if len(selected) >= target_count:
            break
        if _is_too_similar(drill, selected):
            continue
        selected.append(
            {
                "id": int(drill["id"]),
                "name": drill.get("name"),
                "category": drill.get("category"),
                "skillFocus": drill.get("skillFocus"),
                "videoUrls": drill.get("videoUrls"),
                "imageUrls": drill.get("imageUrls"),
                "rpe": drill.get("rpe"),
                "minutes": 0,
                "обосновка": _reason_sentence(
                    meta["reasons"],
                    f"Подходящо за {targetPhase} според категория, контекст и фокус на тренировката.",
                ),
                "__score": meta["score"],
                "__primary_match": meta["primaryMatch"],
                "__secondary_match": meta["secondaryMatch"],
                "__skills": meta["skills"],
                "__duration": meta["durationTarget"],
                "__phase": targetPhase,
            }
        )

    if len(selected) < 2:
        for _, drill, meta in scored:
            if len(selected) >= 2:
                break
            if any(int(x["id"]) == int(drill["id"]) for x in selected):
                continue
            selected.append(
                {
                    "id": int(drill["id"]),
                    "name": drill.get("name"),
                    "category": drill.get("category"),
                    "skillFocus": drill.get("skillFocus"),
                    "videoUrls": drill.get("videoUrls"),
                    "imageUrls": drill.get("imageUrls"),
                    "rpe": drill.get("rpe"),
                    "minutes": 0,
                    "обосновка": _reason_sentence(
                        meta["reasons"],
                        f"Избрано като най-близко упражнение за фаза {targetPhase}.",
                    ),
                    "__score": meta["score"],
                    "__primary_match": meta["primaryMatch"],
                    "__secondary_match": meta["secondaryMatch"],
                    "__skills": meta["skills"],
                    "__duration": meta["durationTarget"],
                    "__phase": targetPhase,
                }
            )

    _allocate_minutes(targetMinutes, selected)
    return selected


def _replace_to_enforce_primary_ratio(
    phases_output: List[Dict[str, Any]],
    age_eligible_drills: Sequence[Dict[str, Any]],
    session_focus: Dict[str, str],
) -> None:
    primary = normalizeSkill(session_focus.get("primary"))
    if not primary:
        return

    def _all_selected() -> List[Dict[str, Any]]:
        items: List[Dict[str, Any]] = []
        for phase in phases_output:
            items.extend(phase.get("упражнения", []))
        return items

    selected = _all_selected()
    if not selected:
        return
    target_hits = int((len(selected) * 0.8) + 0.9999)
    current_hits = sum(1 for item in selected if item.get("__primary_match"))
    if current_hits >= target_hits:
        return

    used_ids = {int(item["id"]) for item in selected}
    for phase in phases_output:
        for idx, current in enumerate(phase.get("упражнения", [])):
            if current.get("__primary_match"):
                continue
            if current_hits >= target_hits:
                return
            phase_name = phase.get("име")
            replacements: List[Tuple[float, Dict[str, Any], Dict[str, Any]]] = []
            for drill in age_eligible_drills:
                if int(drill["id"]) in used_ids:
                    continue
                skills = _drill_skill_set(drill)
                if primary not in skills:
                    continue
                pseudo_state = PickedState(
                    selected=selected,
                    picked_ids=used_ids,
                    picked_skill_set=set(),
                    progression_skill_base=set(),
                    max_skill_count_so_far=1,
                    build_pair_ready=False,
                    recent_rank_by_id={},
                )
                meta = scoreDrill(drill, phase_name, session_focus, pseudo_state)
                replacements.append((meta["score"], drill, meta))
            if not replacements:
                continue
            replacements.sort(key=lambda item: item[0], reverse=True)
            _, replacement, meta = replacements[0]
            used_ids.discard(int(current["id"]))
            used_ids.add(int(replacement["id"]))
            phase["упражнения"][idx] = {
                "id": int(replacement["id"]),
                "name": replacement.get("name"),
                "category": replacement.get("category"),
                "skillFocus": replacement.get("skillFocus"),
                "videoUrls": replacement.get("videoUrls"),
                "imageUrls": replacement.get("imageUrls"),
                "rpe": replacement.get("rpe"),
                "minutes": current.get("minutes", 0),
                "обосновка": _reason_sentence(
                    meta["reasons"],
                    f"Заменено за да се покрие основният фокус {primary}.",
                ),
                "__score": meta["score"],
                "__primary_match": meta["primaryMatch"],
                "__secondary_match": meta["secondaryMatch"],
                "__skills": meta["skills"],
                "__duration": meta["durationTarget"],
                "__phase": phase_name,
            }
            selected = _all_selected()
            current_hits = sum(1 for item in selected if item.get("__primary_match"))


def _update_state_after_phase(phase_name: str, chosen: Sequence[Dict[str, Any]], state: PickedState) -> None:
    phase_skills: Set[str] = set()
    for item in chosen:
        state.selected.append(item)
        state.picked_ids.add(int(item["id"]))
        skills = set(item.get("__skills", []))
        phase_skills.update(skills)
        state.picked_skill_set.update(skills)
        state.max_skill_count_so_far = max(state.max_skill_count_so_far, len(skills))
        if phase_name == "Изграждане" and {"Посрещане", "Разпределение"}.issubset(skills) and len(skills) == 2:
            state.build_pair_ready = True

    if phase_skills:
        # Keep progression base compact so "contains previous skills + 1 new" is achievable.
        if len(phase_skills) > 3:
            ordered = [s for s in _SKILL_CANONICAL if s in phase_skills]
            state.progression_skill_base = set(ordered[:3])
        else:
            state.progression_skill_base = set(phase_skills)


def generateSessionPlan(drills: Sequence[Any], request_data: Dict[str, Any]) -> Dict[str, Any]:
    normalized_drills = [_drill_to_dict(d) for d in drills if int(_get_field(d, "id") or 0) > 0]

    session_age_min, session_age_max = _parse_age_range(request_data)
    total_minutes = int(request_data.get("totalMinutes") or request_data.get("durationTotalMin") or 90)
    primary = normalizeSkill(request_data.get("primaryFocus") or request_data.get("mainFocus"))
    secondary = normalizeSkill(request_data.get("secondaryFocus"))
    if not primary:
        fallback_focus = _split_values(request_data.get("focusSkills"))
        primary = normalizeSkill(fallback_focus[0]) if fallback_focus else "Посрещане"
    session_focus = {"primary": primary, "secondary": secondary}
    recent_rank_by_id = _build_recent_rank_map(request_data)

    age_eligible = [d for d in normalized_drills if _age_matches(d, session_age_min, session_age_max)]
    phase_minutes = _target_minutes(total_minutes)

    state = PickedState(
        selected=[],
        picked_ids=set(),
        picked_skill_set=set(),
        progression_skill_base=set(),
        max_skill_count_so_far=1,
        build_pair_ready=False,
        recent_rank_by_id=recent_rank_by_id,
    )

    phases_output: List[Dict[str, Any]] = []
    for phase_name in PHASES_BG:
        selected = selectDrillsForPhase(age_eligible, phase_name, phase_minutes[phase_name], session_focus, state)
        _update_state_after_phase(phase_name, selected, state)
        phases_output.append({"име": phase_name, "целевоВреме": int(phase_minutes[phase_name]), "упражнения": selected})

    _replace_to_enforce_primary_ratio(phases_output, age_eligible, session_focus)

    flat_selected = [item for phase in phases_output for item in phase.get("упражнения", [])]
    rpe_values = [int(item["rpe"]) for item in flat_selected if isinstance(item.get("rpe"), int)]
    duration_values = [int(item.get("minutes", 0)) for item in flat_selected if isinstance(item.get("minutes"), int)]
    skill_counts = [len(set(item.get("__skills", []))) for item in flat_selected]

    result = {
        "общоВреме": int(total_minutes),
        "фокус": {"основен": primary, "вторичен": secondary},
        "фази": phases_output,
        "резюмеНатоварване": {
            "средноRPE": round(sum(rpe_values) / len(rpe_values), 2) if rpe_values else 0,
            "среднаПродължителност": round(sum(duration_values) / len(duration_values), 2) if duration_values else 0,
            "среденБройУмения": round(sum(skill_counts) / len(skill_counts), 2) if skill_counts else 0,
        },
    }
    return result


def generate_training_session(drills_raw: Sequence[Any], request_data: Dict[str, Any]) -> Dict[str, Any]:
    bg_plan = generateSessionPlan(drills_raw, request_data)
    blocks: List[Dict[str, Any]] = []
    selected_count = 0
    primary = normalizeSkill((bg_plan.get("фокус") or {}).get("основен"))
    primary_hits = 0
    for phase in bg_plan.get("фази", []):
        drills_out: List[Dict[str, Any]] = []
        for item in phase.get("упражнения", []):
            selected_count += 1
            if item.get("__primary_match"):
                primary_hits += 1
            drills_out.append(
                {
                    "drillId": int(item.get("id")),
                    "name": item.get("name"),
                    "minutes": int(item.get("minutes", 0)),
                    "intensity_type": _safe_str(item.get("intensity_type", "medium")) or "medium",
                    "rpe": item.get("rpe"),
                    "category": item.get("category"),
                    "why": [item.get("обосновка")],
                    "score": item.get("__score", 0),
                    "scoreBreakdown": {},
                }
            )
        blocks.append(
            {
                "blockType": phase.get("име"),
                "targetMinutes": int(phase.get("целевоВреме", 0)),
                "drills": drills_out,
            }
        )

    for phase in bg_plan.get("фази", []):
        for item in phase.get("упражнения", []):
            item.pop("__score", None)
            item.pop("__primary_match", None)
            item.pop("__secondary_match", None)
            item.pop("__skills", None)
            item.pop("__duration", None)
            item.pop("__phase", None)

    primary_ratio = (primary_hits / selected_count) if selected_count else 0.0
    return {
        "общоВреме": bg_plan.get("общоВреме", 0),
        "фокус": bg_plan.get("фокус", {}),
        "фази": bg_plan.get("фази", []),
        "резюмеНатоварване": bg_plan.get("резюмеНатоварване", {}),
        "session": {
            "totalMinutes": int(bg_plan.get("общоВреме", 0)),
            "blocks": blocks,
            "checks": {
                "minutesOk": int(bg_plan.get("общоВреме", 0)) == int(request_data.get("durationTotalMin") or bg_plan.get("общоВреме", 0)),
                "primaryFocusRatioOk": primary_ratio >= 0.8 if primary else True,
                "primaryFocusRatio": round(primary_ratio, 3),
            },
        },
    }

