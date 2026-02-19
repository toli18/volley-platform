from functools import lru_cache
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


def find_env_file() -> Optional[str]:
    """Find .env file in multiple possible locations."""
    # Get the directory where this settings.py file is located
    settings_dir = Path(__file__).resolve().parent
    
    # Possible locations for .env file (in order of preference)
    possible_paths = [
        settings_dir / ".env",  # backend/app/.env
        settings_dir.parent / ".env",  # backend/.env
        settings_dir.parent.parent / ".env",  # project root/.env
    ]
    
    # Check each path
    for env_path in possible_paths:
        if env_path.exists() and env_path.is_file():
            return str(env_path)
    
    return None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=find_env_file(),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    app_name: str = "Volley Platform API"
    debug: bool = False

    # Database configuration - required, must be provided via env var or .env file
    database_url: str = Field(..., env="DATABASE_URL")

    # JWT configuration - can use env vars or defaults
    jwt_secret: str = Field(default="changeme-secret", env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    access_token_expires_minutes: int = 60
    refresh_token_expires_minutes: int = 60 * 24 * 7

    # Alembic paths
    alembic_ini_path: Path = Path(__file__).resolve().parent.parent / "alembic.ini"
    migrations_path: Path = Path(__file__).resolve().parent / "migrations"

    storage_path: str = "./storage"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
