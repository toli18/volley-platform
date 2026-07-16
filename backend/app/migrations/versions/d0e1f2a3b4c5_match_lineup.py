"""Add match lineup slots and libero_athlete_id

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "d0e1f2a3b4c5"
down_revision = "c9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "matches" in tables:
        cols = {c["name"] for c in inspector.get_columns("matches")}
        if "libero_athlete_id" not in cols:
            op.add_column(
                "matches",
                sa.Column("libero_athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True),
            )

    tables = set(sa.inspect(bind).get_table_names())
    if "match_lineup_slots" not in tables:
        op.create_table(
            "match_lineup_slots",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
            sa.Column("zone", sa.Integer(), nullable=False),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
            sa.UniqueConstraint("match_id", "zone", name="uq_match_lineup_zone"),
        )
        op.create_index("ix_match_lineup_slots_match_id", "match_lineup_slots", ["match_id"])


def downgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "match_lineup_slots" in tables:
        op.drop_table("match_lineup_slots")
    if "matches" in tables:
        cols = {c["name"] for c in sa.inspect(bind).get_columns("matches")}
        if "libero_athlete_id" in cols:
            op.drop_column("matches", "libero_athlete_id")
