"""Resolve BVF FirstCoachId for player create from local coach ↔ SEK mapping."""

from __future__ import annotations

from typing import Any, Optional


def sek_link_status(user) -> str:
    """self | proxy | none"""
    if getattr(user, "bvf_coach_id", None):
        return "self"
    if getattr(user, "bvf_first_coach_proxy_id", None):
        return "proxy"
    return "none"


def resolve_first_coach_bvf_id(coach_user, club) -> Optional[int]:
    """
    Order:
    1) coach's own SEK id
    2) coach's proxy SEK coach
    3) club default first coach
    """
    own = getattr(coach_user, "bvf_coach_id", None) if coach_user is not None else None
    if own:
        try:
            return int(own)
        except (TypeError, ValueError):
            pass
    proxy = getattr(coach_user, "bvf_first_coach_proxy_id", None) if coach_user is not None else None
    if proxy:
        try:
            return int(proxy)
        except (TypeError, ValueError):
            pass
    if club is not None:
        default = getattr(club, "bvf_default_first_coach_id", None)
        if default:
            try:
                return int(default)
            except (TypeError, ValueError):
                pass
    return None


def resolve_first_coach_label(coach_user, club) -> Optional[str]:
    if coach_user is not None and getattr(coach_user, "bvf_coach_id", None):
        return (getattr(coach_user, "bvf_coach_name", None) or "").strip() or f"БФВ #{coach_user.bvf_coach_id}"
    if coach_user is not None and getattr(coach_user, "bvf_first_coach_proxy_id", None):
        return (getattr(coach_user, "bvf_first_coach_proxy_name", None) or "").strip() or f"БФВ #{coach_user.bvf_first_coach_proxy_id}"
    if club is not None and getattr(club, "bvf_default_first_coach_id", None):
        return (getattr(club, "bvf_default_first_coach_name", None) or "").strip() or f"БФВ #{club.bvf_default_first_coach_id}"
    return None


def apply_sek_link(
    user,
    *,
    mode: str,
    bvf_coach_id: Optional[int] = None,
    bvf_coach_name: Optional[str] = None,
    proxy_id: Optional[int] = None,
    proxy_name: Optional[str] = None,
) -> None:
    """
    mode: self | proxy | none
    """
    m = (mode or "none").strip().lower()
    if m == "self":
        if not bvf_coach_id:
            raise ValueError("Избери треньор от СЕК за разпознаване.")
        user.bvf_coach_id = int(bvf_coach_id)
        user.bvf_coach_name = (bvf_coach_name or "").strip() or f"БФВ #{int(bvf_coach_id)}"
        user.bvf_first_coach_proxy_id = None
        user.bvf_first_coach_proxy_name = None
    elif m == "proxy":
        if not proxy_id:
            raise ValueError("Избери прокси треньор от СЕК.")
        user.bvf_coach_id = None
        user.bvf_coach_name = None
        user.bvf_first_coach_proxy_id = int(proxy_id)
        user.bvf_first_coach_proxy_name = (proxy_name or "").strip() or f"БФВ #{int(proxy_id)}"
    else:
        user.bvf_coach_id = None
        user.bvf_coach_name = None
        user.bvf_first_coach_proxy_id = None
        user.bvf_first_coach_proxy_name = None


def coach_public_sek_fields(user) -> dict[str, Any]:
    status = sek_link_status(user)
    return {
        "bvf_coach_id": getattr(user, "bvf_coach_id", None),
        "bvf_coach_name": getattr(user, "bvf_coach_name", None),
        "bvf_first_coach_proxy_id": getattr(user, "bvf_first_coach_proxy_id", None),
        "bvf_first_coach_proxy_name": getattr(user, "bvf_first_coach_proxy_name", None),
        "sek_link_status": status,
    }
