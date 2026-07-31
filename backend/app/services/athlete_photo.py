"""Local cache of BVF athlete portrait — not the federation file store."""

from __future__ import annotations

from pathlib import Path

PHOTO_DIR = Path(__file__).resolve().parents[1] / "data" / "athlete_photos"


def photo_path(athlete_id: int) -> Path:
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    return PHOTO_DIR / f"{int(athlete_id)}.jpg"


def has_cached_photo(athlete_id: int) -> bool:
    p = photo_path(athlete_id)
    return p.is_file() and p.stat().st_size > 0


def save_athlete_photo(athlete_id: int, content: bytes) -> Path:
    if not content:
        raise ValueError("empty photo")
    path = photo_path(athlete_id)
    path.write_bytes(content)
    return path


def read_athlete_photo(athlete_id: int) -> bytes | None:
    path = photo_path(athlete_id)
    if not path.is_file():
        return None
    data = path.read_bytes()
    return data or None
