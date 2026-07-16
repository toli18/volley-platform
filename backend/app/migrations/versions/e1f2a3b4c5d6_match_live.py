"""Add match_sets and match_stat_events for live scoring

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "e1f2a3b4c5d6"
down_revision = "d0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())

    if "match_sets" not in tables:
        op.create_table(
            "match_sets",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("set_number", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("our_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("opp_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("rotation", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("we_serve", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("status", sa.String(length=16), nullable=False, server_default="in_progress"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.UniqueConstraint("match_id", "set_number", name="uq_match_set_number"),
        )
        op.create_index("ix_match_sets_match_id", "match_sets", ["match_id"])

    tables = set(sa.inspect(bind).get_table_names())
    if "match_stat_events" not in tables:
        op.create_table(
            "match_stat_events",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("set_id", sa.Integer(), sa.ForeignKey("match_sets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True),
            sa.Column("action", sa.String(length=24), nullable=False),
            sa.Column("rotation", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("our_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("opp_score", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("we_serve", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("scored_for", sa.String(length=8), nullable=True),
            sa.Column("undone", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        )
        op.create_index("ix_match_stat_events_match_id", "match_stat_events", ["match_id"])
        op.create_index("ix_match_stat_events_set_id", "match_stat_events", ["set_id"])
        op.create_index("ix_match_stat_events_athlete_id", "match_stat_events", ["athlete_id"])


def downgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "match_stat_events" in tables:
        op.drop_table("match_stat_events")
    if "match_sets" in tables:
        op.drop_table("match_sets")
