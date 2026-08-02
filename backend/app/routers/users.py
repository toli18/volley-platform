from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from ..database import get_db
from ..models import Club, User, UserRole
from ..auth import get_password_hash
from ..dependencies.roles import require_role
from ..services.bvf_coach_link import apply_sek_link, coach_public_sek_fields

router = APIRouter(prefix="/users", tags=["Users"])


class CoachCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    club_id: int
    sek_link_mode: str | None = "none"  # self | proxy | none
    bvf_coach_id: int | None = None
    bvf_coach_name: str | None = None
    bvf_first_coach_proxy_id: int | None = None
    bvf_first_coach_proxy_name: str | None = None
    set_as_club_default_first_coach: bool = False


class CoachUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: str | None = None
    club_id: int | None = None
    sek_link_mode: str | None = None
    bvf_coach_id: int | None = None
    bvf_coach_name: str | None = None
    bvf_first_coach_proxy_id: int | None = None
    bvf_first_coach_proxy_name: str | None = None
    set_as_club_default_first_coach: bool | None = None


class HeadCoachAssign(BaseModel):
    user_id: int


def _role_value(role) -> str:
    return role.value if hasattr(role, "value") else str(role)


def _coach_out(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": _role_value(user.role),
        "club_id": user.club_id,
        "created_at": user.created_at,
        **coach_public_sek_fields(user),
    }


def _maybe_set_club_default(db: Session, user: User, enabled: bool) -> None:
    if not enabled or not user.club_id or not user.bvf_coach_id:
        return
    club = db.query(Club).filter(Club.id == user.club_id).first()
    if not club:
        return
    club.bvf_default_first_coach_id = int(user.bvf_coach_id)
    club.bvf_default_first_coach_name = (
        (user.bvf_coach_name or "").strip() or f"БФВ #{int(user.bvf_coach_id)}"
    )


@router.post("/create-coach")
def create_coach(
    data: CoachCreate,
    db: Session = Depends(get_db),
    _admin=Depends(
        require_role(UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email вече съществува")

    user = User(
        email=data.email,
        name=data.name,
        hashed_password=get_password_hash(data.password),
        role=UserRole.coach,
        club_id=data.club_id,
    )

    try:
        apply_sek_link(
            user,
            mode=data.sek_link_mode or "none",
            bvf_coach_id=data.bvf_coach_id,
            bvf_coach_name=data.bvf_coach_name,
            proxy_id=data.bvf_first_coach_proxy_id,
            proxy_name=data.bvf_first_coach_proxy_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.add(user)
    db.flush()
    _maybe_set_club_default(db, user, bool(data.set_as_club_default_first_coach))
    db.commit()
    db.refresh(user)
    return _coach_out(user)


@router.get("/coaches")
def list_coaches(
    db: Session = Depends(get_db),
    _admin=Depends(
        require_role(UserRole.platform_admin, UserRole.federation_admin)
    ),
):
    rows = db.query(User).filter(User.role.in_([UserRole.coach, UserRole.club_head_coach])).all()
    return [_coach_out(u) for u in rows]


@router.get("/coaches/{coach_id}")
def get_coach(
    coach_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = (
        db.query(User)
        .filter(User.id == coach_id, User.role.in_([UserRole.coach, UserRole.club_head_coach]))
        .first()
    )
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    return _coach_out(coach)


@router.patch("/coaches/{coach_id}")
def update_coach(
    coach_id: int,
    data: CoachUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = (
        db.query(User)
        .filter(User.id == coach_id, User.role.in_([UserRole.coach, UserRole.club_head_coach]))
        .first()
    )
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")

    payload = data.model_dump(exclude_unset=True)

    if "email" in payload:
        existing = db.query(User).filter(User.email == payload["email"], User.id != coach_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email вече съществува")

    if "name" in payload:
        coach.name = payload["name"]
    if "email" in payload:
        coach.email = payload["email"]
    if "club_id" in payload:
        coach.club_id = payload["club_id"]
    if "password" in payload and payload["password"]:
        coach.hashed_password = get_password_hash(payload["password"])

    if "sek_link_mode" in payload:
        try:
            apply_sek_link(
                coach,
                mode=payload.get("sek_link_mode") or "none",
                bvf_coach_id=payload.get("bvf_coach_id"),
                bvf_coach_name=payload.get("bvf_coach_name"),
                proxy_id=payload.get("bvf_first_coach_proxy_id"),
                proxy_name=payload.get("bvf_first_coach_proxy_name"),
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    if payload.get("set_as_club_default_first_coach"):
        _maybe_set_club_default(db, coach, True)

    db.commit()
    db.refresh(coach)
    return _coach_out(coach)


@router.delete("/coaches/{coach_id}")
def delete_coach(
    coach_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    coach = (
        db.query(User)
        .filter(User.id == coach_id, User.role.in_([UserRole.coach, UserRole.club_head_coach]))
        .first()
    )
    if not coach:
        raise HTTPException(status_code=404, detail="Coach not found")
    db.delete(coach)
    db.commit()
    return {"ok": True}


@router.put("/clubs/{club_id}/head-coach")
def assign_head_coach(
    club_id: int,
    data: HeadCoachAssign,
    db: Session = Depends(get_db),
    _admin=Depends(require_role(UserRole.platform_admin, UserRole.federation_admin)),
):
    target = (
        db.query(User)
        .filter(
            User.id == data.user_id,
            User.club_id == club_id,
            User.role.in_([UserRole.coach, UserRole.club_head_coach]),
        )
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Coach not found in this club")

    current_head = (
        db.query(User)
        .filter(User.club_id == club_id, User.role == UserRole.club_head_coach)
        .first()
    )
    if current_head and current_head.id != target.id:
        current_head.role = UserRole.coach

    target.role = UserRole.club_head_coach
    club = db.query(Club).filter(Club.id == club_id).first()
    if club and target.bvf_coach_id and not club.bvf_default_first_coach_id:
        _maybe_set_club_default(db, target, True)

    db.commit()
    db.refresh(target)
    return _coach_out(target)
