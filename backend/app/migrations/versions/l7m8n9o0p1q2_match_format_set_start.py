"""Match format (bo3/bo5) + set start rotation/serve snapshot

Revision ID: l7m8n9o0p1q2
Revises: k6l7m8n9o0p1
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "l7m8n9o0p1q2"
down_revision = "k6l7m8n9o0p1"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "matches" in tables:
        cols = {c["name"] for c in inspector.get_columns("matches")}
        if "format" not in cols:
            op.add_column(
                "matches",
                sa.Column("format", sa.String(length=8), nullable=False, server_default="bo5"),
            )

    if "match_sets" in tables:
        cols = {c["name"] for c in inspector.get_columns("match_sets")}
        if "start_rotation" not in cols:
            op.add_column(
                "match_sets",
                sa.Column("start_rotation", sa.Integer(), nullable=False, server_default="1"),
            )
        if "start_we_serve" not in cols:
            op.add_column(
                "match_sets",
                sa.Column("start_we_serve", sa.Integer(), nullable=False, server_default="1"),
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "match_sets" in tables:
        cols = {c["name"] for c in inspector.get_columns("match_sets")}
        if "start_we_serve" in cols:
            op.drop_column("match_sets", "start_we_serve")
        if "start_rotation" in cols:
            op.drop_column("match_sets", "start_rotation")

    if "matches" in tables:
        cols = {c["name"] for c in inspector.get_columns("matches")}
        if "format" in cols:
            op.drop_column("matches", "format")
