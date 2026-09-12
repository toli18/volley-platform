"""Persist school excuse stamp/signature in DB (Railway-safe).

Revision ID: a5b6c7d8e9f0
Revises: z3a4b5c6d7e8
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = "a5b6c7d8e9f0"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    club_cols = {c["name"] for c in inspector.get_columns("clubs")}
    if "school_excuse_signature_data" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_signature_data", sa.LargeBinary(), nullable=True))
    if "school_excuse_stamp_data" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_stamp_data", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("clubs", "school_excuse_stamp_data")
    op.drop_column("clubs", "school_excuse_signature_data")
