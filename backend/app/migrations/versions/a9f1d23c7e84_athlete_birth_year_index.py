"""athlete birth_year index

Speeds up athlete/parent login lookups which filter on birth_year.

Revision ID: a9f1d23c7e84
Revises: c8d4e5f6a7b8
Create Date: 2026-06-19 10:15:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a9f1d23c7e84"
down_revision = "c8d4e5f6a7b8"
branch_labels = None
depends_on = None

_INDEX_NAME = "ix_athletes_birth_year"


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "athletes" not in inspector.get_table_names():
        return
    existing = {ix["name"] for ix in inspector.get_indexes("athletes")}
    if _INDEX_NAME in existing:
        return
    op.create_index(_INDEX_NAME, "athletes", ["birth_year"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "athletes" not in inspector.get_table_names():
        return
    existing = {ix["name"] for ix in inspector.get_indexes("athletes")}
    if _INDEX_NAME in existing:
        op.drop_index(_INDEX_NAME, table_name="athletes")
