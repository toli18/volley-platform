import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .settings import settings


def _pool_dimensions():
    """
    Изчислява размера на connection pool-а ПО WORKER така, че общият брой
    връзки през всички uvicorn worker-и да остане в безопасен бюджет.

    Постгрес има таван `max_connections`; ако всеки worker отвори пълен pool,
    при няколко worker-а лесно се удря "too many connections". Затова делим
    общия бюджет на броя worker-и.

    Може да се override-не изрично с DB_POOL_SIZE / DB_MAX_OVERFLOW.
    """
    workers = max(1, int(os.getenv("WEB_CONCURRENCY", "1")))
    # Общ бюджет връзки за ЦЕЛИЯ процес (всички worker-и). Запазваме днешния ~40.
    total_budget = max(8, int(os.getenv("DB_TOTAL_CONNECTIONS", "40")))
    per_worker_total = max(4, total_budget // workers)
    default_pool = max(2, per_worker_total // 3)
    default_overflow = max(2, per_worker_total - default_pool)

    pool_size = int(os.getenv("DB_POOL_SIZE", str(default_pool)))
    max_overflow = int(os.getenv("DB_MAX_OVERFLOW", str(default_overflow)))
    return pool_size, max_overflow


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
    _pool_size, _max_overflow = _pool_dimensions()
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        # Pool-ът покрива request concurrency-то, но общо през всички worker-и
        # стои в безопасен бюджет (виж _pool_dimensions), за да не удряме
        # Postgres max_connections при scale.
        pool_size=_pool_size,
        max_overflow=_max_overflow,
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
