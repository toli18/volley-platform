"""training_assignments completion_note

Revision ID: b4e2c1d0a9f8
Revises: c3a8e4d91b2f
Create Date: 2026-05-04 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b4e2c1d0a9f8"
down_revision = "c3a8e4d91b2f"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("training_assignments")}
    if "completion_note" not in cols:
        op.add_column("training_assignments", sa.Column("completion_note", sa.Text(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("training_assignments")}
    if "completion_note" in cols:
        op.drop_column("training_assignments", "completion_note")
