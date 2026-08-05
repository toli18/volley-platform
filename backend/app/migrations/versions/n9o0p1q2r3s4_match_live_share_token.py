"""Match public live share token

Revision ID: n9o0p1q2r3s4
Revises: m8n9o0p1q2r3
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "n9o0p1q2r3s4"
down_revision = "m8n9o0p1q2r3"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_share_token" not in cols:
        op.add_column("matches", sa.Column("live_share_token", sa.String(length=64), nullable=True))
        op.create_index("ix_matches_live_share_token", "matches", ["live_share_token"], unique=True)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "matches" not in tables:
        return
    cols = {c["name"] for c in inspector.get_columns("matches")}
    if "live_share_token" in cols:
        op.drop_index("ix_matches_live_share_token", table_name="matches")
        op.drop_column("matches", "live_share_token")
