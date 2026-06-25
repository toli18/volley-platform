from functools import lru_cache
import os
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import AliasChoices, Field, model_validator


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

    # Database configuration - supports common provider aliases
    database_url: str = Field(
        default="",
        validation_alias=AliasChoices(
            "DATABASE_URL",
            "database_url",
            "POSTGRES_URL",
            "POSTGRESQL_URL",
        ),
    )

    # JWT configuration - can use env vars or defaults
    jwt_secret: str = Field(default="changeme-secret", env="JWT_SECRET_KEY")
    jwt_algorithm: str = Field(default="HS256", env="JWT_ALGORITHM")
    access_token_expires_minutes: int = 60
    refresh_token_expires_minutes: int = 60 * 24 * 7

    # Alembic paths
    alembic_ini_path: Path = Path(__file__).resolve().parent.parent / "alembic.ini"
    migrations_path: Path = Path(__file__).resolve().parent / "migrations"

    storage_path: str = "./storage"
    cloudinary_cloud_name: Optional[str] = Field(default=None, env="CLOUDINARY_CLOUD_NAME")
    cloudinary_api_key: Optional[str] = Field(default=None, env="CLOUDINARY_API_KEY")
    cloudinary_api_secret: Optional[str] = Field(default=None, env="CLOUDINARY_API_SECRET")

    # Web Push (parent portal notifications) — generate with: python -m py_vapid --applicationServerKey
    vapid_public_key: Optional[str] = Field(default=None, env="VAPID_PUBLIC_KEY")
    vapid_private_key: Optional[str] = Field(default=None, env="VAPID_PRIVATE_KEY")
    vapid_subject: str = Field(default="mailto:support@volley-platform.local", env="VAPID_SUBJECT")
    parent_portal_public_url: Optional[str] = Field(
        default=None,
        env="PARENT_PORTAL_PUBLIC_URL",
        description="Base URL for links in push notifications (e.g. https://volley-platform.vercel.app)",
    )
    api_public_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices(
            "API_PUBLIC_URL",
            "api_public_url",
            "RAILWAY_PUBLIC_DOMAIN",
        ),
        description=(
            "Public base URL of THIS backend, used to build absolute links to "
            "/static files (e.g. club logos shown in push notifications). On "
            "Railway, RAILWAY_PUBLIC_DOMAIN is picked up automatically."
        ),
    )

    @model_validator(mode="after")
    def normalize_database_url(self) -> "Settings":
        url = (self.database_url or "").strip()
        if not url:
            # Railway/Postgres fallback: allow deriving URL from split PG vars.
            host = (os.getenv("PGHOST") or os.getenv("POSTGRES_HOST") or "").strip()
            port = (os.getenv("PGPORT") or os.getenv("POSTGRES_PORT") or "5432").strip()
            user = (os.getenv("PGUSER") or os.getenv("POSTGRES_USER") or "").strip()
            password = (os.getenv("PGPASSWORD") or os.getenv("POSTGRES_PASSWORD") or "").strip()
            database = (os.getenv("PGDATABASE") or os.getenv("POSTGRES_DB") or "").strip()
            if host and user and database:
                url = f"postgresql+psycopg://{user}:{password}@{host}:{port}/{database}"

        if not url:
            raise ValueError(
                "DATABASE_URL is missing or empty. "
                "Set DATABASE_URL in Railway Variables (or one of: database_url, POSTGRES_URL, POSTGRESQL_URL)."
            )

        # Some platforms still provide postgres://, normalize it for SQLAlchemy.
        if url.startswith("postgres://"):
            url = "postgresql+psycopg://" + url[len("postgres://") :]

        self.database_url = url
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
