from fastapi import Depends, HTTPException, status
from app.dependencies.auth import get_current_user
from app.models import UserRole


def require_role(*allowed_roles: UserRole):
    """
    Usage:
      Depends(require_role(UserRole.platform_admin))
      Depends(require_role(UserRole.coach, UserRole.platform_admin))
    """
    def checker(user=Depends(get_current_user)):
        # user.role може да е Enum или string - нормализираме
        role_value = user.role.value if hasattr(user.role, "value") else user.role

        allowed_values = [
            r.value if hasattr(r, "value") else r
            for r in allowed_roles
        ]

        if role_value not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return user

    return checker
