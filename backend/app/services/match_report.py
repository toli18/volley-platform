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
        "subs": 0,
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
    MatchStatAction.substitution: "subs",
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
    subs = int(counts.get("subs", 0))
    if subs:
        summary_bits.append(f"{subs} смени")

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
        action = getattr(ev, "action", None)
        if action is None and isinstance(ev, dict):
            action = ev.get("action")
        if aid:
            apply_action(ensure(int(aid)), action)
        rel = getattr(ev, "related_athlete_id", None)
        if rel is None and isinstance(ev, dict):
            rel = ev.get("related_athlete_id")
        is_sub = action == MatchStatAction.substitution or (
            isinstance(action, str) and action == MatchStatAction.substitution.value
        )
        if rel and is_sub:
            apply_action(ensure(int(rel)), MatchStatAction.substitution)

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


def _pct(won: int, attempts: int) -> float | None:
    if attempts <= 0:
        return None
    return round((won / attempts) * 100, 1)


def _next_rotation(rotation: int) -> int:
    r = int(rotation or 1)
    return 1 if r >= 6 else r + 1


def _empty_rotation_row(rotation: int) -> dict[str, Any]:
    return {
        "rotation": int(rotation),
        "points_for": 0,
        "points_against": 0,
        "side_out_attempts": 0,
        "side_out_won": 0,
        "side_out_pct": None,
        "break_attempts": 0,
        "break_won": 0,
        "break_pct": None,
        "point_diff": 0,
    }


def analyze_side_out_and_rotations(
    events: list[Any],
    *,
    start_rotation: int = 1,
    start_we_serve: bool = True,
) -> dict[str, Any]:
    """Side-out / break-point + по ротация от scoring events.

    Replay-ваме състоянието *преди* всяка точка, защото event.we_serve/rotation
    са записани след apply_point.
    """
    we_serve = bool(start_we_serve)
    rotation = max(1, min(6, int(start_rotation or 1)))

    side_out_att = side_out_won = 0
    break_att = break_won = 0
    points_for = points_against = 0
    by_rot: dict[int, dict[str, Any]] = {r: _empty_rotation_row(r) for r in range(1, 7)}

    for ev in events:
        scored = getattr(ev, "scored_for", None)
        if scored is None and isinstance(ev, dict):
            scored = ev.get("scored_for")
        if scored not in ("us", "opp"):
            continue

        rot = rotation
        serving = we_serve
        row = by_rot[rot]

        if scored == "us":
            points_for += 1
            row["points_for"] += 1
            if serving:
                break_att += 1
                break_won += 1
                row["break_attempts"] += 1
                row["break_won"] += 1
            else:
                side_out_att += 1
                side_out_won += 1
                row["side_out_attempts"] += 1
                row["side_out_won"] += 1
                rotation = _next_rotation(rotation)
                we_serve = True
        else:
            points_against += 1
            row["points_against"] += 1
            if serving:
                break_att += 1
                row["break_attempts"] += 1
                we_serve = False
            else:
                side_out_att += 1
                row["side_out_attempts"] += 1

    for row in by_rot.values():
        row["side_out_pct"] = _pct(row["side_out_won"], row["side_out_attempts"])
        row["break_pct"] = _pct(row["break_won"], row["break_attempts"])
        row["point_diff"] = int(row["points_for"]) - int(row["points_against"])

    # Показвай само ротации с поне една точка
    rotations = [by_rot[r] for r in range(1, 7) if by_rot[r]["points_for"] or by_rot[r]["points_against"]]

    return {
        "side_out": {
            "side_out_attempts": side_out_att,
            "side_out_won": side_out_won,
            "side_out_pct": _pct(side_out_won, side_out_att),
            "break_attempts": break_att,
            "break_won": break_won,
            "break_pct": _pct(break_won, break_att),
            "points_for": points_for,
            "points_against": points_against,
        },
        "by_rotation": rotations,
    }


def enrich_insights_with_side_out(lines: list[str], analysis: dict[str, Any]) -> list[str]:
    so = analysis.get("side_out") or {}
    if so.get("side_out_attempts"):
        pct = so.get("side_out_pct")
        pct_s = f"{pct}%" if pct is not None else "—"
        lines.append(
            f"Side-out: {so['side_out_won']}/{so['side_out_attempts']} ({pct_s}) — "
            f"точки при посрещане"
        )
    if so.get("break_attempts"):
        pct = so.get("break_pct")
        pct_s = f"{pct}%" if pct is not None else "—"
        lines.append(
            f"Break-point: {so['break_won']}/{so['break_attempts']} ({pct_s}) — "
            f"точки при наш сервис"
        )

    rotations = analysis.get("by_rotation") or []
    with_diff = [r for r in rotations if (r.get("points_for") or 0) + (r.get("points_against") or 0) >= 2]
    if with_diff:
        best = max(with_diff, key=lambda r: int(r.get("point_diff") or 0))
        worst = min(with_diff, key=lambda r: int(r.get("point_diff") or 0))
        if int(best.get("point_diff") or 0) > 0:
            lines.append(
                f"Най-силна ротация: R{best['rotation']} "
                f"({best['points_for']}:{best['points_against']}, diff {best['point_diff']:+d})"
            )
        if int(worst.get("point_diff") or 0) < 0 and worst["rotation"] != best["rotation"]:
            lines.append(
                f"Най-слаба ротация: R{worst['rotation']} "
                f"({worst['points_for']}:{worst['points_against']}, diff {worst['point_diff']:+d})"
            )
    return lines


def list_substitutions(
    events: list[Any],
    *,
    roster: list[dict[str, Any]],
    set_number_by_set_id: dict[int, int] | None = None,
    default_set_number: int = 1,
) -> list[dict[str, Any]]:
    """Хронология на смените (излиза → влиза)."""
    by_id = {int(p["athlete_id"]): p for p in roster if p.get("athlete_id") is not None}
    set_map = set_number_by_set_id or {}
    out: list[dict[str, Any]] = []

    def g(ev: Any, key: str, default=None):
        if isinstance(ev, dict):
            return ev.get(key, default)
        return getattr(ev, key, default)

    for ev in events:
        action = g(ev, "action")
        is_sub = action == MatchStatAction.substitution or (
            isinstance(action, str) and action == MatchStatAction.substitution.value
        )
        if not is_sub:
            continue

        out_id = g(ev, "athlete_id")
        in_id = g(ev, "related_athlete_id")
        set_id = g(ev, "set_id")
        set_number = default_set_number
        if set_id is not None:
            set_number = int(set_map.get(int(set_id), default_set_number))

        out_row = by_id.get(int(out_id)) if out_id else None
        in_row = by_id.get(int(in_id)) if in_id else None

        out.append(
            {
                "id": int(g(ev, "id") or 0),
                "set_number": set_number,
                "rotation": int(g(ev, "rotation") or 1),
                "our_score": int(g(ev, "our_score") or 0),
                "opp_score": int(g(ev, "opp_score") or 0),
                "out_athlete_id": int(out_id) if out_id else None,
                "out_athlete_name": (out_row or {}).get("athlete_name") or "",
                "out_jersey": int((out_row or {}).get("jersey_number") or 0),
                "in_athlete_id": int(in_id) if in_id else None,
                "in_athlete_name": (in_row or {}).get("athlete_name") or "",
                "in_jersey": int((in_row or {}).get("jersey_number") or 0),
                "created_at": g(ev, "created_at"),
            }
        )

    return out
