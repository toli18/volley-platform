from datetime import timedelta
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_jwt_token,
    verify_password,
)
from ..database import SessionLocal
from ..models import User, UserRole, Club

router = APIRouter()

# HTTPBearer for simple Bearer token authentication (no OAuth2 flow)
security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: UserRole
    club_id: int | None

    class Config:
        from_attributes = True


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def authenticate_user(db: Session, email: str, password: str) -> User:
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if user.role == UserRole.coach and user.club_id is not None:
        club = db.get(Club, user.club_id)
        if club is not None and not bool(getattr(club, "is_active", True)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Достъпът е временно спрян за вашия клуб. Свържете се с администратор.",
            )
    return user


async def get_current_user(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> User:
    """
    Extract and validate JWT token from Authorization: Bearer <token> header.
    Manually extracts token from request headers if HTTPBearer doesn't provide it.
    Raises HTTPException 401 if token is missing or invalid.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    # Extract token from HTTPBearer or manually from Authorization header
    token = None
    if credentials:
        token = credentials.credentials
    else:
        # Fallback: manually extract from Authorization header
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split("Bearer ")[1]
    
    # If no token provided, raise 401
    if not token:
        raise credentials_exception
    
    try:
        payload = decode_jwt_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.get(User, int(user_id))
    if user is None:
        raise credentials_exception
    if user.role == UserRole.coach and user.club_id is not None:
        club = db.get(Club, user.club_id)
        if club is not None and not bool(getattr(club, "is_active", True)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Достъпът е временно спрян за вашия клуб. Свържете се с администратор.",
            )
    return user


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: Annotated[Session, Depends(get_db)],
):
    """
    Login endpoint that accepts JSON body with email and password.
    Returns JWT access token for use with Authorization: Bearer <token> header.
    """
    user = await authenticate_user(db, request.email, request.password)
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role.value},
        expires_delta=access_token_expires,
    )
    return TokenResponse(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=UserResponse)
async def read_current_user(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user
