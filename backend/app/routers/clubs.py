from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ..database import get_db
from ..models import Club, UserRole, User
from ..dependencies.roles import require_role

router = APIRouter(prefix="/clubs", tags=["Clubs"])

class ClubUpdate(BaseModel):
    name: str | None = None
    city: str | None = None
    country: str | None = None
    address: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    website_url: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


@router.get("/")
def get_clubs(
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin))
):
    return db.query(Club).all()


@router.post("/")
def create_club(
    club: dict,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin))
):
    new_club = Club(**club)
    db.add(new_club)
    db.commit()
    db.refresh(new_club)
    return new_club


@router.patch("/{club_id}")
def update_club(
    club_id: int,
    payload: ClubUpdate,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(club, k, v)

    db.commit()
    db.refresh(club)
    return club


@router.post("/{club_id}/toggle-access")
def toggle_club_access(
    club_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")
    club.is_active = not bool(getattr(club, "is_active", True))
    db.commit()
    db.refresh(club)
    return {"id": club.id, "is_active": club.is_active}


@router.delete("/{club_id}")
def delete_club(
    club_id: int,
    db: Session = Depends(get_db),
    user=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    club = db.query(Club).filter(Club.id == club_id).first()
    if not club:
        raise HTTPException(status_code=404, detail="Club not found")

    linked_users = db.query(User).filter(User.club_id == club_id).count()
    if linked_users > 0:
        raise HTTPException(
            status_code=400,
            detail="Не може да изтриете клуб с активни треньори. Преместете или изтрийте треньорите първо.",
        )

    db.delete(club)
    db.commit()
    return {"ok": True}
