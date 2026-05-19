from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Athlete, Team, TeamMember
from app.services.parent_phone import normalize_phone_digits, phones_match


def team_names_for_athlete(db: Session, athlete_id: int) -> list[str]:
    rows = (
        db.query(Team.name)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.athlete_id == athlete_id, TeamMember.is_active.is_(True))
        .all()
    )
    return [r[0] for r in rows if r[0]]


def find_athletes_for_login(db: Session, parent_phone: str, birth_year: int) -> list[Athlete]:
    digits = normalize_phone_digits(parent_phone)
    if len(digits) < 9:
        return []
    candidates = (
        db.query(Athlete)
        .filter(
            Athlete.is_active.is_(True),
            Athlete.birth_year == int(birth_year),
            Athlete.parent_phone.isnot(None),
        )
        .all()
    )
    return [a for a in candidates if phones_match(a.parent_phone, digits)]
