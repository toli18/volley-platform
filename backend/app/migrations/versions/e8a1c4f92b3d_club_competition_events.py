"""club_competition_events

Revision ID: e8a1c4f92b3d
Revises: b4e2c1d0a9f8
Create Date: 2026-05-17 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e8a1c4f92b3d"
down_revision = "b4e2c1d0a9f8"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "club_competition_events" in inspector.get_table_names():
        return
    op.create_table(
        "club_competition_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), nullable=False),
        sa.Column("team_id", sa.Integer(), nullable=False),
        sa.Column("coach_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.String(length=10), nullable=False),
        sa.Column("start_time", sa.String(length=5), nullable=False),
        sa.Column("end_time", sa.String(length=5), nullable=False),
        sa.Column("location", sa.String(length=255), nullable=False),
        sa.Column("competition_kind", sa.String(length=32), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["coach_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_competition_club_date", "club_competition_events", ["club_id", "date"])
    op.create_index(op.f("ix_club_competition_events_club_id"), "club_competition_events", ["club_id"])
    op.create_index(op.f("ix_club_competition_events_team_id"), "club_competition_events", ["team_id"])
    op.create_index(op.f("ix_club_competition_events_coach_id"), "club_competition_events", ["coach_id"])
    op.create_index(op.f("ix_club_competition_events_date"), "club_competition_events", ["date"])
    op.create_index(op.f("ix_club_competition_events_competition_kind"), "club_competition_events", ["competition_kind"])
    op.create_index(op.f("ix_club_competition_events_is_cancelled"), "club_competition_events", ["is_cancelled"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "club_competition_events" not in inspector.get_table_names():
        return
    op.drop_table("club_competition_events")
