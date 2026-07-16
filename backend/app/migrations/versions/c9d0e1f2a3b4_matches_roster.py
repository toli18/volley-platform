"""Create matches and match_roster_players tables

Revision ID: c9d0e1f2a3b4
Revises: b8c4d1e2f3a0
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "c9d0e1f2a3b4"
down_revision = "b8c4d1e2f3a0"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "matches" not in tables:
        op.create_table(
            "matches",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("opponent_name", sa.String(length=255), nullable=True),
            sa.Column("match_date", sa.Date(), nullable=True),
            sa.Column("venue", sa.String(length=255), nullable=True),
            sa.Column("system", sa.String(length=8), nullable=False, server_default="5-1"),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="draft"),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )
        op.create_index("ix_matches_team_id", "matches", ["team_id"])
        op.create_index("ix_matches_status", "matches", ["status"])

    tables = set(sa.inspect(bind).get_table_names())
    if "match_roster_players" not in tables:
        op.create_table(
            "match_roster_players",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("jersey_number", sa.Integer(), nullable=False),
            sa.Column("position", sa.String(length=8), nullable=False),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.UniqueConstraint("match_id", "athlete_id", name="uq_match_roster_athlete"),
            sa.UniqueConstraint("match_id", "jersey_number", name="uq_match_roster_jersey"),
        )
        op.create_index("ix_match_roster_players_match_id", "match_roster_players", ["match_id"])
        op.create_index("ix_match_roster_players_athlete_id", "match_roster_players", ["athlete_id"])


def downgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "match_roster_players" in tables:
        op.drop_table("match_roster_players")
    if "matches" in tables:
        op.drop_table("matches")
