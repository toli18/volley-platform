"""Add opponent_name to club competitions.

Revision ID: w8x9y0z1a2b3
Revises: v7w8x9y0z1a2
Create Date: 2026-08-16
"""

from alembic import op
import sqlalchemy as sa


revision = "w8x9y0z1a2b3"
down_revision = "v7w8x9y0z1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "club_competition_events",
        sa.Column("opponent_name", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("club_competition_events", "opponent_name")
