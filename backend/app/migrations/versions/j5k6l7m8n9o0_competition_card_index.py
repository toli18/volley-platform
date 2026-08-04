"""Optional card_index_id on club competitions for SEK roster link.

Revision ID: j5k6l7m8n9o0
Revises: i4j5k6l7m8n9
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "j5k6l7m8n9o0"
down_revision = "i4j5k6l7m8n9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "club_competition_events",
        sa.Column("card_index_id", sa.Integer(), sa.ForeignKey("bvf_card_indexes.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index(
        "ix_club_competition_events_card_index_id",
        "club_competition_events",
        ["card_index_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_club_competition_events_card_index_id", table_name="club_competition_events")
    op.drop_column("club_competition_events", "card_index_id")
