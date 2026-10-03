"""Списък треньори за картотека: платформа + СЕК, без дублиране."""

from __future__ import annotations

import re
import unicodedata
from typing import Any

from app.models import User


def _normalize_coach_name(name: str | None) -> str:
    raw = (name or "").strip().lower()
    if not raw:
        return ""
    decomposed = unicodedata.normalize("NFKD", raw)
    asciiish = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    asciiish = re.sub(r"[^\w\s]", " ", asciiish, flags=re.UNICODE)
    return re.sub(r"\s+", " ", asciiish).strip()


def _name_match_key(name: str | None) -> str:
    norm = _normalize_coach_name(name)
    parts = [p for p in norm.split() if len(p) > 1]
    if len(parts) >= 2:
        return f"{parts[0]} {parts[-1]}"
    return norm


def _sek_coach_display_name(row: dict) -> str:
    name = str(row.get("name") or "").strip()
    if name:
        return name
    parts = [
        str(row.get("firstName") or "").strip(),
        str(row.get("middleName") or "").strip(),
        str(row.get("lastName") or "").strip(),
    ]
    joined = " ".join(p for p in parts if p)
    return joined or f"Треньор #{row.get('id')}"


def parse_sek_club_coaches(remote: list) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in remote or []:
        if not isinstance(row, dict):
            continue
        try:
            cid = int(row.get("id"))
        except (TypeError, ValueError):
            continue
        name = _sek_coach_display_name(row)
        phone = (
            str(row.get("contactNumber") or row.get("phone") or row.get("mobilePhone") or "").strip()
            or None
        )
        out.append({"id": cid, "name": name, "phone": phone})
    out.sort(key=lambda c: (c.get("name") or "").lower())
    return out


def _platform_bvf_coach_id(user: User) -> int | None:
    for attr in ("bvf_coach_id", "bvf_first_coach_proxy_id"):
        val = getattr(user, attr, None)
        if val is None:
            continue
        try:
            return int(val)
        except (TypeError, ValueError):
            continue
    return None


def merge_club_coaches_for_carding(
    platform_coaches: list[User],
    sek_coaches: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    """Един ред на човек; за назначение е нужен локален User (selectable=True)."""
    sek_coaches = sek_coaches or []
    merged: list[dict[str, Any]] = []
    used_bvf_ids: set[int] = set()
    used_name_keys: set[str] = set()

    def _append(entry: dict[str, Any]) -> None:
        merged.append(entry)
        bid = entry.get("bvf_coach_id")
        if bid is not None:
            used_bvf_ids.add(int(bid))
        nk = _name_match_key(entry.get("name"))
        if nk:
            used_name_keys.add(nk)

    for user in platform_coaches:
        bid = _platform_bvf_coach_id(user)
        role = user.role.value if hasattr(user.role, "value") else str(user.role)
        name = (user.name or "").strip() or f"Треньор #{user.id}"
        _append(
            {
                "id": int(user.id),
                "name": name,
                "display_name": name,
                "role": role,
                "bvf_coach_id": bid,
                "selectable": True,
                "source": "platform",
                "sek_only": False,
            }
        )

    for sek in sek_coaches:
        try:
            bid = int(sek["id"])
        except (TypeError, ValueError, KeyError):
            continue
        if bid in used_bvf_ids:
            continue
        sek_name = (sek.get("name") or "").strip() or f"Треньор #{bid}"
        nk = _name_match_key(sek_name)

        matched_idx: int | None = None
        for i, entry in enumerate(merged):
            if entry.get("bvf_coach_id") == bid:
                matched_idx = i
                break
            if nk and _name_match_key(entry.get("name")) == nk and entry.get("selectable"):
                matched_idx = i
                break

        if matched_idx is not None:
            entry = merged[matched_idx]
            if not entry.get("bvf_coach_id"):
                entry["bvf_coach_id"] = bid
            entry["source"] = "platform+sek"
            used_bvf_ids.add(bid)
            if nk:
                used_name_keys.add(nk)
            continue

        if nk and nk in used_name_keys:
            continue

        _append(
            {
                "id": None,
                "sek_coach_id": bid,
                "name": sek_name,
                "display_name": f"{sek_name} (само в СЕК — добави профил в клуба)",
                "role": "coach",
                "bvf_coach_id": bid,
                "selectable": False,
                "source": "sek_only",
                "sek_only": True,
            }
        )

    merged.sort(key=lambda e: (e.get("display_name") or e.get("name") or "").lower())
    return merged


def find_sek_coach_for_user(user: User, sek_coaches: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not user or not sek_coaches:
        return None
    bid = _platform_bvf_coach_id(user)
    if bid:
        for s in sek_coaches:
            if int(s.get("id") or 0) == int(bid):
                return s
    nk = _name_match_key(user.name)
    if not nk:
        return None
    for s in sek_coaches:
        if _name_match_key(s.get("name")) == nk:
            return s
    return None
