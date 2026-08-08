"""Add competition travel roster (тимов лист)

Revision ID: q2r3s4t5u6v7
Revises: p1q2r3s4t5u6
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa


revision = "q2r3s4t5u6v7"
down_revision = "p1q2r3s4t5u6"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "club_competition_events" in tables:
        cols = {c["name"] for c in inspector.get_columns("club_competition_events")}
        if "roster_status" not in cols:
            op.add_column(
                "club_competition_events",
                sa.Column("roster_status", sa.String(length=16), nullable=False, server_default="pending"),
            )
        if "roster_edit_count" not in cols:
            op.add_column(
                "club_competition_events",
                sa.Column("roster_edit_count", sa.Integer(), nullable=False, server_default="0"),
            )
        if "roster_confirmed_at" not in cols:
            op.add_column(
                "club_competition_events",
                sa.Column("roster_confirmed_at", sa.DateTime(), nullable=True),
            )
        if "roster_locked_at" not in cols:
            op.add_column(
                "club_competition_events",
                sa.Column("roster_locked_at", sa.DateTime(), nullable=True),
            )

    if "competition_roster_athletes" not in tables:
        op.create_table(
            "competition_roster_athletes",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("competition_id", sa.Integer(), sa.ForeignKey("club_competition_events.id", ondelete="CASCADE"), nullable=False),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("competition_id", "athlete_id", name="uq_competition_roster_athlete"),
        )
        op.create_index("ix_competition_roster_athletes_competition_id", "competition_roster_athletes", ["competition_id"])
        op.create_index("ix_competition_roster_athletes_athlete_id", "competition_roster_athletes", ["athlete_id"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "competition_roster_athletes" in tables:
        op.drop_table("competition_roster_athletes")
    if "club_competition_events" in tables:
        cols = {c["name"] for c in inspector.get_columns("club_competition_events")}
        for name in ("roster_locked_at", "roster_confirmed_at", "roster_edit_count", "roster_status"):
            if name in cols:
                op.drop_column("club_competition_events", name)
