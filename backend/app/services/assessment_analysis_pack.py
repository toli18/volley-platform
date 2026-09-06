"""AI пакет за анализ на тестове: дефицити, потенциал, архетипи, насоки за треньора.

Ползва вече записаните сесии/прозорци + scouting overlays. Не пише в базата.
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    DevelopmentScore,
    Team,
    TestDefinition,
)
from app.services.assessment_generator_bridge import (
    TEST_TO_DOMAIN,
    build_team_diagnosis,
    find_deficits,
)
from app.services.assessment_scoring import age_band_from_birth_year, window_sort_key
from app.services.scouting_service import build_scouting_table


def _latest_team_session(db: Session, team_id: int) -> Optional[AssessmentSession]:
    rows = (
        db.query(AssessmentSession)
        .filter(AssessmentSession.team_id == int(team_id))
        .all()
    )
    if not rows:
        return None

    # Prefer sessions that have results
    with_results = []
    for s in rows:
        n = (
            db.query(AssessmentResult.id)
            .filter(AssessmentResult.session_id == s.id)
            .limit(1)
            .first()
        )
        if n:
            with_results.append(s)
    use = with_results or rows

    def sort_key(s: AssessmentSession):
        w = db.query(AssessmentWindow).filter(AssessmentWindow.id == s.window_id).first()
        status = str(getattr(s.status, "value", s.status) or "")
        finalized = 1 if status == "finalized" else 0
        return (finalized, window_sort_key(w) if w else (0, 0, ""))

    return sorted(use, key=sort_key)[-1]


# Светофар върху нормализиран 0–100 / peer %
_RYG = (
    (40.0, "red", "основен дефицит"),
    (60.0, "yellow", "вторичен дефицит"),
    (101.0, "green", "силна страна"),
)


def _ryg(value: Optional[float]) -> dict[str, str]:
    if value is None:
        return {"level": "white", "label": "няма данни"}
    for threshold, level, label in _RYG:
        if float(value) < threshold:
            return {"level": level, "label": label}
    return {"level": "green", "label": "силна страна"}


def _dev_scores_for_athletes(
    db: Session, athlete_ids: list[int]
) -> dict[int, list[dict[str, Any]]]:
    if not athlete_ids:
        return {}
    rows = (
        db.query(DevelopmentScore, AssessmentWindow)
        .join(AssessmentWindow, AssessmentWindow.id == DevelopmentScore.window_id)
        .filter(DevelopmentScore.athlete_id.in_(athlete_ids))
        .all()
    )
    by_ath: dict[int, list[tuple]] = {}
    for ds, window in rows:
        by_ath.setdefault(int(ds.athlete_id), []).append((window_sort_key(window), ds, window))
    out: dict[int, list[dict[str, Any]]] = {}
    for aid, items in by_ath.items():
        items.sort(key=lambda x: x[0])
        out[aid] = [
            {
                "windowId": w.id,
                "season": w.season,
                "phase": w.phase.value if hasattr(w.phase, "value") else str(w.phase),
                "developmentScore": ds.development_score,
                "technical": ds.technical_subindex,
                "physical": ds.physical_subindex,
                "delta": ds.delta,
            }
            for _, ds, w in items
        ]
    return out


def _athlete_test_means(
    db: Session, athlete_id: int, window: AssessmentWindow
) -> dict[str, Optional[float]]:
    rows = (
        db.query(AssessmentResult.test_code, AssessmentResult.normalized)
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .filter(
            AssessmentSession.window_id == window.id,
            AssessmentResult.athlete_id == athlete_id,
            AssessmentResult.normalized.isnot(None),
        )
        .all()
    )
    tech_vals: list[float] = []
    phys_vals: list[float] = []
    speed = jump = approach = None
    for code, norm in rows:
        v = float(norm)
        domain = TEST_TO_DOMAIN.get(code)
        if domain in {"Посрещане", "Разпределение", "Сервис", "Атака"}:
            tech_vals.append(v)
        if domain == "Координация" or str(code).startswith("PHYS_") or code == "SPEED_9363":
            phys_vals.append(v)
        if code == "SPEED_9363":
            speed = v
        if code in {"PHYS_JUMP_1ARM", "PHYS_JUMP_2ARM", "PHYS_LONGJUMP"}:
            jump = max(jump or 0.0, v) if jump is not None else v
        if code == "PHYS_JUMP_APPROACH":
            approach = v
    return {
        "techMean": round(sum(tech_vals) / len(tech_vals), 1) if tech_vals else None,
        "physMean": round(sum(phys_vals) / len(phys_vals), 1) if phys_vals else None,
        "speedPeer": speed,
        "jumpPeer": jump,
        "approachPeer": approach,
    }


_TEST_LABELS = {
    "ANTH_HEIGHT": "Ръст",
    "ANTH_WEIGHT": "Тегло",
    "ANTH_REACH": "Разтег",
    "TECH_PASS_TOP": "Подаване отгоре",
    "TECH_PASS_BOT": "Подаване отдолу",
    "TECH_SERVE": "Начален удар",
    "TECH_ATTACK": "Нападение в цел",
    "SPEED_9363": "Бързина 9-3-6-3-9",
    "PHYS_MEDBALL": "Медбол 3 кг",
    "PHYS_LONGJUMP": "Дълъг скок",
    "PHYS_JUMP_1ARM": "Отскок 1 ръка",
    "PHYS_JUMP_2ARM": "Отскок 2 ръце",
    "PHYS_JUMP_APPROACH": "Отскок след засилване",
}


def _peer_of(cells: list, code: str) -> Optional[float]:
    for c in cells:
        if c.test_code == code and c.peer_percentile is not None:
            return float(c.peer_percentile)
    return None


def _raw_of(cells: list, code: str) -> Optional[float]:
    for c in cells:
        if c.test_code == code and c.raw_value is not None:
            return float(c.raw_value)
    return None


def _classify_archetype_from_peers(peers: dict[str, Optional[float]], tech_mean: Optional[float], phys_mean: Optional[float]) -> dict[str, str]:
    speed = peers.get("SPEED_9363")
    jump = max(
        [v for v in (peers.get("PHYS_JUMP_1ARM"), peers.get("PHYS_JUMP_2ARM"), peers.get("PHYS_LONGJUMP")) if v is not None],
        default=None,
    )
    approach = peers.get("PHYS_JUMP_APPROACH")
    pass_bot = peers.get("TECH_PASS_BOT")
    pass_top = peers.get("TECH_PASS_TOP")

    def ok(v: Optional[float], lo: float = 60) -> bool:
        return v is not None and float(v) >= lo

    def weak(v: Optional[float], hi: float = 35) -> bool:
        return v is not None and float(v) < hi

    phys_strong = ok(phys_mean, 65) or (ok(speed) and ok(jump))
    tech_strong = ok(tech_mean, 60) or (ok(pass_bot) and ok(pass_top, 50))
    tech_weak = weak(tech_mean, 45) or (
        peers.get("TECH_PASS_BOT") is None and peers.get("TECH_PASS_TOP") is None and phys_strong
    )

    if phys_strong and tech_weak:
        return {
            "code": "A",
            "title": "Физически готов — трябва техника",
            "formula": "Не добавяй ОФП час. Превърни качествата във волейбол: пас/сервис/атака + игрови трансфер.",
        }
    if tech_strong and (weak(speed) or weak(phys_mean, 45)):
        return {
            "code": "B",
            "title": "Технически добър — физически изостава",
            "formula": "Дръж техниката + 2× седмично скорост/експлозивност (кратки плио блокове).",
        }
    if ok(jump, 70) and (weak(approach) or weak(speed)):
        return {
            "code": "C",
            "title": "Добър скок — лош подход/трансфер",
            "formula": "Не трупай скокове. Верига: разбег → последни 2 → махане → вертикален импулс.",
        }
    if weak(phys_mean, 35) and (tech_mean is None or weak(tech_mean, 40)):
        return {
            "code": "D",
            "title": "Обща двигателна база",
            "formula": "Игри + координация 10–15 мин, после 1 волейболен жест. Следи % подобрение, не ранг.",
        }
    if phys_strong and tech_strong:
        return {
            "code": "E",
            "title": "Готов профил — специализация",
            "formula": "Поддържай силните; диференцирай роля и атака/темпо.",
        }
    return {
        "code": "X",
        "title": "Смесен / непълен профил",
        "formula": "Попълни липсващите тестове; 1 основен дефицит + 1 силна страна.",
    }


def _insight_blurb(peers: dict[str, Optional[float]], primary: str) -> str:
    """Кратък коментар „като колега“ — защо този приоритет."""
    speed = peers.get("SPEED_9363")
    longj = peers.get("PHYS_LONGJUMP")
    j1 = peers.get("PHYS_JUMP_1ARM")
    j2 = peers.get("PHYS_JUMP_2ARM")
    approach = peers.get("PHYS_JUMP_APPROACH")
    med = peers.get("PHYS_MEDBALL")
    pass_bot = peers.get("TECH_PASS_BOT")

    if primary == "скорост":
        bits = []
        if j2 is not None and j2 >= 70:
            bits.append("вертикалният скок е добър — проблемът е първото движение, не „слабост“")
        if longj is not None and longj < 40 and j2 is not None and j2 >= 60:
            bits.append("слаб broad jump при добър вертикал → провери техниката на теста")
        return (
            "Интересен профил: " + ("; ".join(bits) if bits else "скоростта е основният лимит спрямо връстниците") + "."
        )
    if primary == "техника на отскока":
        return (
            "Не бих го/я карал с много скокове. Първо приземяване → squat-to-jump → подход; "
            "обемът идва след качеството."
        )
    if primary == "подход/отскок техника":
        return (
            "Вероятно техника на подхода, не липса на сила — двукракият/едноръчният "
            f"({int(j2) if j2 is not None else '—'}% / {int(j1) if j1 is not None else '—'}%) "
            f"срещу approach {int(approach) if approach is not None else '—'}%."
        )
    if primary == "атака":
        return "Физиката/техниката на пас вече са база — инвестирай в волейболна ефективност на атака, не в още кондиция."
    if primary == "техника (измери + тренирай)":
        return (
            "Физически готов спрямо връстниците — още 30 мин кондиция няма да помогне. "
            "Първо измери техниката, после специализация."
        )
    if primary == "посрещане":
        return "Физиката може да е добра — първият въпрос е дали я превръща в стабилно посрещане."
    if primary == "горна част / хвърляне (леко)":
        return "Бърз/подвижен, но medicine ball е слаб — лека горна работа + раменен контрол, без тежести."
    if primary == "скокова база":
        return "Започни от landing и качество на скока; тежести не са основен метод за тази възраст."
    if primary == "хоризонтална експлозивност / broad jump":
        return "Вертикал и/или скорост са по-добри от хоризонталния скок — работи техника + трансфер, не само „още скокове“."
    if primary == "обща двигателна база":
        return (
            "Ниските резултати са начална точка, не присъда. Следи % подобрение след 3 месеца, не само ранг в групата."
        )
    if pass_bot is not None and pass_bot >= 70 and primary in {"скорост", "скокова база"}:
        return "Запази добрата техника на подаване; развивай движението без да я „чупиш“."
    if med is not None and speed is not None:
        return f"Баланс: speed {int(speed)}% · medball {int(med)}% — тренирай дефицита, поддържай силната страна."
    return "Фокус върху основния дефицит 2× седмично; силните страни се поддържат, не се претоварват."


def _green_strengths(peers: dict[str, Optional[float]]) -> list[str]:
    out = []
    for code, label in _TEST_LABELS.items():
        pp = peers.get(code)
        if pp is not None and pp >= 70 and code.startswith(("PHYS_", "SPEED_", "TECH_")):
            out.append(f"{label} {int(pp)}%")
    return out[:4]


def _microplan_for_athlete(
    *,
    age_band: Optional[str],
    peers: dict[str, Optional[float]],
    archetype: dict[str, str],
) -> dict[str, Any]:
    """Конкретни упражнения (вкл. плио) — 2× седмично блок."""
    ab = (age_band or "U12").upper()
    young = ab in {"U8", "U9", "U10"}
    block_min = "10–15" if young else "15–25"

    speed = peers.get("SPEED_9363")
    longj = peers.get("PHYS_LONGJUMP")
    j1 = peers.get("PHYS_JUMP_1ARM")
    j2 = peers.get("PHYS_JUMP_2ARM")
    approach = peers.get("PHYS_JUMP_APPROACH")
    med = peers.get("PHYS_MEDBALL")
    pass_bot = peers.get("TECH_PASS_BOT")
    pass_top = peers.get("TECH_PASS_TOP")
    serve = peers.get("TECH_SERVE")
    attack = peers.get("TECH_ATTACK")
    weight = peers.get("ANTH_WEIGHT")

    primary = "координация"
    secondary = None
    notes: list[str] = []
    if weight is not None and weight >= 95 and ab.startswith("U1") and ab <= "U13":
        # anomaly flag for absurd weight percentile with young age - check raw separately
        pass

    # Priority logic (peer %)
    if speed is not None and speed < 35:
        primary = "скорост"
    elif approach is not None and approach < 35 and (
        (j2 is not None and j2 >= 60) or (j1 is not None and j1 >= 60) or (longj is not None and longj >= 60)
    ):
        primary = "подход/отскок техника"
    elif longj is not None and longj < 35 and (
        (j2 is not None and j2 >= 60) or (speed is not None and speed >= 60)
    ):
        primary = "хоризонтална експлозивност / broad jump"
    elif (j1 is not None and j1 < 35) or (j2 is not None and j2 < 35) or (longj is not None and longj < 35):
        if (speed is not None and speed >= 70) or (med is not None and med >= 70):
            primary = "техника на отскока"
        else:
            primary = "скокова база"
    elif med is not None and med < 30 and (speed is not None and speed >= 60):
        primary = "горна част / хвърляне (леко)"
    elif pass_bot is not None and pass_bot < 35:
        primary = "посрещане"
    elif pass_top is not None and pass_top < 35:
        primary = "подаване отгоре"
    elif attack is not None and attack < 40 and archetype.get("code") in {"A", "E"}:
        primary = "атака"
    elif archetype.get("code") == "A":
        primary = "техника (измери + тренирай)"
    elif archetype.get("code") == "D":
        primary = "обща двигателна база"

    if primary == "скорост" and (
        (j2 is not None and j2 < 40) or (longj is not None and longj < 40)
    ):
        secondary = "скокова база"
    elif primary in {"посрещане", "подаване отгоре"} and speed is not None and speed < 40:
        secondary = "скорост до топката"
    elif primary == "подход/отскок техника":
        secondary = "волейболен трансфер (пас→подход)"
    elif primary == "техника на отскока":
        secondary = "подход без максимален обем скокове"
    elif primary == "атака":
        secondary = "подход + контакт пред тялото"

    missing_tech = [
        _TEST_LABELS[c]
        for c in ("TECH_PASS_BOT", "TECH_PASS_TOP", "TECH_SERVE", "TECH_ATTACK")
        if peers.get(c) is None
    ]
    if missing_tech:
        notes.append("⚪ Липсват: " + ", ".join(missing_tech) + " — измери преди специализация.")

    # Exercise blocks
    drills: list[str] = []
    if primary == "скорост":
        drills = [
            "5×5 m ускорение по сигнал",
            "4×8–10 m ускорение",
            "4× реакция (цвят/номер/топка)",
            "4× lateral shuffle",
            "3× sprint→stop",
            "3×4 broad jump (качество, не брой)",
        ]
        if not young:
            drills.append("5 мин хвърляне/хващане в движение")
    elif primary == "техника на отскока":
        drills = [
            "3×5 правилно приземяване",
            "3×5 squat-to-jump",
            "3×4 broad jump",
            "3×5 вертикален скок с мах на ръце",
            "3×5 подход без скок",
            "3×4 подход + нисък скок",
        ]
    elif primary == "подход/отскок техника":
        drills = [
            "3×5 approach footwork",
            "3×5 последни две стъпки (спираща)",
            "3×4 подход + мах на ръце",
            "3×4 подход + скок",
            "3×4 подход + хвърлена топка",
            "landing 3×5",
        ]
    elif primary == "хоризонтална експлозивност / broad jump":
        drills = [
            "landing 3×5",
            "3×4 broad jump техника",
            "3×5 squat jump",
            "5×5 m ускорение",
            "4× lateral shuffle",
            "3× sprint→stop",
        ]
    elif primary == "скокова база":
        drills = [
            "landing 3×5",
            "3×4 broad jump",
            "3×4 squat jump",
            "3×5 вертикален скок с мах",
            "3×5 approach footwork",
            "5×5 m ускорение",
        ]
    elif primary == "горна част / хвърляне (леко)":
        drills = [
            "хвърляне от гърди с лека топка 3×8",
            "overhead throw (подходяща възрастта топка) 3×6",
            "хвърляне/хващане 5 мин",
            "раменен контрол 3×8",
            "overhead pass 3×12",
            "3×4 broad jump",
        ]
    elif primary == "посрещане":
        drills = [
            "3×20 underhand platform",
            "3×15 след движение",
            "20–30 сервиса към него",
            "target passing (конуси)",
            "5×5 m + пас",
            "3×4 approach (лека плио връзка)",
        ]
    elif primary == "подаване отгоре":
        drills = [
            "3×15 overhead pass",
            "3×12 overhead след движение",
            "high ball control 5 мин",
            "pass → attack approach 3×5",
            "5×5 m реакция",
            "3×4 broad jump",
        ]
    elif primary == "атака":
        drills = [
            "approach rhythm 3×5",
            "penultimate + последна стъпка 3×5",
            "arm swing 3×8",
            "контакт пред тялото 3×6",
            "атака към зона 4 / зона 2",
            "вариране на посоката 3×4",
        ]
    elif primary == "техника (измери + тренирай)":
        drills = [
            "измери: отгоре/отдолу/сервис/атака",
            "после: 2× техника по най-слабото",
            "approach 3×5 (поддръжка)",
            "игров трансфер 10 мин",
        ]
    else:  # обща база / координация
        drills = [
            "5 мин footwork / игри",
            "4× реакция",
            "5×5 m",
            "landing 3×4",
            "3×4 broad jump",
            "хвърляне/хващане 5 мин",
            "1 волейболен жест (пас или подход)",
        ]

    structure = (
        f"2× седмично × {block_min} мин: "
        "5 мин координация/движение → 5–10 мин основен дефицит → 5–10 мин волейболен трансфер."
    )
    return {
        "primary": primary,
        "secondary": secondary,
        "blockMinutes": block_min,
        "structure": structure,
        "drills": drills,
        "notes": notes,
        "insight": _insight_blurb(peers, primary),
        "strengths": _green_strengths(peers),
        "after3m": "След 3 месеца: преизмери същите тестове; следи % подобрение, не само ранг.",
        "after6_12m": "6–12 месеца: добави верига реакция→движение→топка / пас→подход→атака според възрастта.",
    }


def build_assessment_analysis_pack(
    db: Session,
    team: Team,
    *,
    max_athletes: int = 28,
) -> Optional[dict[str, Any]]:
    """Пълен пакет за Gemini / чат: отбор + играчи + архетипи + микропланове + наратив."""
    session = _latest_team_session(db, int(team.id))
    if not session:
        return None

    window = db.query(AssessmentWindow).filter(AssessmentWindow.id == session.window_id).first()
    diagnosis = build_team_diagnosis(db, session)
    athlete_ids = [int(a["athlete_id"]) for a in (diagnosis.get("athletes") or [])]
    if not athlete_ids:
        return {
            "teamId": team.id,
            "teamName": team.name,
            "sessionId": session.id,
            "window": None,
            "empty": True,
            "message": "Има сесия, но няма нормализирани резултати за анализ.",
            "promptText": "",
            "narrativeReport": "",
        }

    athletes = db.query(Athlete).filter(Athlete.id.in_(athlete_ids)).all()
    by_id = {a.id: a for a in athletes}
    dev_map = _dev_scores_for_athletes(db, athlete_ids)

    tests = db.query(TestDefinition).order_by(TestDefinition.id.asc()).all()
    scout_rows = build_scouting_table(db, athletes=athletes, tests=tests) if tests else []
    scout_by_id = {r.athlete_id: r for r in scout_rows}

    profiles: list[dict[str, Any]] = []
    archetype_buckets: dict[str, list[str]] = {}

    for row in (diagnosis.get("athletes") or [])[:max_athletes]:
        aid = int(row["athlete_id"])
        ath = by_id.get(aid)
        if not ath or not window:
            continue
        means = _athlete_test_means(db, aid, window)
        deficits = row.get("deficits") or find_deficits(db, aid, window)
        traffic = []
        for d in deficits:
            ryg = _ryg(d.get("normalized"))
            traffic.append({"domain": d["domain"], "normalized": d["normalized"], **ryg})

        srow = scout_by_id.get(aid)
        cells = list(getattr(srow, "cells", None) or []) if srow else []
        peers: dict[str, Optional[float]] = {}
        profile_lines: list[str] = []
        for code, label in _TEST_LABELS.items():
            pp = _peer_of(cells, code)
            raw = _raw_of(cells, code)
            peers[code] = pp
            if pp is None and raw is None:
                continue
            ryg = _ryg(pp)
            bit = f"{label}: {int(pp)}%" if pp is not None else f"{label}: измерено"
            if raw is not None and code == "ANTH_WEIGHT" and raw > 120 and (ath.birth_year or 2015) > 2010:
                bit += f" (сурово {raw:g} — вероятна грешка при въвеждане; игнорирай за решения)"
            profile_lines.append(f"{bit} [{ryg['level']}]")

        age_band = age_band_from_birth_year(ath.birth_year) if ath.birth_year else None
        archetype = _classify_archetype_from_peers(peers, means.get("techMean"), means.get("physMean"))
        plan = _microplan_for_athlete(age_band=age_band, peers=peers, archetype=archetype)
        name = ath.athlete_name
        archetype_buckets.setdefault(archetype["code"], []).append(
            name.split()[0] if name else str(aid)
        )

        history = dev_map.get(aid) or []
        profiles.append(
            {
                "athleteId": aid,
                "name": name,
                "ageBand": age_band,
                "mainFocus": row.get("main_focus"),
                "secondaryFocus": row.get("secondary_focus"),
                "traffic": traffic[:6],
                "means": means,
                "peers": peers,
                "profileLines": profile_lines,
                "archetype": archetype,
                "plan": plan,
                "developmentHistory": history[-4:],
                "latestDelta": history[-1].get("delta") if history else None,
            }
        )

    # sort by age band then name for narrative
    def _age_key(p: dict) -> tuple:
        ab = str(p.get("ageBand") or "U99")
        return (ab, str(p.get("name") or ""))

    profiles.sort(key=_age_key)

    team_domains = []
    for d in diagnosis.get("domains") or []:
        team_domains.append(
            {
                "domain": d["domain"],
                "meanNormalized": d.get("mean_normalized"),
                "deficitCount": d.get("deficit_count"),
                "isTeamDeficit": d.get("is_team_deficit"),
                **_ryg(d.get("mean_normalized")),
            }
        )

    pack = {
        "teamId": team.id,
        "teamName": team.name,
        "sessionId": session.id,
        "window": {
            "id": window.id if window else None,
            "season": getattr(window, "season", None),
            "phase": (
                window.phase.value if window and hasattr(window.phase, "value") else str(getattr(window, "phase", ""))
            ),
        },
        "athleteCount": len(profiles),
        "teamDomains": team_domains,
        "mainFocus": diagnosis.get("main_focus"),
        "secondaryFocus": diagnosis.get("secondary_focus"),
        "archetypeGroups": [
            {
                "code": code,
                "athletes": names[:10],
                "title": next(
                    (p["archetype"]["title"] for p in profiles if p["archetype"]["code"] == code),
                    code,
                ),
                "formula": next(
                    (p["archetype"]["formula"] for p in profiles if p["archetype"]["code"] == code),
                    "",
                ),
            }
            for code, names in sorted(archetype_buckets.items())
        ],
        "athletes": profiles,
        "generateRequest": diagnosis.get("generate_request") or {},
        "empty": False,
    }
    pack["narrativeReport"] = _build_narrative_report(pack)
    pack["promptText"] = _format_prompt(pack)
    return pack


def _build_narrative_report(pack: dict[str, Any]) -> str:
    """Пълен доклад в стил ChatGPT: всеки състезател + плио/упражнения."""
    n = pack.get("athleteCount") or 0
    lines = [
        f"Пълен анализ на тестовете — {pack.get('teamName')} ({n} състезатели с данни).",
        "",
        "🔴 основен дефицит — приоритет; 🟡 вторичен; 🟢 силна страна; ⚪ няма данни (не = слабо).",
        "Критерий: процентили спрямо връстниците (не само „талант“).",
        "",
        "Основна схема 6–12 месеца",
        "• U11–U13: 2 индивидуализирани блока седмично по 15–25 мин.",
        "• U9–U10: 2 блока по 10–15 мин, предимно чрез игри.",
        "• Всеки блок: 5 мин координация → 5–10 мин основен дефицит → 5–10 мин волейболен трансфер.",
        "• На ~3 месеца повторно измерване.",
        "",
    ]
    for d in pack.get("teamDomains") or []:
        lines.append(
            f"Отбор [{d.get('level')}] {d.get('domain')}: mean {d.get('meanNormalized')} "
            f"(дефицит при {d.get('deficitCount')})"
        )
    lines.append(
        f"Общ приоритет: {pack.get('mainFocus') or '—'} / {pack.get('secondaryFocus') or '—'}."
    )
    lines.append("")

    current_band = None
    idx = 0
    for a in pack.get("athletes") or []:
        band = a.get("ageBand") or "?"
        if band != current_band:
            current_band = band
            lines.append(f"—— {band} ——")
            lines.append("")
        idx += 1
        plan = a.get("plan") or {}
        arch = a.get("archetype") or {}
        lines.append(f"{idx}. {a.get('name')} — {band}")
        lines.append(f"Тип {arch.get('code')}: {arch.get('title')}")
        if a.get("profileLines"):
            lines.append("Профил: " + "; ".join(a["profileLines"][:12]))
        if plan.get("insight"):
            lines.append(plan["insight"])
        if plan.get("strengths"):
            lines.append("🟢 Силни: " + ", ".join(plan["strengths"]))
        lines.append(f"🔴 6–12м цел: {plan.get('primary')}")
        if plan.get("secondary"):
            lines.append(f"🟡 Паралелно: {plan.get('secondary')}")
        lines.append(plan.get("structure") or "")
        lines.append("Упражнения / плиометрия сега (2× седмично):")
        for dr in plan.get("drills") or []:
            lines.append(f"  • {dr}")
        for note in plan.get("notes") or []:
            lines.append(note)
        lines.append(plan.get("after3m") or "")
        lines.append(plan.get("after6_12m") or "")
        lines.append("")

    lines.append("Групови закономерности")
    for g in pack.get("archetypeGroups") or []:
        lines.append(
            f"• Тип {g.get('code')} „{g.get('title')}“: {', '.join(g.get('athletes') or [])}. "
            f"{g.get('formula') or ''}"
        )
    lines.append("")
    lines.append(
        "Кажи „генерирай тренировка по диагнозата“, ако искаш отборен план по общия приоритет."
    )
    return "\n".join(lines).strip()


def _format_prompt(pack: dict[str, Any]) -> str:
    if pack.get("empty"):
        return str(pack.get("message") or "")

    # За Gemini: пълни профили + вече готови микропланове (да разшири, не да съкращава)
    lines = [
        "=== АНАЛИЗ НА ТЕСТОВЕ (данни от платформата) ===",
        f"Група: {pack.get('teamName')} | сесия #{pack.get('sessionId')}",
        f"Състезатели: {pack.get('athleteCount')}",
        "",
        "ГОТОВ НАРАТИВЕН ДОКЛАД (ползвай го като основа; можеш да уточниш cues, "
        "но НЕ съкращавай — запази ВСЕКИ състезател + упражненията):",
        pack.get("narrativeReport") or "",
        "",
        "ПРАВИЛА:",
        "- Отговорът трябва да е дълъг и конкретен: легенда, схема 6–12м, после ВСЕКИ играч с профил и плио/упражнения.",
        "- Без тежести за U9–U13; качество на плиометрията пред обем.",
        "- Отбелязвай липсващи технически тестове с ⚪.",
        "- В края: групови типове A–E.",
        "=== КРАЙ ===",
    ]
    return "\n".join(lines)


def wants_assessment_analysis(message: str) -> bool:
    low = (message or "").lower()
    keys = (
        "анализ на тест",
        "анализирай тест",
        "анализирай резулт",
        "диагностик",
        "дефицит",
        "потенциал",
        "скаут",
        "тестовете",
        "тестове на",
        "какво да работим по тест",
        "какво да работя по измер",
        "development score",
        "профил на децата",
        "типове деца",
        "архетип",
        "плиометр",
    )
    return any(k in low for k in keys)


# Keep old name used internally if any
def _classify_archetype(profile: dict[str, Any]) -> dict[str, str]:
    return _classify_archetype_from_peers(
        {
            "SPEED_9363": profile.get("speedPeer"),
            "PHYS_JUMP_1ARM": profile.get("jumpPeer"),
            "PHYS_JUMP_2ARM": profile.get("jumpPeer"),
            "PHYS_LONGJUMP": profile.get("jumpPeer"),
            "PHYS_JUMP_APPROACH": profile.get("approachPeer"),
        },
        profile.get("techMean"),
        profile.get("physMean"),
    )
