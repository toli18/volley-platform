"""Import club logos from the Bulgarian Volleyball Federation (BFV) public list.

Source data: ``app/seed/data/bvf_club_logos.json`` (name + public CDN logo URL),
scraped from https://www.bvf.bg/subMenu/clubs/clubsList

What it does:
  1. Downloads each club logo into ``app/static/club-logos/<bvf_id>.<ext>``.
  2. Matches BFV club names against the clubs in our system (DB or seed CSV)
     using prefix-stripping + homoglyph-folding normalization.
  3. Sets ``Club.logo_url`` to ``/static/club-logos/<bvf_id>.<ext>`` for matches.
  4. Prints a report of matched / fuzzy / unmatched clubs.

Usage:
  # Validate matching offline against the seed CSV (no DB, no download):
  python -m app.scripts.import_club_logos --source csv --dry-run --no-download

  # Download logos + update the seed CSV logo_url column:
  python -m app.scripts.import_club_logos --source csv --update-csv

  # Download logos + update the live database:
  python -m app.scripts.import_club_logos --source db
"""
from __future__ import annotations

import argparse
import csv
import difflib
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen

APP_DIR = Path(__file__).resolve().parents[1]
LOGOS_JSON = APP_DIR / "seed" / "data" / "bvf_club_logos.json"
CLUBS_CSV = APP_DIR / "seed" / "clubs.csv"
STATIC_LOGOS_DIR = APP_DIR / "static" / "club-logos"
STATIC_URL_PREFIX = "/static/club-logos"

# Org-type abbreviations / boilerplate tokens that prefix our DB club names
# (e.g. "Сдружение ВК Атом" -> "Атом"). Stripped from both sides before matching.
PREFIX_TOKENS = {
    "сдружение", "вк", "скв", "ск", "оск", "свк", "ва", "кв",
    "увк", "пск", "усш", "квв", "вкв", "усш",
}

# Latin homoglyphs that frequently sneak into Cyrillic club names.
HOMOGLYPHS = str.maketrans({
    "a": "а", "e": "е", "o": "о", "p": "р", "c": "с", "x": "х",
    "y": "у", "k": "к", "m": "м", "t": "т", "h": "н", "b": "в",
})

EXT_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/gif": ".gif",
}


def normalize(name: str) -> str:
    """Normalize a club name for matching."""
    s = (name or "").strip().lower()
    s = s.translate(HOMOGLYPHS)
    # unify dashes/quotes/punctuation into spaces
    s = re.sub(r"[\u2010-\u2015\-\u2018\u2019\u201c\u201d\"'`.,/()]+", " ", s)
    tokens = [t for t in re.split(r"\s+", s) if t]
    # drop leading org-type tokens
    while tokens and tokens[0] in PREFIX_TOKENS:
        tokens.pop(0)
    return " ".join(tokens)


def load_bvf_logos() -> list[dict]:
    with open(LOGOS_JSON, encoding="utf-8-sig") as f:
        data = json.load(f)
    return [c for c in data if c.get("logo_url")]


def download_logo(url: str, bvf_id: str) -> str | None:
    """Download a logo to the static dir. Returns the public URL or None."""
    STATIC_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=30) as resp:
            content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
            content = resp.read()
    except Exception as exc:  # noqa: BLE001
        print(f"  ! download failed for club {bvf_id}: {exc}")
        return None

    ext = EXT_BY_CONTENT_TYPE.get(content_type, ".png")
    dest = STATIC_LOGOS_DIR / f"{bvf_id}{ext}"
    dest.write_bytes(content)
    return f"{STATIC_URL_PREFIX}/{bvf_id}{ext}"


def public_url_for(bvf_id: str) -> str:
    """Return the public URL for an already-downloaded logo (any extension)."""
    for ext in (".png", ".jpg", ".webp", ".svg", ".gif"):
        if (STATIC_LOGOS_DIR / f"{bvf_id}{ext}").exists():
            return f"{STATIC_URL_PREFIX}/{bvf_id}{ext}"
    return f"{STATIC_URL_PREFIX}/{bvf_id}.png"


