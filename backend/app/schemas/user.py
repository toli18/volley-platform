from pydantic import BaseModel, EmailStr


class CreateCoach(BaseModel):
    name: str
    email: EmailStr
    password: str
    club_id: int
