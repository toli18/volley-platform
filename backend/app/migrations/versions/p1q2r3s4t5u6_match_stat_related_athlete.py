"""Add related_athlete_id on match_stat_events for substitutions

Revision ID: p1q2r3s4t5u6
Revises: o0p1q2r3s4t5
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa


revision = "p1q2r3s4t5u6"
down_revision = "o0p1q2r3s4t5"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "match_stat_events" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("match_stat_events")}
    if "related_athlete_id" not in cols:
        op.add_column(
            "match_stat_events",
            sa.Column("related_athlete_id", sa.Integer(), nullable=True),
        )
        op.create_index(
            "ix_match_stat_events_related_athlete_id",
            "match_stat_events",
            ["related_athlete_id"],
        )
        try:
            op.create_foreign_key(
                "fk_match_stat_events_related_athlete_id",
                "match_stat_events",
                "athletes",
                ["related_athlete_id"],
                ["id"],
                ondelete="SET NULL",
            )
        except Exception:
            pass


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "match_stat_events" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("match_stat_events")}
    if "related_athlete_id" in cols:
        try:
            op.drop_constraint("fk_match_stat_events_related_athlete_id", "match_stat_events", type_="foreignkey")
        except Exception:
            pass
        try:
            op.drop_index("ix_match_stat_events_related_athlete_id", table_name="match_stat_events")
        except Exception:
            pass
        op.drop_column("match_stat_events", "related_athlete_id")