def build_match_index(bvf: list[dict]) -> tuple[dict[str, dict], dict[str, str]]:
    """Return (normalized_name -> bvf entry) and (normalized_name -> original name)."""
    index: dict[str, dict] = {}
    originals: dict[str, str] = {}
    for entry in bvf:
        key = normalize(entry["name"])
        if key and key not in index:
            index[key] = entry
            originals[key] = entry["name"]
    return index, originals


def match_club(club_name: str, index: dict[str, dict], keys: list[str]):
    """Return (entry, kind) where kind is 'exact' | 'fuzzy' | None."""
    key = normalize(club_name)
    if key in index:
        return index[key], "exact"
    close = difflib.get_close_matches(key, keys, n=1, cutoff=0.86)
    if close:
        return index[close[0]], "fuzzy"
    return None, None


def get_our_clubs(source: str) -> list[str]:
    """Return list of our club names from the chosen source."""
    if source == "csv":
        with open(CLUBS_CSV, encoding="utf-8") as f:
            return [row["name"] for row in csv.DictReader(f) if row.get("name")]
    # db
    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import Club  # noqa: PLC0415

    db = SessionLocal()
    try:
        return [c.name for c in db.query(Club).all()]
    finally:
        db.close()


def apply_to_db(name_to_url: dict[str, str]) -> int:
    from app.database import SessionLocal  # noqa: PLC0415
    from app.models import Club  # noqa: PLC0415

    db = SessionLocal()
    updated = 0
    try:
        for name, url in name_to_url.items():
            club = db.query(Club).filter(Club.name == name).first()
            if club and club.logo_url != url:
                club.logo_url = url
                updated += 1
        db.commit()
    finally:
        db.close()
    return updated


def apply_to_csv(name_to_url: dict[str, str]) -> int:
    with open(CLUBS_CSV, encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        rows = list(reader)
    updated = 0
    for row in rows:
        new_url = name_to_url.get(row["name"])
        if new_url and row.get("logo_url") != new_url:
            row["logo_url"] = new_url
            updated += 1
    with open(CLUBS_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    return updated


def main() -> int:
    parser = argparse.ArgumentParser(description="Import BFV club logos.")
    parser.add_argument("--source", choices=["db", "csv"], default="csv",
                        help="Where to read our club names from (default: csv).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Only report matches; do not update DB/CSV.")
    parser.add_argument("--no-download", action="store_true",
                        help="Skip downloading logo files (matching report only).")
    parser.add_argument("--update-csv", action="store_true",
                        help="Write matched logo_url back into clubs.csv.")
    args = parser.parse_args()

    bvf = load_bvf_logos()
    index, originals = build_match_index(bvf)
    keys = list(index.keys())
    our_clubs = get_our_clubs(args.source)

    print(f"BFV logos: {len(bvf)} | our clubs ({args.source}): {len(our_clubs)}")
    print("-" * 60)

    matched: dict[str, str] = {}     # our club name -> public logo url
    used_bvf_ids: set[str] = set()
    exact = fuzzy = 0
    unmatched: list[str] = []
    fuzzy_pairs: list[tuple[str, str]] = []

    for name in our_clubs:
        entry, kind = match_club(name, index, keys)
        if not entry:
            unmatched.append(name)
            continue
        bvf_id = str(entry["bvf_id"])
        used_bvf_ids.add(bvf_id)
        if kind == "exact":
            exact += 1
        else:
            fuzzy += 1
            fuzzy_pairs.append((name, entry["name"]))

        if args.no_download:
            url = public_url_for(bvf_id)
        else:
            url = download_logo(entry["logo_url"], bvf_id) or public_url_for(bvf_id)
        matched[name] = url

    print(f"Matched: {len(matched)}  (exact={exact}, fuzzy={fuzzy})")
    print(f"Unmatched: {len(unmatched)}")

    if fuzzy_pairs:
        print("\nFUZZY matches (please review):")
        for ours, theirs in fuzzy_pairs:
            print(f"  • '{ours}'  ->  '{theirs}'")

    if unmatched:
        print("\nUNMATCHED our clubs (no BFV logo assigned):")
        for name in unmatched:
            print(f"  • {name}")

    if args.dry_run:
        print("\n[dry-run] No changes written.")
        return 0

    if args.source == "db":
        n = apply_to_db(matched)
        print(f"\nDB updated: {n} clubs.")
    if args.update_csv:
        n = apply_to_csv(matched)
        print(f"clubs.csv updated: {n} rows.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
