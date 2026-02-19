"""Minimal startup check to ensure the API boots after migrations.

Run this against a running PostgreSQL instance configured via DATABASE_URL,
for example:

    DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/volley_platform \
    poetry run python scripts/check_startup.py
"""

import sys

from backend.app.init_db import init_db
from backend.app.main import app  # noqa: F401  # Ensure FastAPI app can import


if __name__ == "__main__":
    ok = init_db()
    if not ok:
        sys.exit(1)

    print("✅ Database initialized; you can now run uvicorn backend.app.main:app")
