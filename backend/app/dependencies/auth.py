from app.routers.auth import get_current_user

def hash_password(password: str) -> str:
    return pwd_context.hash(password)
