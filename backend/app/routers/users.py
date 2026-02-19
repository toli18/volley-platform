from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from ..database import get_db
from ..models import User, UserRole
from ..auth import get_password_hash
from ..dependencies.roles import require_role

router = APIRouter(prefix="/users", tags=["Users"])


class CoachCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    club_id: int

class CoachUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    club_id: int | None = None


@router.post("/create-coach")
def create_coach(
    data: CoachCreate,
    db: Session = Depends(get_db),
    _admin=Depends(
        require_role(UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    # email unique
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already exists")

    # max 2 coaches per club
    coaches_count = (
        db.query(User)
        .filter(User.role == UserRole.coach, User.club_id == data.club_id)
        .count()
    )

    if coaches_count >= 2:
        raise HTTPException(
            status_code=400,
            detail="This club already has 2 coaches",
        )

    # ТОЗИ КОД ТРЯБВА ДА Е ВЪТРЕ ВЪВ ФУНКЦИЯТА (С ОТСТЪП!)
    user = User(
        email=data.email,
        name=data.name,
        hashed_password=get_password_hash(data.password),
        role=UserRole.coach,
        club_id=data.club_id,
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/coaches")
def list_coaches(
    db: Session = Depends(get_db),
    _admin=Depends(
        require_role(UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    return db.query(User).filter(User.role == UserRole.coach).all()


@router.get("/coaches/{coach_id}")
def get_coach(
    coach_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = db.query(User).filter(User.id == coach_id, User.role == UserRole.coach).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    return coach


@router.patch("/coaches/{coach_id}")
def update_coach(
    coach_id: int,
    data: CoachUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = db.query(User).filter(User.id == coach_id, User.role == UserRole.coach).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    payload = data.model_dump(exclude_unset=True)

    if "email" in payload:
        existing = db.query(User).filter(User.email == payload["email"], User.id != coach_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already exists")

    if "club_id" in payload and payload["club_id"] is not None:
        coaches_count = (
            db.query(User)
            .filter(User.role == UserRole.coach, User.club_id == payload["club_id"], User.id != coach_id)
            .count()
        )
        if coaches_count >= 2:
            raise HTTPException(status_code=400, detail="This club already has 2 coaches")

    if "name" in payload:
        coach.name = payload["name"]
    if "email" in payload:
        coach.email = payload["email"]
    if "club_id" in payload:
        coach.club_id = payload["club_id"]
    if "password" in payload and payload["password"]:
        coach.hashed_password = get_password_hash(payload["password"])

    db.commit()
    db.refresh(coach)
    return coach


@router.delete("/coaches/{coach_id}")
def delete_coach(
    coach_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = db.query(User).filter(User.id == coach_id, User.role == UserRole.coach).first()
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    db.delete(coach)
    db.commit()
    return {"ok": True}