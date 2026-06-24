"""trainings: link to team and session_date

Revision ID: e7a1b2c3d4f5
Revises: d2e3f4a5b6c7
Create Date: 2026-06-24 18:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e7a1b2c3d4f5"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("trainings")}
    if "team_id" not in cols:
        op.add_column("trainings", sa.Column("team_id", sa.Integer(), nullable=True))
        op.create_index("ix_trainings_team_id", "trainings", ["team_id"])
    if "session_date" not in cols:
        op.add_column("trainings", sa.Column("session_date", sa.String(length=10), nullable=True))
        op.create_index("ix_trainings_session_date", "trainings", ["session_date"])


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("trainings")}
    indexes = {ix["name"] for ix in inspector.get_indexes("trainings")}
    if "session_date" in cols:
        if "ix_trainings_session_date" in indexes:
            op.drop_index("ix_trainings_session_date", table_name="trainings")
        op.drop_column("trainings", "session_date")
    if "team_id" in cols:
        if "ix_trainings_team_id" in indexes:
            op.drop_index("ix_trainings_team_id", table_name="trainings")
        op.drop_column("trainings", "team_id")
