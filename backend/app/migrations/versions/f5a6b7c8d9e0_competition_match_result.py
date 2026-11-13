"""Add reported match result fields on competition events.

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-11-13
"""

from alembic import op
import sqlalchemy as sa


revision = "f5a6b7c8d9e0"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "club_competition_events",
        sa.Column("result_our_sets", sa.Integer(), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("result_opp_sets", sa.Integer(), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("result_source", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("result_synced_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("club_competition_events", "result_synced_at")
    op.drop_column("club_competition_events", "result_source")
    op.drop_column("club_competition_events", "result_opp_sets")
    op.drop_column("club_competition_events", "result_our_sets")
