"""Athlete club jersey number + link matches to competitions.

Revision ID: v7w8x9y0z1a2
Revises: u6v7w8x9y0z1
Create Date: 2026-08-16
"""

from alembic import op
import sqlalchemy as sa


revision = "v7w8x9y0z1a2"
down_revision = "u6v7w8x9y0z1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("jersey_number", sa.Integer(), nullable=True))
    op.create_index("ix_athletes_jersey_number", "athletes", ["jersey_number"], unique=False)
    op.add_column(
        "matches",
        sa.Column("competition_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_matches_competition_id", "matches", ["competition_id"], unique=False)
    try:
        op.create_foreign_key(
            "fk_matches_competition_id",
            "matches",
            "club_competition_events",
            ["competition_id"],
            ["id"],
            ondelete="SET NULL",
        )
    except Exception:
        pass


def downgrade() -> None:
    try:
        op.drop_constraint("fk_matches_competition_id", "matches", type_="foreignkey")
    except Exception:
        pass
    op.drop_index("ix_matches_competition_id", table_name="matches")
    op.drop_column("matches", "competition_id")
    op.drop_index("ix_athletes_jersey_number", table_name="athletes")
    op.drop_column("athletes", "jersey_number")
