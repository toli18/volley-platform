"""Match live_input_locked for shared dual-screen entry

Revision ID: m8n9o0p1q2r3
Revises: l7m8n9o0p1q2
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "m8n9o0p1q2r3"
down_revision = "l7m8n9o0p1q2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_input_locked" not in cols:
        op.add_column(
            "matches",
            sa.Column("live_input_locked", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_input_locked" in cols:
        op.drop_column("matches", "live_input_locked")
