"""Match live_double_sub JSON for 5-1 double substitution.

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-11-10
"""

from alembic import op
import sqlalchemy as sa


revision = "d3e4f5a6b7c8"
down_revision = "c2d3e4f5a6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("live_double_sub", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("matches", "live_double_sub")
