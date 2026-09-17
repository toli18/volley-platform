"""Alembic upgrade safe for legacy DBs (tables from create_all, no alembic_version)."""
from __future__ import annotations

import sys

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.database import engine
from app.settings import settings


def _alembic_config() -> Config:
    cfg = Config(str(settings.alembic_ini_path))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    cfg.set_main_option("script_location", str(settings.migrations_path))
    return cfg


def _current_revision() -> str | None:
    insp = inspect(engine)
    if not insp.has_table("alembic_version"):
        return None
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()


def main() -> int:
    cfg = _alembic_config()
    insp = inspect(engine)
    has_clubs = insp.has_table("clubs")
    rev = _current_revision()

    if has_clubs and rev is None:
        head = ScriptDirectory.from_config(cfg).get_heads()[0]
        print(f"ℹ️ Legacy PostgreSQL (clubs exists, no Alembic revision) — stamp {head}")
        command.stamp(cfg, head)

    try:
        command.upgrade(cfg, "head")
    except Exception as exc:  # noqa: BLE001
        msg = str(exc).lower()
        if has_clubs and ("already exists" in msg or "duplicatetable" in msg):
            head = ScriptDirectory.from_config(cfg).get_heads()[0]
            print(f"⚠️ Alembic upgrade hit existing tables — stamp {head} and retry once")
            command.stamp(cfg, head)
            command.upgrade(cfg, "head")
            return 0
        print(f"❌ Alembic upgrade failed: {exc}", file=sys.stderr)
        return 1

    print("✅ Alembic upgrade head")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
