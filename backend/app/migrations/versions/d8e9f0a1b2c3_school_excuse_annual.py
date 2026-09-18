"""Annual school excuse (занималня) — club template flag.

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-09-18
"""

from alembic import op
import sqlalchemy as sa


revision = "d8e9f0a1b2c3"
down_revision = "c7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    club_cols = {c["name"] for c in inspector.get_columns("clubs")}
    if "school_excuse_annual_enabled" not in club_cols:
        op.add_column(
            "clubs",
            sa.Column("school_excuse_annual_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        )
    if "school_excuse_annual_body" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_annual_body", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("clubs", "school_excuse_annual_body")
    op.drop_column("clubs", "school_excuse_annual_enabled")
