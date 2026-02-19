from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


BLOCK_ORDER = ["Warmup", "Technique", "Tactics", "Game", "Physical", "Cooldown"]
BLOCK_TO_PLAN_KEY = {
    "Warmup": "warmup",
    "Technique": "technique",
    "Tactics": "tactics",
    "Game": "game",
    "Physical": "conditioning",
    "Cooldown": "cooldown",
    "Активиране": "warmup",
    "Изграждане": "technique",
    "Интеграция": "serve_receive",
    "Състезателност": "game",
}
BG_PHASE_ORDER = ["Активиране", "Изграждане", "Интеграция", "Състезателност"]
INTENSITY_VALUE = {"low": 1, "medium": 2, "high": 3}

PERIOD_SPLITS = {
    "prep": {"Warmup": 0.12, "Technique": 0.31, "Tactics": 0.18, "Game": 0.18, "Physical": 0.13, "Cooldown": 0.08},
    "inseason": {"Warmup": 0.12, "Technique": 0.26, "Tactics": 0.22, "Game": 0.24, "Physical": 0.08, "Cooldown": 0.08},
    "taper": {"Warmup": 0.12, "Technique": 0.26, "Tactics": 0.22, "Game": 0.24, "Physical": 0.04, "Cooldown": 0.12},
    "offseason": {"Warmup": 0.12, "Technique": 0.30, "Tactics": 0.18, "Game": 0.20, "Physical": 0.08, "Cooldown": 0.12},
}

BLOCK_DEFAULT_DRILL_RANGE = {
    "Warmup": (5, 10),
    "Technique": (7, 14),
    "Tactics": (8, 16),
    "Game": (8, 16),
    "Physical": (6, 12),
    "Cooldown": (4, 8),
}

BLOCK_INTENSITY_MAX = {
    "Warmup": 2,
    "Technique": 3,
    "Tactics": 3,
    "Game": 3,
    "Physical": 3,
    "Cooldown": 2,
}

BLOCK_KEYWORDS = {
    "Warmup": ["warm", "загр", "activation", "mobility"],
    "Technique": ["tech", "техника", "passing", "setting", "service", "serve", "прием", "подав"],
    "Tactics": ["tactic", "тактик", "system", "rotation", "block-defense"],
    "Game": ["game", "игра", "scrimmage", "6v6", "rally"],
    "Physical": ["physical", "conditioning", "сил", "скорост", "jump"],
    "Cooldown": ["cool", "разпуск", "recovery", "stretch"],
}


def _safe_str(v: Any) -> str:
    return str(v).strip() if v is not None else ""


def _norm(v: Any) -> str:
    return _safe_str(v).lower()


