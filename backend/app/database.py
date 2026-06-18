import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .settings import settings

# SQLAlchemy engine
# SQLite doesn't support pool_pre_ping, so we conditionally enable it
connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(
        settings.database_url,
        connect_args=connect_args,
    )
else:
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        # Pool must comfortably cover the request concurrency. FastAPI runs sync
        # endpoints in a ~40-thread pool, and dashboard screens fire ~10 parallel
        # requests, so a 15-connection pool is exhausted under light load.
        pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
        max_overflow=int(os.getenv("DB_MAX_OVERFLOW", "30")),
        # Fail fast instead of blocking a worker thread for a full minute, which
        # otherwise lets waiting requests pile up and cascade.
        pool_timeout=int(os.getenv("DB_POOL_TIMEOUT", "20")),
        pool_recycle=int(os.getenv("DB_POOL_RECYCLE", "300")),
        pool_reset_on_return="rollback",
        # Reuse most-recently-used connections so idle ones can be recycled.
        pool_use_lifo=True,
    )

# Session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class for ORM models
Base = declarative_base()


def get_db():
    """
    Dependency used in FastAPI routes.
    Creates a new DB session for the request and closes it afterward.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
