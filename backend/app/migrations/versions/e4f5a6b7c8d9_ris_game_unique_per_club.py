"""Allow same RIS game in both clubs' calendars.

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-11-12
"""

from alembic import op


revision = "e4f5a6b7c8d9"
down_revision = "d3e4f5a6b7c8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_club_competition_events_ris_game_id")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_club_competition_events_ris_game_id "
        "ON club_competition_events (ris_game_id)"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_competition_club_ris_game "
        "ON club_competition_events (club_id, ris_game_id)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_competition_club_ris_game")
    op.execute("DROP INDEX IF EXISTS ix_club_competition_events_ris_game_id")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_club_competition_events_ris_game_id "
        "ON club_competition_events (ris_game_id)"
    )
