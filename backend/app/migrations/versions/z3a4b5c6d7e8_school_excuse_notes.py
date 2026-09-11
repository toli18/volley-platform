"""School excuse notes — club template + athlete school fields.

Revision ID: z3a4b5c6d7e8
Revises: y1z2a3b4c5d6
Create Date: 2026-09-11
"""

from alembic import op
import sqlalchemy as sa


revision = "z3a4b5c6d7e8"
down_revision = "y1z2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    club_cols = {c["name"] for c in inspector.get_columns("clubs")}
    if "school_excuse_enabled" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    if "school_excuse_body" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_body", sa.Text(), nullable=True))
    if "school_excuse_chairman_name" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_chairman_name", sa.String(length=255), nullable=True))
    if "school_excuse_signature_rel" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_signature_rel", sa.String(length=500), nullable=True))
    if "school_excuse_stamp_rel" not in club_cols:
        op.add_column("clubs", sa.Column("school_excuse_stamp_rel", sa.String(length=500), nullable=True))

    athlete_cols = {c["name"] for c in inspector.get_columns("athletes")}
    if "school_name" not in athlete_cols:
        op.add_column("athletes", sa.Column("school_name", sa.String(length=255), nullable=True))
    if "school_class" not in athlete_cols:
        op.add_column("athletes", sa.Column("school_class", sa.String(length=32), nullable=True))
    if "school_city" not in athlete_cols:
        op.add_column("athletes", sa.Column("school_city", sa.String(length=120), nullable=True))
    if "school_email" not in athlete_cols:
        op.add_column("athletes", sa.Column("school_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    for col in (
        "school_excuse_enabled",
        "school_excuse_body",
        "school_excuse_chairman_name",
        "school_excuse_signature_rel",
        "school_excuse_stamp_rel",
    ):
        op.drop_column("clubs", col)
    for col in ("school_name", "school_class", "school_city", "school_email"):
        op.drop_column("athletes", col)
