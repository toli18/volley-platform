"""Match live court positions JSON

Revision ID: o0p1q2r3s4t5
Revises: n9o0p1q2r3s4
Create Date: 2026-08-06
"""

from alembic import op
import sqlalchemy as sa


revision = "o0p1q2r3s4t5"
down_revision = "n9o0p1q2r3s4"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_court_positions" not in cols:
        op.add_column("matches", sa.Column("live_court_positions", sa.JSON(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_court_positions" in cols:
        op.drop_column("matches", "live_court_positions")
