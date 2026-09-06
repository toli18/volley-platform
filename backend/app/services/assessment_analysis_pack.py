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


def _classify_archetype(profile: dict[str, Any]) -> dict[str, str]:
    """Детерминирани архетипи в стил ChatGPT Type A–D."""
    tech = profile.get("techMean")
    phys = profile.get("physMean")
    speed = profile.get("speedPeer")
    jump = profile.get("jumpPeer")
    approach = profile.get("approachPeer")

    def ok(v: Optional[float], lo: float = 55) -> bool:
        return v is not None and float(v) >= lo

    def weak(v: Optional[float], hi: float = 40) -> bool:
        return v is not None and float(v) < hi

    # Type A: физика готова, техника изостава
    if ok(phys, 60) and weak(tech, 50):
        return {
            "code": "A",
            "title": "Физически готов — трябва техника",
            "formula": "Не добавяй ОФП час. Превърни качествата във волейболни умения (приема/атака/разпределение).",
        }
    # Type B: техника OK, физика изостава
    if ok(tech, 55) and weak(phys, 45):
        return {
            "code": "B",
            "title": "Технически добър — физически изостава",
            "formula": "Дръж техниката + 2× седмично скорост/експлозивност (кратки блокове).",
        }
    # Type C: добър скок, слаб подход / трансфер
    if ok(jump, 70) and (weak(approach, 45) or weak(speed, 40)):
        return {
            "code": "C",
            "title": "Добър скок — лош подход/трансфер",
            "formula": "Не трупай скокове. Работи веригата: разбег → последни 2 → махане → вертикален импулс.",
        }
    # Type D: обща двигателна база
    if weak(phys, 35) and weak(tech, 40):
        return {
            "code": "D",
            "title": "Обща двигателна база",
            "formula": "Игри + координация 10–15 мин, после 1 волейболен жест. Следи % подобрение, не ранг.",
        }
    # Type E: силен потенциал (всичко високо) — поддръжка + специализация
    if ok(phys, 70) and ok(tech, 60):
        return {
            "code": "E",
            "title": "Готов профил — специализация",
            "formula": "Поддържай силните; диференцирай роля (крило/център/разпределител) и темпо.",
        }
    return {
        "code": "X",
        "title": "Смесен / непълен профил",
        "formula": "Попълни липсващите тестове; работи 1 основен дефицит + 1 силна страна.",
    }


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


def build_assessment_analysis_pack(
    db: Session,
    team: Team,
    *,
    max_athletes: int = 24,
) -> Optional[dict[str, Any]]:
    """Пълен пакет за Gemini / чат: отбор + играчи + архетипи + 6–12м насоки."""
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
        }

    athletes = db.query(Athlete).filter(Athlete.id.in_(athlete_ids)).all()
    by_id = {a.id: a for a in athletes}
    dev_map = _dev_scores_for_athletes(db, athlete_ids)

    # Scouting overlays (peer / 2022) за последни стойности
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
            traffic.append(
                {
                    "domain": d["domain"],
                    "normalized": d["normalized"],
                    **ryg,
                }
            )
        # peer highlights from scouting
        peer_bits: list[str] = []
        srow = scout_by_id.get(aid)
        cells = list(getattr(srow, "cells", None) or []) if srow else []
        for cell in cells:
            pp = cell.peer_percentile
            code = cell.test_code
            if pp is None:
                continue
            if pp <= 20 or pp >= 80:
                peer_bits.append(f"{code}:{int(pp)}%")

        archetype = _classify_archetype(means)
        name = ath.athlete_name
        archetype_buckets.setdefault(archetype["code"], []).append(name.split()[0] if name else str(aid))

        history = dev_map.get(aid) or []
        latest_delta = history[-1].get("delta") if history else None

        profiles.append(
            {
                "athleteId": aid,
                "name": name,
                "ageBand": age_band_from_birth_year(ath.birth_year) if ath.birth_year else None,
                "mainFocus": row.get("main_focus"),
                "secondaryFocus": row.get("secondary_focus"),
                "traffic": traffic[:6],
                "means": means,
                "archetype": archetype,
                "developmentHistory": history[-4:],
                "latestDelta": latest_delta,
                "peerHighlights": peer_bits[:6],
            }
        )

    # Team domain traffic
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
                "athletes": names[:8],
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
    pack["promptText"] = _format_prompt(pack)
    return pack


def _format_prompt(pack: dict[str, Any]) -> str:
    if pack.get("empty"):
        return str(pack.get("message") or "")

    lines = [
        "=== АНАЛИЗ НА ТЕСТОВЕ (данни от платформата) ===",
        f"Група: {pack.get('teamName')} | сесия #{pack.get('sessionId')} | "
        f"прозорец: {((pack.get('window') or {}).get('season'))} / {((pack.get('window') or {}).get('phase'))}",
        f"Състезатели с данни: {pack.get('athleteCount')}",
        "Легенда: red=основен дефицит (<40), yellow=вторичен (40–60), green=силна страна (≥60), white=няма данни.",
        "Критерий: нормализиран резултат + връстников % (където е даден).",
        "",
        "Отборни домейни:",
    ]
    for d in pack.get("teamDomains") or []:
        lines.append(
            f"- [{d.get('level')}] {d.get('domain')}: mean={d.get('meanNormalized')} "
            f"(дефицит при {d.get('deficitCount')} души)"
        )
    lines.append(
        f"Общ приоритет: {pack.get('mainFocus') or '—'} / вторичен: {pack.get('secondaryFocus') or '—'}"
    )
    lines.append("")
    lines.append("Архетипи в групата:")
    for g in pack.get("archetypeGroups") or []:
        lines.append(
            f"- Тип {g.get('code')} „{g.get('title')}“: {', '.join(g.get('athletes') or [])}. "
            f"Формула: {g.get('formula')}"
        )
    lines.append("")
    lines.append("Индивидуални профили (кратко):")
    for a in pack.get("athletes") or []:
        traf = ", ".join(
            f"{t.get('domain')}={t.get('normalized')}[{t.get('level')}]"
            for t in (a.get("traffic") or [])[:4]
        )
        hist = a.get("developmentHistory") or []
        delta = a.get("latestDelta")
        lines.append(
            f"- {a.get('name')} ({a.get('ageBand') or '?'}): тип {a.get('archetype', {}).get('code')} — "
            f"{a.get('archetype', {}).get('title')}; фокус {a.get('mainFocus') or '—'}; "
            f"{traf or 'без домейн'}; delta={delta}; peers={', '.join(a.get('peerHighlights') or []) or '—'}"
        )
        if len(hist) >= 2:
            lines.append(
                f"  история Development Score: "
                + " → ".join(
                    f"{h.get('phase')}:{h.get('developmentScore')}" for h in hist[-3:]
                )
            )
    lines.extend(
        [
            "",
            "ПРАВИЛА ЗА ОТГОВОР (анализ):",
            "- Говори като колега-треньор: ясно, с archetypes, светофар и 6–12 месечни насоки.",
            "- Не рецитирай целия CSV — извади закономерности и какво да се работи на терена.",
            "- За U9–U10: по-кратки блокове и игри; за U11–U13: 2×15–25 мин индивидуализирани блока.",
            "- След анализ можеш да предложиш генериране на тренировка (Действие: генерирай_тренировка).",
            "=== КРАЙ АНАЛИЗ ТЕСТОВЕ ===",
        ]
    )
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
    )
    return any(k in low for k in keys)
