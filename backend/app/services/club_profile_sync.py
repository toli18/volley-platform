"""Sync club profile + coach phones + halls from BVF/SEK into local Club/User/ClubHall."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy.orm import Session

from app.models import Club, ClubHall, User, UserRole

_HALL_NOISE = re.compile(r"\b(зала|hall|gym)\b", re.IGNORECASE)


def club_profile_unlocked(club: Club) -> bool:
    has_auth = bool(getattr(club, "bvf_api_key_enc", None) or getattr(club, "bvf_password_enc", None))
    return bool(getattr(club, "bvf_club_id", None) and has_auth)


def _city_name(remote: dict) -> str | None:
    city = remote.get("city")
    if isinstance(city, dict):
        return str(city.get("name") or "").strip() or None
    if isinstance(city, str):
        return city.strip() or None
    return None


def _pick_phone(row: dict) -> str | None:
    for key in ("contactNumber", "phone", "mobilePhone", "telephone", "mobile"):
        val = str(row.get(key) or "").strip()
        if val:
            return val
    return None


def apply_bvf_club_remote_to_local(club: Club, remote: dict) -> dict[str, Any]:
    """Попълва локалния клубен профил от GET /api/clubs/{id}. Не пипа ApiKey."""
    changed: list[str] = []

    bvf_name = str(remote.get("name") or "").strip()
    full_name = str(remote.get("fullName") or "").strip() or None
    city = _city_name(remote)
    address = str(remote.get("address") or "").strip() or None
    email = str(remote.get("email") or "").strip() or None
    phone = _pick_phone(remote)
    contact_name = None
    for key in (
        "contactName",
        "contactPerson",
        "president",
        "presidentName",
        "chairman",
        "chairmanName",
        "managerName",
        "representativeName",
    ):
        val = str(remote.get(key) or "").strip()
        if val:
            contact_name = val
            break
    website = str(remote.get("websiteUrl") or remote.get("website") or "").strip() or None
    bulstat = str(remote.get("bulstat") or "").strip() or None
    license_number = str(remote.get("licenseNumber") or "").strip() or None
    region = None
    reg = remote.get("region")
    if isinstance(reg, dict):
        region = str(reg.get("name") or "").strip() or None
    elif isinstance(reg, str):
        region = reg.strip() or None
    logo_id = str(remote.get("logoId") or "").strip() or None

    if bvf_name and club.bvf_club_name != bvf_name:
        club.bvf_club_name = bvf_name
        changed.append("bvf_club_name")
    if full_name is not None and getattr(club, "full_name", None) != full_name:
        club.full_name = full_name
        changed.append("full_name")
    if city and not (club.city or "").strip():
        club.city = city
        changed.append("city")
    elif city and (club.city or "").strip() != city:
        club.city = city
        changed.append("city")
    if address:
        club.address = address
        changed.append("address")
    if email:
        club.contact_email = email
        changed.append("contact_email")
    if phone:
        club.contact_phone = phone
        changed.append("contact_phone")
    if contact_name and not (getattr(club, "contact_name", None) or "").strip():
        club.contact_name = contact_name
        changed.append("contact_name")
    if website:
        club.website_url = website if website.startswith("http") else f"https://{website}"
        changed.append("website_url")
    if bulstat is not None:
        club.bulstat = bulstat
        changed.append("bulstat")
    if license_number is not None:
        club.license_number = license_number
        changed.append("license_number")
    if region is not None:
        club.bvf_region = region
        changed.append("bvf_region")
    if logo_id:
        club.bvf_logo_id = logo_id
        changed.append("bvf_logo_id")
        if not (club.logo_url or "").strip():
            club.logo_url = f"https://cdn.bgvolley.dev/club-logos/{logo_id}"
            changed.append("logo_url")

    return {"changed_fields": sorted(set(changed))}


def _norm_name(value: str | None) -> str:
    return " ".join(str(value or "").strip().lower().split())


def _norm_hall_key(value: str | None) -> str:
    raw = _norm_name(value)
    raw = _HALL_NOISE.sub(" ", raw)
    return " ".join(raw.split())


def sync_coach_phones_from_bvf(db: Session, club: Club, remote_coaches: list[dict]) -> dict[str, Any]:
    """Обновява phone на локални треньори по bvf_coach_id или име."""
    by_id: dict[int, dict] = {}
    by_name: dict[str, dict] = {}
    for row in remote_coaches:
        if not isinstance(row, dict):
            continue
        try:
            cid = int(row.get("id"))
        except Exception:
            continue
        name = (
            str(row.get("name") or "").strip()
            or " ".join(
                p
                for p in [
                    str(row.get("firstName") or "").strip(),
                    str(row.get("middleName") or "").strip(),
                    str(row.get("lastName") or "").strip(),
                ]
                if p
            )
        )
        by_id[cid] = row
        if name:
            by_name[_norm_name(name)] = row

    local = (
        db.query(User)
        .filter(
            User.club_id == club.id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .all()
    )
    updated = 0
    matched = 0
    for coach in local:
        remote = None
        if coach.bvf_coach_id and int(coach.bvf_coach_id) in by_id:
            remote = by_id[int(coach.bvf_coach_id)]
        elif _norm_name(coach.name) in by_name:
            remote = by_name[_norm_name(coach.name)]
        if not remote:
            continue
        matched += 1
        phone = _pick_phone(remote)
        if phone and (coach.phone or "").strip() != phone:
            coach.phone = phone
            updated += 1
        # Ако няма bvf_coach_id, закачи го при name match
        if not coach.bvf_coach_id:
            try:
                coach.bvf_coach_id = int(remote.get("id"))
                coach.bvf_coach_name = (
                    str(remote.get("name") or "").strip()
                    or " ".join(
                        p
                        for p in [
                            str(remote.get("firstName") or "").strip(),
                            str(remote.get("lastName") or "").strip(),
                        ]
                        if p
                    )
                    or None
                )
            except Exception:
                pass
    return {"coaches_matched": matched, "phones_updated": updated, "local_coaches": len(local)}


def _hall_field(row: dict, *keys: str) -> str | None:
    for key in keys:
        val = str(row.get(key) or "").strip()
        if val:
            return val
    return None


def sync_halls_from_bvf(db: Session, club: Club, remote_halls: list[dict]) -> dict[str, Any]:
    """Upsert зали от GET /api/clubs/{id}/halls; деактивира липсващите."""
    local = db.query(ClubHall).filter(ClubHall.club_id == int(club.id)).all()
    by_bvf: dict[int, ClubHall] = {}
    by_name: dict[str, ClubHall] = {}
    for h in local:
        if h.bvf_hall_id is not None:
            by_bvf[int(h.bvf_hall_id)] = h
        key = _norm_hall_key(h.name)
        if key:
            by_name[key] = h

    seen_ids: set[int] = set()
    created = 0
    updated = 0
    for row in remote_halls or []:
        if not isinstance(row, dict):
            continue
        try:
            hid = int(row.get("id"))
        except Exception:
            continue
        name = _hall_field(row, "name", "title", "hallName") or f"Зала #{hid}"
        address = _hall_field(row, "address", "fullAddress", "location")
        maps = _hall_field(row, "googleMapsUrl", "googleMapsURL", "mapsUrl", "mapUrl")
        hall = by_bvf.get(hid) or by_name.get(_norm_hall_key(name))
        if hall is None:
            hall = ClubHall(club_id=int(club.id), bvf_hall_id=hid, name=name)
            db.add(hall)
            created += 1
        else:
            changed = False
            if hall.bvf_hall_id != hid:
                hall.bvf_hall_id = hid
                changed = True
            if (hall.name or "") != name:
                hall.name = name
                changed = True
            if (hall.address or None) != address:
                hall.address = address
                changed = True
            if (hall.google_maps_url or None) != maps:
                hall.google_maps_url = maps
                changed = True
            if not hall.is_active:
                hall.is_active = True
                changed = True
            if changed:
                updated += 1
        seen_ids.add(hid)

    deactivated = 0
    # Ръчно добавените зали (без bvf_hall_id) никога не се махат от СЕК sync.
    # Ако СЕК върне празен списък — оставяме ръчните празни за попълване от главния треньор.
    for h in local:
        if h.bvf_hall_id is not None and int(h.bvf_hall_id) not in seen_ids and h.is_active:
            h.is_active = False
            deactivated += 1

    return {
        "halls_remote": len(seen_ids),
        "halls_created": created,
        "halls_updated": updated,
        "halls_deactivated": deactivated,
    }


def load_club_halls(db: Session, club_id: int, *, active_only: bool = True) -> list[ClubHall]:
    q = db.query(ClubHall).filter(ClubHall.club_id == int(club_id))
    if active_only:
        q = q.filter(ClubHall.is_active.is_(True))
    return q.order_by(ClubHall.name.asc()).all()


def serialize_hall(hall: ClubHall) -> dict[str, Any]:
    return {
        "id": int(hall.id),
        "bvf_hall_id": int(hall.bvf_hall_id) if hall.bvf_hall_id is not None else None,
        "name": hall.name,
        "address": hall.address,
        "google_maps_url": hall.google_maps_url,
        "is_active": bool(hall.is_active),
    }


def match_club_hall(location: str | None, halls: list[ClubHall]) -> ClubHall | None:
    """Намира СЕК зала по текст от графика (име / частично съвпадение)."""
    key = _norm_hall_key(location)
    if not key or not halls:
        return None
    exact = [_norm_hall_key(h.name) for h in halls]
    for h, nk in zip(halls, exact):
        if nk and nk == key:
            return h
    for h, nk in zip(halls, exact):
        if nk and (key in nk or nk in key):
            return h
    # „Троян“ ↔ „ЗАЛА ТРОЯН“
    loc_raw = _norm_name(location)
    for h in halls:
        hn = _norm_name(h.name)
        if loc_raw and hn and (loc_raw in hn or hn in loc_raw):
            return h
    return None


def serialize_club_profile(
    club: Club,
    *,
    coaches: list[User] | None = None,
    halls: list[ClubHall] | None = None,
) -> dict[str, Any]:
    unlocked = club_profile_unlocked(club)
    out: dict[str, Any] = {
        "unlocked": unlocked,
        "club_id": club.id,
        "name": club.name,
        "full_name": getattr(club, "full_name", None),
        "city": club.city,
        "address": club.address,
        "contact_email": club.contact_email,
        "contact_phone": club.contact_phone,
        "contact_name": getattr(club, "contact_name", None),
        "website_url": club.website_url,
        "facebook_page_url": getattr(club, "facebook_page_url", None),
        "logo_url": club.logo_url,
        "bulstat": getattr(club, "bulstat", None),
        "license_number": getattr(club, "license_number", None),
        "bvf_region": getattr(club, "bvf_region", None),
        "bvf_club_id": club.bvf_club_id,
        "bvf_club_name": club.bvf_club_name,
        "bvf_logo_id": getattr(club, "bvf_logo_id", None),
        "bvf_linked_at": club.bvf_linked_at.isoformat() if club.bvf_linked_at else None,
        "coaches": [],
        "halls": [serialize_hall(h) for h in halls or []],
    }
    for c in coaches or []:
        out["coaches"].append(
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "role": c.role.value if hasattr(c.role, "value") else str(c.role),
                "phone": c.phone,
                "phone_visible_to_parents": bool(getattr(c, "phone_visible_to_parents", True)),
                "bvf_coach_id": c.bvf_coach_id,
                "bvf_coach_name": c.bvf_coach_name,
            }
        )
    return out
