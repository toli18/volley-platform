from sqlalchemy.orm import Session
from app.models import Club
import csv
from pathlib import Path

def seed_clubs(db: Session):
    csv_path = Path(__file__).parent / "clubs.csv"

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)

        for row in reader:
            exists = db.query(Club).filter(Club.name == row["name"]).first()
            if exists:
                # Keep the logo in sync for already-seeded clubs.
                new_logo = row.get("logo_url")
                if new_logo and exists.logo_url != new_logo:
                    exists.logo_url = new_logo
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
        print(f"✅ Seeded clubs")
