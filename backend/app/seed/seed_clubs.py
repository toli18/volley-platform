from sqlalchemy.orm import Session
from app.models import Club
import csv
from pathlib import Path

CSV_PATH = Path(__file__).parent / "clubs.csv"

# Logo URLs that are placeholders / external links we want to replace with the
# real club logos stored under /static/club-logos.
_REPLACEABLE_LOGO_MARKERS = ("facebook", "bvf.bg", "_next/static")


def _should_replace_logo(current: str | None, new_logo: str | None) -> bool:
    """Only overwrite empty values or known placeholders, never a custom logo."""
    if not new_logo:
        return False
    if current == new_logo:
        return False
    if not current:
        return True
    low = current.lower()
    return any(marker in low for marker in _REPLACEABLE_LOGO_MARKERS)


def seed_clubs(db: Session):
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            exists = db.query(Club).filter(Club.name == row["name"]).first()
            if exists:
                # Keep the logo in sync for already-seeded clubs.
                if _should_replace_logo(exists.logo_url, row.get("logo_url")):
                    exists.logo_url = row.get("logo_url")
                continue

            club = Club(
                name=row["name"],
                city=row.get("city"),
                country=row.get("country"),
                address=row.get("address"),
                contact_email=row.get("contact_email"),
                contact_phone=row.get("contact_phone"),
                website_url=row.get("website_url"),
                logo_url=row.get("logo_url"),
            )
            db.add(club)

        db.commit()
        print("✅ Seeded clubs")


def sync_club_logos(db: Session) -> int:
    """Idempotently set real club logos for existing clubs (placeholders only).

    Safe to run on every startup: it updates ``logo_url`` from clubs.csv for
    clubs that still have an empty or placeholder logo, without touching logos
    an admin has customized.
    """
    updated = 0
    with open(CSV_PATH, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            club = db.query(Club).filter(Club.name == row["name"]).first()
            if club and _should_replace_logo(club.logo_url, row.get("logo_url")):
                club.logo_url = row.get("logo_url")
                updated += 1
    if updated:
        db.commit()
        print(f"✅ Synced {updated} club logos")
    return updated
