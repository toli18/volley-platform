"""Link club competitions to RIS official games.

Revision ID: a0b1c2d3e4f5
Revises: d8e9f0a1b2c3
Create Date: 2026-10-09
"""

from alembic import op
import sqlalchemy as sa


revision = "a0b1c2d3e4f5"
down_revision = "d8e9f0a1b2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "club_competition_events",
        sa.Column("ris_game_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("ris_championship_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("ris_match_number", sa.Integer(), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("ris_stream_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "club_competition_events",
        sa.Column("ris_synced_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_club_competition_events_ris_game_id",
        "club_competition_events",
        ["ris_game_id"],
        unique=True,
    )
    op.create_index(
        "ix_club_competition_events_ris_championship_id",
        "club_competition_events",
        ["ris_championship_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_club_competition_events_ris_championship_id",
        table_name="club_competition_events",
    )
    op.drop_index(
        "ix_club_competition_events_ris_game_id",
        table_name="club_competition_events",
    )
    op.drop_column("club_competition_events", "ris_synced_at")
    op.drop_column("club_competition_events", "ris_stream_url")
    op.drop_column("club_competition_events", "ris_match_number")
    op.drop_column("club_competition_events", "ris_championship_id")
    op.drop_column("club_competition_events", "ris_game_id")