def _split_tokens(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [_safe_str(x) for x in raw if _safe_str(x)]
    s = _safe_str(raw)
    if not s:
        return []
    for sep in ["|", ";", ",", "/", "\n"]:
        s = s.replace(sep, ",")
    return [x.strip() for x in s.split(",") if x.strip()]


def _is_unknown_text(v: Any) -> bool:
    s = _norm(v)
    return not s or s in {"няма данни", "unknown", "n/a", "-"}


def _normalize_intensity(v: Any) -> str:
    s = _norm(v)
    if s in {"high", "висок", "hard", "intense"}:
        return "high"
    if s in {"medium", "mid", "среден", "moderate"}:
        return "medium"
    return "low"


def _parse_players_bounds(v: Any) -> Tuple[Optional[int], Optional[int], bool]:
    s = _norm(v)
    if not s or s in {"няма данни", "unknown", "n/a", "-"}:
        return None, None, False
    nums: List[int] = []
    cur = ""
    for ch in s:
        if ch.isdigit():
            cur += ch
        elif cur:
            nums.append(int(cur))
            cur = ""
    if cur:
        nums.append(int(cur))
    if not nums:
        return None, None, False
    if len(nums) == 1:
        return nums[0], nums[0], True
    return min(nums), max(nums), True


def _duration_bounds(drill: Dict[str, Any], block_type: str) -> Tuple[int, int]:
    dmin_raw = drill.get("duration_min")
    dmax_raw = drill.get("duration_max")
    dmin = int(dmin_raw) if isinstance(dmin_raw, (int, float)) and dmin_raw > 0 else None
    dmax = int(dmax_raw) if isinstance(dmax_raw, (int, float)) and dmax_raw > 0 else None
    if dmin is None and dmax is None:
        return BLOCK_DEFAULT_DRILL_RANGE[block_type]
    if dmin is None:
        dmin = min(dmax, BLOCK_DEFAULT_DRILL_RANGE[block_type][0])
    if dmax is None:
        dmax = max(dmin, BLOCK_DEFAULT_DRILL_RANGE[block_type][1])
    if dmax < dmin:
        dmin, dmax = dmax, dmin
    return dmin, dmax


def _drill_to_dict(d: Any) -> Dict[str, Any]:
    if isinstance(d, dict):
        return {
            "id": int(d.get("id")),
            "name": _safe_str(d.get("title") or d.get("name") or f"Drill {d.get('id', '')}"),
            "category": d.get("category"),
            "level": d.get("level"),
            "skill_domains": d.get("skill_domains") or [],
            "game_phases": d.get("game_phases") or [],
            "tactical_focus": d.get("tactical_focus") or [],
            "technical_focus": d.get("technical_focus") or [],
            "position_focus": d.get("position_focus") or [],
            "zone_focus": d.get("zone_focus") or [],
            "complexity_level": d.get("complexity_level"),
            "decision_level": d.get("decision_level"),
            "age_min": d.get("age_min"),
            "age_max": d.get("age_max"),
            "intensity_type": d.get("intensity_type"),
            "rpe": d.get("rpe"),
            "duration_min": d.get("duration_min"),
            "duration_max": d.get("duration_max"),
            "equipment": d.get("equipment"),
            "players": d.get("players"),
            "type_of_drill": d.get("type_of_drill"),
            "training_goal": d.get("training_goal"),
            "description": d.get("description"),
        }
    return {
        "id": int(getattr(d, "id")),
        "name": _safe_str(getattr(d, "title", None) or getattr(d, "name", None) or f"Drill {getattr(d, 'id', '')}"),
        "category": getattr(d, "category", None),
        "level": getattr(d, "level", None),
        "skill_domains": getattr(d, "skill_domains", None) or [],
        "game_phases": getattr(d, "game_phases", None) or [],
        "tactical_focus": getattr(d, "tactical_focus", None) or [],
        "technical_focus": getattr(d, "technical_focus", None) or [],
        "position_focus": getattr(d, "position_focus", None) or [],
        "zone_focus": getattr(d, "zone_focus", None) or [],
        "complexity_level": getattr(d, "complexity_level", None),
        "decision_level": getattr(d, "decision_level", None),
        "age_min": getattr(d, "age_min", None),
        "age_max": getattr(d, "age_max", None),
        "intensity_type": getattr(d, "intensity_type", None),
        "rpe": getattr(d, "rpe", None),
        "duration_min": getattr(d, "duration_min", None),
        "duration_max": getattr(d, "duration_max", None),
        "equipment": getattr(d, "equipment", None),
        "players": getattr(d, "players", None),
        "type_of_drill": getattr(d, "type_of_drill", None),
        "training_goal": getattr(d, "training_goal", None),
        "description": getattr(d, "description", None),
    }


def _normalized_overlap(a: Iterable[str], b: Iterable[str]) -> int:
    sa = {_norm(x) for x in a if _norm(x)}
    sb = {_norm(x) for x in b if _norm(x)}
    return len(sa.intersection(sb))


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def _planned_blocks(duration_total: int, period_phase: str) -> List[Dict[str, Any]]:
    phase = period_phase if period_phase in PERIOD_SPLITS else "inseason"
    splits = PERIOD_SPLITS[phase]
    raw = {k: duration_total * splits[k] for k in BLOCK_ORDER}
    rounded = {k: int(round(raw[k])) for k in BLOCK_ORDER}
    diff = duration_total - sum(rounded.values())
    idx = 0
    while diff != 0 and idx < 100:
        key = BLOCK_ORDER[idx % len(BLOCK_ORDER)]
        rounded[key] += 1 if diff > 0 else -1
        diff += -1 if diff > 0 else 1
        idx += 1

    blocks = [{"blockType": k, "targetMinutes": max(4, rounded[k]), "drills": []} for k in BLOCK_ORDER]
    return [b for b in blocks if b["targetMinutes"] > 0]


def _target_intensity_cap(intensity_target: str) -> int:
    t = _normalize_intensity(intensity_target)
    if t == "low":
        return 1
    if t == "medium":
        return 2
    return 3


def hard_filter_drills(
    drills: Sequence[Dict[str, Any]],
    request_data: Dict[str, Any],
    block_type: str,
) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    age = int(request_data.get("age") or 0)
    level_req = _norm(request_data.get("level"))
    level_any = level_req in {"", "all", "all levels", "всички", "всички нива"}
    equipment_av = {_norm(x) for x in request_data.get("equipmentAvailable", []) if _norm(x)}
    players_count = int(request_data.get("playersCount") or 0)
    exclude = {int(x) for x in request_data.get("constraints", {}).get("excludeDrillIds", [])}

    cap_target = _target_intensity_cap(request_data.get("intensityTarget", "medium"))
    cap_block = BLOCK_INTENSITY_MAX.get(block_type, 3)
    cap = min(cap_target, cap_block)

    out: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for d in drills:
        if int(d["id"]) in exclude:
            continue

        d_age_min = d.get("age_min")
        d_age_max = d.get("age_max")
        if isinstance(d_age_min, int) and age and age < d_age_min:
            continue
        if isinstance(d_age_max, int) and age and age > d_age_max:
            continue

        d_level = _norm(d.get("level"))
        if (not level_any) and d_level and d_level not in {"всички нива", "all", "all levels"} and d_level != level_req:
            continue

        intensity = _normalize_intensity(d.get("intensity_type"))
        if INTENSITY_VALUE[intensity] > cap:
            continue
        if block_type in {"Warmup", "Cooldown"} and intensity == "high":
            continue

        equip_tokens = _split_tokens(d.get("equipment"))
        known_equipment = not _is_unknown_text(d.get("equipment"))
        if known_equipment and equipment_av:
            equip_norm = {_norm(x) for x in equip_tokens}
            if equip_norm and not equip_norm.issubset(equipment_av):
                continue

        pmin, pmax, has_players_req = _parse_players_bounds(d.get("players"))
        if has_players_req and players_count:
            if (pmin is not None and players_count < pmin) or (pmax is not None and players_count > pmax):
                continue

        out.append(
            (
                d,
                {
                    "unknown_equipment": not known_equipment,
                    "unknown_players": not has_players_req,
                    "intensity": intensity,
                },
            )
        )
    return out


def _relaxed_candidates_for_block(
    drills: Sequence[Dict[str, Any]],
    request_data: Dict[str, Any],
    block_type: str,
) -> List[Tuple[Dict[str, Any], Dict[str, Any]]]:
    age = int(request_data.get("age") or 0)
    level_req = _norm(request_data.get("level"))
    level_any = level_req in {"", "all", "all levels", "всички", "всички нива"}
    exclude = {int(x) for x in request_data.get("constraints", {}).get("excludeDrillIds", [])}
    cap_block = BLOCK_INTENSITY_MAX.get(block_type, 3)

    out: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []
    for d in drills:
        if int(d["id"]) in exclude:
            continue
        d_age_min = d.get("age_min")
        d_age_max = d.get("age_max")
        if isinstance(d_age_min, int) and age and age < d_age_min:
            continue
        if isinstance(d_age_max, int) and age and age > d_age_max:
            continue
        d_level = _norm(d.get("level"))
        if (not level_any) and d_level and d_level not in {"всички нива", "all", "all levels"} and d_level != level_req:
            continue
        intensity = _normalize_intensity(d.get("intensity_type"))
        if INTENSITY_VALUE[intensity] > cap_block:
            continue
        if block_type in {"Warmup", "Cooldown"} and intensity == "high":
            continue
        out.append(
            (
                d,
                {
                    "unknown_equipment": _is_unknown_text(d.get("equipment")),
                    "unknown_players": _is_unknown_text(d.get("players")),
                    "intensity": intensity,
                },
            )
        )
    return out


@dataclass
class SelectionState:
    used_drill_ids: Set[int]
    used_categories: List[str]
    used_tech_focus: List[str]
    used_tactical_focus: List[str]
    used_zone_focus: List[str]
    coverage_domains: Set[str]
    coverage_phases: Set[str]
    intensity_series: List[int]
    max_high_in_row: int
    avoid_repeat_same_category: bool


def _score_candidate(
    drill: Dict[str, Any],
    flags: Dict[str, Any],
    req: Dict[str, Any],
    block_type: str,
    block_target: int,
    state: SelectionState,
) -> Tuple[float, Dict[str, float], List[str]]:
    focus_skills = req.get("focusSkills", []) or []
    focus_domains = req.get("focusDomains", []) or []
    focus_phases = req.get("focusGamePhases", []) or []
    must_domains = req.get("constraints", {}).get("mustIncludeDomains", []) or []
    period = req.get("periodPhase", "inseason")

    drill_domains = _split_tokens(drill.get("skill_domains"))
    drill_phases = _split_tokens(drill.get("game_phases"))
    drill_tech = _split_tokens(drill.get("technical_focus"))
    drill_tact = _split_tokens(drill.get("tactical_focus"))
    drill_zone = _split_tokens(drill.get("zone_focus"))

    text_blend = " ".join(
        [
            _safe_str(drill.get("name")),
            _safe_str(drill.get("training_goal")),
            _safe_str(drill.get("description")),
            _safe_str(drill.get("type_of_drill")),
            _safe_str(drill.get("category")),
        ]
    ).lower()

    block_match = 0.25
    for kw in BLOCK_KEYWORDS.get(block_type, []):
        if kw in text_blend:
            block_match += 0.15
    block_match = _clamp01(block_match)

    domains_overlap = _normalized_overlap(drill_domains, focus_domains)
    phases_overlap = _normalized_overlap(drill_phases, focus_phases)
    skills_overlap = 0
    for fs in focus_skills:
        fsn = _norm(fs)
        if not fsn:
            continue
        if fsn in text_blend or fsn in {_norm(x) for x in drill_tech + drill_tact}:
            skills_overlap += 1
    goal_match = _clamp01((block_match * 0.5) + (min(domains_overlap, 2) * 0.2) + (min(phases_overlap, 2) * 0.2) + (min(skills_overlap, 2) * 0.1))

    intensity = flags["intensity"]
    intensity_val = INTENSITY_VALUE[intensity]
    target_val = _target_intensity_cap(req.get("intensityTarget", "medium"))
    intensity_fit = _clamp01(1.0 - (abs(min(target_val, 3) - intensity_val) * 0.35))
    if block_type == "Warmup" and intensity == "low":
        intensity_fit = min(1.0, intensity_fit + 0.2)
    if block_type == "Cooldown" and intensity == "low":
        intensity_fit = min(1.0, intensity_fit + 0.25)

    period_fit = 0.6
    category = _norm(drill.get("category"))
    if period == "prep":
        if block_type in {"Technique", "Physical"}:
            period_fit += 0.25
        if block_type == "Game":
            period_fit -= 0.1
    elif period == "inseason":
        if block_type in {"Game", "Tactics"}:
            period_fit += 0.2
    elif period == "taper":
        if intensity == "high":
            period_fit -= 0.25
        if block_type == "Physical":
            period_fit -= 0.2
    elif period == "offseason":
        if intensity == "low":
            period_fit += 0.2
        if "fun" in category or "игра" in category:
            period_fit += 0.1
    period_fit = _clamp01(period_fit)

    new_domains = {_norm(x) for x in drill_domains if _norm(x)} - state.coverage_domains
    new_phases = {_norm(x) for x in drill_phases if _norm(x)} - state.coverage_phases
    must_missing = {_norm(x) for x in must_domains if _norm(x)} - state.coverage_domains
    must_hit = len(must_missing.intersection({_norm(x) for x in drill_domains}))
    coverage_gain = _clamp01(min(len(new_domains), 3) * 0.22 + min(len(new_phases), 3) * 0.14 + min(must_hit, 2) * 0.28)

    diversity = 1.0
    if state.avoid_repeat_same_category and category and category in state.used_categories[-2:]:
        diversity -= 0.35
    tech_norm = [_norm(x) for x in drill_tech if _norm(x)]
    tact_norm = [_norm(x) for x in drill_tact if _norm(x)]
    zone_norm = [_norm(x) for x in drill_zone if _norm(x)]
    if set(tech_norm).intersection(state.used_tech_focus[-4:]):
        diversity -= 0.18
    if set(tact_norm).intersection(state.used_tactical_focus[-4:]):
        diversity -= 0.18
    if set(zone_norm).intersection(state.used_zone_focus[-4:]):
        diversity -= 0.1
    if int(drill["id"]) in state.used_drill_ids:
        diversity -= 0.8
    diversity = _clamp01(diversity)

    dmin, dmax = _duration_bounds(drill, block_type)
    ideal = max(5, block_target // 3)
    if ideal < dmin:
        duration_fit = _clamp01(1 - ((dmin - ideal) / max(dmin, 1)))
    elif ideal > dmax:
        duration_fit = _clamp01(1 - ((ideal - dmax) / max(ideal, 1)))
    else:
        duration_fit = 1.0

    if flags.get("unknown_equipment"):
        duration_fit = _clamp01(duration_fit - 0.05)
    if flags.get("unknown_players"):
        diversity = _clamp01(diversity - 0.08)

    weights = {
        "goal_match": 0.28,
        "period_fit": 0.12,
        "intensity_fit": 0.18,
        "coverage_gain": 0.2,
        "diversity": 0.12,
        "duration_fit": 0.1,
    }
    breakdown = {
        "goal_match": round(goal_match, 4),
        "period_fit": round(period_fit, 4),
        "intensity_fit": round(intensity_fit, 4),
        "coverage_gain": round(coverage_gain, 4),
        "diversity": round(diversity, 4),
        "duration_fit": round(duration_fit, 4),
    }
    score = (
        goal_match * weights["goal_match"]
        + period_fit * weights["period_fit"]
        + intensity_fit * weights["intensity_fit"]
        + coverage_gain * weights["coverage_gain"]
        + diversity * weights["diversity"]
        + duration_fit * weights["duration_fit"]
    )

    why: List[str] = []
    if domains_overlap:
        why.append(f"Matches focusDomains: {', '.join(sorted(set(_split_tokens(focus_domains)).intersection(set(drill_domains))))}")
    if phases_overlap:
        why.append(f"Matches focusGamePhases: {', '.join(sorted(set(_split_tokens(focus_phases)).intersection(set(drill_phases))))}")
    if must_hit:
        why.append(f"Helps mustIncludeDomains coverage: {', '.join(sorted(set(_split_tokens(must_domains)).intersection(set(drill_domains))))}")
    why.append(f"Fits {block_type} block with {flags['intensity']} intensity.")
    if period_fit >= 0.75:
        why.append(f"Compatible with periodPhase={period}.")
    if new_domains:
        why.append(f"Adds domain coverage: {', '.join(sorted(new_domains))}")
    if not why:
        why.append("Selected by balanced hybrid score.")

    return round(_clamp01(score), 6), breakdown, why


def _target_drill_count(block_minutes: int) -> int:
    if block_minutes <= 15:
        return 2
    if block_minutes <= 28:
        return 3
    if block_minutes <= 42:
        return 4
    return 5


def _would_break_intensity_constraints(state: SelectionState, intensity_value: int) -> bool:
    tail = state.intensity_series[-state.max_high_in_row :] if state.max_high_in_row > 0 else []
    if intensity_value == 3 and state.max_high_in_row > 0 and len(tail) == state.max_high_in_row and all(x == 3 for x in tail):
        return True

    seq = state.intensity_series + [intensity_value]
    if len(seq) >= 3 and seq[-1] >= 2 and seq[-2] >= 2 and seq[-3] >= 2:
        return True
    return False


def _allocate_minutes(block_type: str, block_target: int, selected: List[Dict[str, Any]]) -> None:
    if not selected:
        return
    mins = []
    maxs = []
    for item in selected:
        dmin, dmax = _duration_bounds(item["__drill"], block_type)
        mins.append(dmin)
        maxs.append(dmax)
    cur = mins[:]
    total = sum(cur)
    if total > block_target:
        cur = [max(1, int(round(block_target / len(selected)))) for _ in selected]
    else:
        i = 0
        while total < block_target and i < 500:
            idx = i % len(cur)
            if cur[idx] < maxs[idx]:
                cur[idx] += 1
                total += 1
            i += 1
            if all(cur[j] >= maxs[j] for j in range(len(cur))):
                break
    for idx, item in enumerate(selected):
        item["minutes"] = int(cur[idx])


def _coverage_from_blocks(blocks: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
    domain_counts: Dict[str, int] = {}
    phase_counts: Dict[str, int] = {}
    for b in blocks:
        for d in b.get("drills", []):
            for x in d.get("__domains", []):
                domain_counts[x] = domain_counts.get(x, 0) + 1
            for x in d.get("__phases", []):
                phase_counts[x] = phase_counts.get(x, 0) + 1
    return {"skill_domains": domain_counts, "game_phases": phase_counts}


def normalizeSkill(skill: Any) -> str:
    s = _norm(skill)
    if s in {"посрещане", "приемане", "serve receive", "serve-receive", "reception", "прием", "посрещ"}:
        return "посрещане"
    if s in {"разпределение", "пас", "разиграване", "setting", "set", "подаване"}:
        return "разпределение"
    return s


def inferPhase(drill: Dict[str, Any]) -> str:
    category = _norm(drill.get("category"))
    goal_desc = f"{_norm(drill.get('training_goal'))} {_norm(drill.get('description'))} {_norm(drill.get('goal'))}"

    if "загрявка" in category or "ловкост" in category:
        return "Активиране"
    if "основна фаза 1" in category or "техническа подготовка" in category:
        return "Изграждане"
    if "основна фаза 2" in category or "тактика" in category:
        return "Интеграция"
    if ("игрова ситуация" in category or "затваряне" in category) and any(
        kw in goal_desc for kw in ["точки", "гейм", "сет", "резултат"]
    ):
        return "Състезателност"

    if any(kw in goal_desc for kw in ["точки", "гейм", "сет", "резултат", "мач"]):
        return "Състезателност"
    if any(kw in category for kw in ["тех", "основна", "умение"]):
        return "Изграждане"
    return "Интеграция"


def _parse_age_input(age_input: Any) -> Tuple[int, int]:
    if isinstance(age_input, int):
        return age_input, age_input
    if isinstance(age_input, str):
        s = age_input.strip().replace(" ", "")
        if "-" in s:
            a, b = s.split("-", 1)
            try:
                x = int(a)
                y = int(b)
                return min(x, y), max(x, y)
            except Exception:
                pass
        try:
            n = int(s)
            return n, n
        except Exception:
            pass
    return 0, 99


def _drill_skill_text(drill: Dict[str, Any]) -> str:
    parts = [
        _safe_str(drill.get("skill_focus")),
        " ".join(_split_tokens(drill.get("technical_focus"))),
        " ".join(_split_tokens(drill.get("tactical_focus"))),
        " ".join(_split_tokens(drill.get("skill_domains"))),
        _safe_str(drill.get("name")),
        _safe_str(drill.get("training_goal")),
        _safe_str(drill.get("description")),
    ]
    return _norm(" ".join(parts))


def _age_matches(drill: Dict[str, Any], age_min_req: int, age_max_req: int) -> bool:
    dmin = drill.get("age_min")
    dmax = drill.get("age_max")
    if isinstance(dmin, int) and age_max_req < dmin:
        return False
    if isinstance(dmax, int) and age_min_req > dmax:
        return False
    return True


def _similar_name(a: str, b: str) -> bool:
    ta = {_norm(x) for x in a.split() if len(x) > 2}
    tb = {_norm(x) for x in b.split() if len(x) > 2}
    if not ta or not tb:
        return False
    inter = len(ta.intersection(tb))
    den = max(1, min(len(ta), len(tb)))
    return inter / den >= 0.7


def scoreDrill(
    drill: Dict[str, Any],
    phase_name: str,
    main_focus: str,
    secondary_focus: str,
    used_names: List[str],
    rng: Optional[Random] = None,
) -> Dict[str, Any]:
    inferred_phase = inferPhase(drill)
    text = _drill_skill_text(drill)
    main_norm = normalizeSkill(main_focus)
    secondary_norm = normalizeSkill(secondary_focus)

    main_match = bool(main_norm and main_norm in text)
    secondary_match = bool(secondary_norm and secondary_norm in text)
    phase_match = inferred_phase == phase_name

    score = 0.0
    if phase_match:
        score += 0.45
    if main_match:
        score += 0.35
    if secondary_match:
        score += 0.15

    name = _safe_str(drill.get("name"))
    if any(_similar_name(name.lower(), x.lower()) for x in used_names):
        score -= 0.35

    why: List[str] = []
    if phase_match:
        why.append(f"Подходящо за фаза: {phase_name}")
    if main_match:
        why.append(f"Покрива основен фокус: {main_focus}")
    if secondary_match:
        why.append(f"Покрива вторичен фокус: {secondary_focus}")
    if not why:
        why.append("Избрано по обща съвместимост с фаза и цели.")

    if rng is not None:
        # Tiny seed-based jitter to break ties reproducibly.
        score += rng.random() * 0.06

    return {
        "score": round(_clamp01(score), 6),
        "main_match": main_match,
        "secondary_match": secondary_match,
        "phase_match": phase_match,
        "why": why,
    }


def _target_minutes_per_phase(total_minutes: int) -> Dict[str, int]:
    pct = {
        "Активиране": 0.18,
        "Изграждане": 0.32,
        "Интеграция": 0.32,
        "Състезателност": 0.18,
    }
    raw = {k: int(round(total_minutes * v)) for k, v in pct.items()}
    diff = total_minutes - sum(raw.values())
    i = 0
    while diff != 0 and i < 100:
        k = BG_PHASE_ORDER[i % len(BG_PHASE_ORDER)]
        raw[k] += 1 if diff > 0 else -1
        diff += -1 if diff > 0 else 1
        i += 1
    return raw


def _allocate_phase_minutes(phase_target: int, drills: List[Dict[str, Any]]) -> None:
    if not drills:
        return
    base = max(3, phase_target // max(1, len(drills)))
    minutes = [base for _ in drills]
    total = sum(minutes)
    i = 0
    while total < phase_target and i < 300:
        idx = i % len(minutes)
        minutes[idx] += 1
        total += 1
        i += 1
    if total > phase_target:
        i = 0
        while total > phase_target and i < 300:
            idx = i % len(minutes)
            if minutes[idx] > 2:
                minutes[idx] -= 1
                total -= 1
            i += 1
    for idx, d in enumerate(drills):
        d["минути"] = int(minutes[idx])


def generateSessionPlan(drills: Sequence[Dict[str, Any]], request_data: Dict[str, Any]) -> Dict[str, Any]:
    age_min_req, age_max_req = _parse_age_input(request_data.get("age"))
    total_minutes = int(request_data.get("durationTotalMin") or 120)
    main_focus = _safe_str(request_data.get("mainFocus") or request_data.get("focus") or "")
    if not main_focus:
        focus_skills = request_data.get("focusSkills") or []
        main_focus = _safe_str(focus_skills[0] if focus_skills else "Посрещане")
    secondary_focus = _safe_str(request_data.get("secondaryFocus") or "")
    must_include_domains = {
        normalizeSkill(x) for x in (request_data.get("constraints", {}).get("mustIncludeDomains", []) or []) if _safe_str(x)
    }
    seed = int(request_data.get("randomSeed") if request_data.get("randomSeed") is not None else 42)
    rng = Random(seed)

    prepared: List[Dict[str, Any]] = []
    for d in drills:
        if not _age_matches(d, age_min_req, age_max_req):
            continue
        nd = dict(d)
        nd["phase"] = inferPhase(nd)
        prepared.append(nd)

    phase_targets = _target_minutes_per_phase(total_minutes)
    used_names: List[str] = []
    phases_output: List[Dict[str, Any]] = []
    all_selected: List[Dict[str, Any]] = []

    for phase_name in BG_PHASE_ORDER:
        candidates = [d for d in prepared if d.get("phase") == phase_name]
        if len(candidates) < 2:
            # fallback: use all age-eligible drills and let scoring prioritize best fit
            candidates = list(prepared)

        scored = []
        for d in candidates:
            scored_meta = scoreDrill(d, phase_name, main_focus, secondary_focus, used_names, rng=rng)
            scored.append((scored_meta["score"], d, scored_meta))
        scored.sort(key=lambda x: x[0], reverse=True)

        target_count = 2
        if phase_targets[phase_name] > 25:
            target_count = 3
        if phase_targets[phase_name] > 38:
            target_count = 4
        target_count = max(2, min(4, target_count))

        phase_selected: List[Dict[str, Any]] = []
        remaining = scored[:]
        while remaining and len(phase_selected) < target_count:
            # Choose from top pool (not only #1) for variability while keeping quality.
            pool_size = min(max(3, target_count + 2), len(remaining))
            pool = remaining[:pool_size]
            weights = [max(0.01, float(p[0])) for p in pool]
            chosen_idx = rng.choices(range(len(pool)), weights=weights, k=1)[0]
            _, d, meta = pool[chosen_idx]
            # remove chosen from remaining
            remaining = [x for x in remaining if int(x[1]["id"]) != int(d["id"])]
            if any(_similar_name(_safe_str(d.get("name")).lower(), _safe_str(x.get("име")).lower()) for x in phase_selected):
                continue
            out_drill = {
                "drillId": int(d["id"]),
                "име": d["name"],
                "минути": 0,
                "категория": d.get("category"),
                "интензитет": _normalize_intensity(d.get("intensity_type")),
                "why": meta["why"],
                "score": meta["score"],
                "main_match": meta["main_match"],
                "secondary_match": meta["secondary_match"],
                "__domains": [normalizeSkill(x) for x in _split_tokens(d.get("skill_domains")) if _safe_str(x)],
            }
            phase_selected.append(out_drill)
            used_names.append(_safe_str(d.get("name")))

        _allocate_phase_minutes(phase_targets[phase_name], phase_selected)
        all_selected.extend(phase_selected)
        phases_output.append(
            {
                "име": phase_name,
                "целевоВреме": int(phase_targets[phase_name]),
                "упражнения": phase_selected,
            }
        )

    # Ensure >=80% contain main focus.
    if all_selected:
        main_hits = sum(1 for d in all_selected if d.get("main_match"))
        ratio = main_hits / max(1, len(all_selected))
        if ratio < 0.8:
            main_norm = normalizeSkill(main_focus)
            focus_candidates = [d for d in prepared if main_norm and main_norm in _drill_skill_text(d)]
            focus_candidates.sort(key=lambda x: x.get("id", 0))
            for phase in phases_output:
                for idx, d in enumerate(phase["упражнения"]):
                    if d.get("main_match"):
                        continue
                    replacement = None
                    for cand in focus_candidates:
                        name = _safe_str(cand.get("name"))
                        if any(_similar_name(name.lower(), _safe_str(x.get("име")).lower()) for x in phase["упражнения"]):
                            continue
                        replacement = cand
                        break
                    if replacement is None:
                        continue
                    meta = scoreDrill(replacement, phase["име"], main_focus, secondary_focus, used_names, rng=rng)
                    phase["упражнения"][idx] = {
                        "drillId": int(replacement["id"]),
                        "име": replacement["name"],
                        "минути": d.get("минути", 0),
                        "категория": replacement.get("category"),
                        "интензитет": _normalize_intensity(replacement.get("intensity_type")),
                        "why": meta["why"],
                        "score": meta["score"],
                        "main_match": meta["main_match"],
                        "secondary_match": meta["secondary_match"],
                        "__domains": [normalizeSkill(x) for x in _split_tokens(replacement.get("skill_domains")) if _safe_str(x)],
                    }
                    break

    # Enforce mustIncludeDomains coverage (best effort).
    if must_include_domains:
        selected_domains = set()
        for ph in phases_output:
            for d in ph["упражнения"]:
                selected_domains.update(d.get("__domains", []))
        missing = must_include_domains - selected_domains
        if missing:
            for m in list(missing):
                repl = None
                for cand in prepared:
                    cand_domains = {normalizeSkill(x) for x in _split_tokens(cand.get("skill_domains")) if _safe_str(x)}
                    if m in cand_domains:
                        repl = cand
                        break
                if repl is None:
                    continue
                target_phase = next((p for p in phases_output if p["име"] == "Интеграция"), phases_output[-1])
                meta = scoreDrill(repl, target_phase["име"], main_focus, secondary_focus, used_names, rng=rng)
                candidate_out = {
                    "drillId": int(repl["id"]),
                    "име": repl["name"],
                    "минути": max(4, target_phase["целевоВреме"] // max(2, len(target_phase["упражнения"]) + 1)),
                    "категория": repl.get("category"),
                    "интензитет": _normalize_intensity(repl.get("intensity_type")),
                    "why": meta["why"] + [f"Добавено за mustIncludeDomains: {m}"],
                    "score": meta["score"],
                    "main_match": meta["main_match"],
                    "secondary_match": meta["secondary_match"],
                    "__domains": [normalizeSkill(x) for x in _split_tokens(repl.get("skill_domains")) if _safe_str(x)],
                }
                if len(target_phase["упражнения"]) < 4:
                    target_phase["упражнения"].append(candidate_out)
                else:
                    target_phase["упражнения"][-1] = candidate_out

    return {
        "общоВреме": total_minutes,
        "фокус": {"основен": main_focus, "вторичен": secondary_focus},
        "фази": phases_output,
    }


def _repair_must_include(blocks: List[Dict[str, Any]], eligible_by_block: Dict[str, List[Tuple[Dict[str, Any], Dict[str, Any]]]], req: Dict[str, Any], state: SelectionState) -> None:
    must_domains = {_norm(x) for x in req.get("constraints", {}).get("mustIncludeDomains", []) if _norm(x)}
    if not must_domains:
        return
    missing = must_domains - state.coverage_domains
    if not missing:
        return
    for domain in list(missing):
        for block in blocks:
            candidates = eligible_by_block.get(block["blockType"], [])
            match = None
            for drill, flags in candidates:
                d_domains = {_norm(x) for x in _split_tokens(drill.get("skill_domains")) if _norm(x)}
                if domain in d_domains and int(drill["id"]) not in state.used_drill_ids:
                    match = (drill, flags)
                    break
            if not match:
                continue
            drill, flags = match
            score, breakdown, why = _score_candidate(drill, flags, req, block["blockType"], block["targetMinutes"], state)
            insert = {
                "drillId": int(drill["id"]),
                "name": drill["name"],
                "minutes": 0,
                "intensity_type": _normalize_intensity(drill.get("intensity_type")),
                "rpe": drill.get("rpe"),
                "category": drill.get("category"),
                "why": why,
                "score": score,
                "scoreBreakdown": breakdown,
                "__drill": drill,
                "__domains": sorted({_norm(x) for x in _split_tokens(drill.get("skill_domains")) if _norm(x)}),
                "__phases": sorted({_norm(x) for x in _split_tokens(drill.get("game_phases")) if _norm(x)}),
            }
            if block["drills"]:
                block["drills"][-1] = insert
            else:
                block["drills"].append(insert)
            state.used_drill_ids.add(int(drill["id"]))
            state.coverage_domains.update(insert["__domains"])
            state.coverage_phases.update(insert["__phases"])
            missing = must_domains - state.coverage_domains
            if not missing:
                return


def generate_training_session(drills_raw: Sequence[Any], request_data: Dict[str, Any]) -> Dict[str, Any]:
    drills = [_drill_to_dict(d) for d in drills_raw]
    bg_plan = generateSessionPlan(drills, request_data)

    blocks = []
    coverage_domains: Dict[str, int] = {}
    coverage_phases: Dict[str, int] = {}
    for phase in bg_plan.get("фази", []):
        drills_out = []
        for d in phase.get("упражнения", []):
            drills_out.append(
                {
                    "drillId": int(d.get("drillId")),
                    "name": d.get("име"),
                    "minutes": int(d.get("минути", 0)),
                    "intensity_type": d.get("интензитет", "medium"),
                    "rpe": None,
                    "category": d.get("категория"),
                    "why": d.get("why", []),
                    "score": d.get("score", 0),
                    "scoreBreakdown": {},
                }
            )
            for dom in (d.get("__domains") or _split_tokens(d.get("категория"))):
                nd = _norm(dom)
                if nd:
                    coverage_domains[nd] = coverage_domains.get(nd, 0) + 1
            phase_key = _norm(phase.get("име"))
            coverage_phases[phase_key] = coverage_phases.get(phase_key, 0) + 1

        blocks.append(
            {
                "blockType": phase.get("име"),
                "targetMinutes": int(phase.get("целевоВреме", 0)),
                "drills": drills_out,
            }
        )

    total_minutes = int(bg_plan.get("общоВреме", 0))
    seq = []
    for b in blocks:
        for d in b.get("drills", []):
            seq.append(INTENSITY_VALUE[_normalize_intensity(d.get("intensity_type"))])
    max_high = max(1, int(request_data.get("constraints", {}).get("maxHighIntensityInRow") or 2))
    progression_ok = True
    for i in range(len(seq)):
        if seq[i] == 3 and i + 1 >= max_high and all(x == 3 for x in seq[i + 1 - max_high : i + 1]):
            progression_ok = False
            break
        if i >= 2 and seq[i] >= 2 and seq[i - 1] >= 2 and seq[i - 2] >= 2:
            progression_ok = False
            break

    return {
        "общоВреме": total_minutes,
        "фокус": bg_plan.get("фокус", {}),
        "фази": bg_plan.get("фази", []),
        "session": {
            "totalMinutes": total_minutes,
            "blocks": blocks,
            "checks": {
                "minutesOk": total_minutes == int(request_data.get("durationTotalMin") or total_minutes),
                "intensityProgressionOk": progression_ok,
                "coverage": {"skill_domains": coverage_domains, "game_phases": coverage_phases},
            },
        },
    }

