# backend/app/services/match_report.py
"""Aggregate post-match box score + short coach insights from stat events."""
from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.models_matches import MatchStatAction


def _empty_counts() -> dict[str, int]:
    return {
        "kills": 0,
        "attack_err": 0,
        "aces": 0,
        "serve_err": 0,
        "blocks": 0,
        "digs": 0,
        "pass_hash": 0,
        "pass_plus": 0,
        "pass_minus": 0,
        "pass_err": 0,
    }


ACTION_FIELD = {
    MatchStatAction.kill: "kills",
    MatchStatAction.attack_error: "attack_err",
    MatchStatAction.ace: "aces",
    MatchStatAction.error: "serve_err",
    MatchStatAction.block: "blocks",
    MatchStatAction.dig: "digs",
    MatchStatAction.pass_3: "pass_hash",
    MatchStatAction.pass_2: "pass_plus",
    MatchStatAction.pass_1: "pass_minus",
    MatchStatAction.pass_error: "pass_err",
    MatchStatAction.pass_0: "pass_err",
}


def apply_action(counts: dict[str, int], action: MatchStatAction | str) -> None:
    if isinstance(action, str):
        try:
            action = MatchStatAction(action)
        except ValueError:
            return
    field = ACTION_FIELD.get(action)
    if field:
        counts[field] = int(counts.get(field, 0)) + 1


def derive_metrics(counts: dict[str, int]) -> dict[str, Any]:
    kills = int(counts.get("kills", 0))
    attack_err = int(counts.get("attack_err", 0))
    aces = int(counts.get("aces", 0))
    serve_err = int(counts.get("serve_err", 0))
    blocks = int(counts.get("blocks", 0))
    digs = int(counts.get("digs", 0))
    pass_hash = int(counts.get("pass_hash", 0))
    pass_plus = int(counts.get("pass_plus", 0))
    pass_minus = int(counts.get("pass_minus", 0))
    pass_err = int(counts.get("pass_err", 0))

    attack_att = kills + attack_err
    attack_pct = round((kills / attack_att) * 100, 1) if attack_att else None

    pass_total = pass_hash + pass_plus + pass_minus + pass_err
    pass_points = pass_hash * 3 + pass_plus * 2 + pass_minus * 1
    pass_avg = round(pass_points / pass_total, 2) if pass_total else None

    points = kills + aces + blocks
    errors = attack_err + serve_err + pass_err

    summary_bits: list[str] = []
    if kills:
        summary_bits.append(f"{kills} точки атака")
    if attack_err:
        summary_bits.append(f"{attack_err} гр. атака")
    if aces:
        summary_bits.append(f"{aces} ас")
    if serve_err:
        summary_bits.append(f"{serve_err} гр. сервис")
    if blocks:
        summary_bits.append(f"{blocks} блок")
    if digs:
        summary_bits.append(f"{digs} защита")
    if pass_total:
        summary_bits.append(f"поср. #{pass_hash}/+{pass_plus}/−{pass_minus}/гр{pass_err}")
        if pass_avg is not None:
            summary_bits.append(f"ср. поср. {pass_avg}")

    return {
        "attack_attempts": attack_att,
        "attack_pct": attack_pct,
        "pass_total": pass_total,
        "pass_avg": pass_avg,
        "points": points,
        "errors": errors,
        "summary": " · ".join(summary_bits) if summary_bits else "няма записи",
    }


def aggregate_events(
    events: list[Any],
    *,
    roster: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """events: objects with athlete_id + action. roster seeds all players."""
    by_id: dict[int, dict[str, Any]] = {}

    def ensure(aid: int, seed: dict[str, Any] | None = None) -> dict[str, Any]:
        if aid not in by_id:
            seed = seed or {}
            by_id[aid] = {
                "athlete_id": aid,
                "athlete_name": seed.get("athlete_name") or "",
                "jersey_number": seed.get("jersey_number", 0),
                "position": seed.get("position") or "",
                **_empty_counts(),
            }
        elif seed:
            row = by_id[aid]
            if seed.get("athlete_name"):
                row["athlete_name"] = seed["athlete_name"]
            if seed.get("jersey_number") is not None:
                row["jersey_number"] = seed["jersey_number"]
            if seed.get("position"):
                row["position"] = seed["position"]
        return by_id[aid]

    for p in roster:
        aid = int(p["athlete_id"])
        ensure(aid, p)

    for ev in events:
        aid = getattr(ev, "athlete_id", None)
        if aid is None and isinstance(ev, dict):
            aid = ev.get("athlete_id")
        if not aid:
            continue
        row = ensure(int(aid))
        action = getattr(ev, "action", None)
        if action is None and isinstance(ev, dict):
            action = ev.get("action")
        apply_action(row, action)

    out: list[dict[str, Any]] = []
    for row in by_id.values():
        metrics = derive_metrics(row)
        out.append({**row, **metrics})
    out.sort(key=lambda r: (int(r.get("jersey_number") or 0), int(r["athlete_id"])))
    return out


def build_insights(athletes: list[dict[str, Any]], *, sets_won_us: int, sets_won_opp: int) -> list[str]:
    lines: list[str] = [f"Резултат по геймове: {sets_won_us}:{sets_won_opp}"]

    with_points = [a for a in athletes if int(a.get("points") or 0) > 0]
    if with_points:
        top = max(with_points, key=lambda a: int(a["points"]))
        lines.append(
            f"Най-много точки: #{top.get('jersey_number')} {top.get('athlete_name') or ''} "
            f"({top['points']} — атака/ас/блок)"
        )

    receivers = [a for a in athletes if int(a.get("pass_total") or 0) >= 3 and a.get("pass_avg") is not None]
    if receivers:
        best = max(receivers, key=lambda a: float(a["pass_avg"]))
        lines.append(
            f"Най-добро посрещане: #{best.get('jersey_number')} {best.get('athlete_name') or ''} "
            f"(ср. {best['pass_avg']} от {best['pass_total']})"
        )

    with_err = [a for a in athletes if int(a.get("errors") or 0) > 0]
    if with_err:
        worst = max(with_err, key=lambda a: int(a["errors"]))
        lines.append(
            f"Най-много грешки: #{worst.get('jersey_number')} {worst.get('athlete_name') or ''} "
            f"({worst['errors']})"
        )

    attackers = [a for a in athletes if int(a.get("attack_attempts") or 0) >= 3 and a.get("attack_pct") is not None]
    if attackers:
        best_att = max(attackers, key=lambda a: float(a["attack_pct"]))
        lines.append(
            f"Най-ефективна атака: #{best_att.get('jersey_number')} {best_att.get('athlete_name') or ''} "
            f"({best_att['attack_pct']}% — {best_att['kills']}/{best_att['attack_attempts']})"
        )

    if len(lines) == 1:
        lines.append("Няма записани действия по състезатели за изводи.")
    return lines
