"""Club profile fields from SEK + coach phones.

Revision ID: i4j5k6l7m8n9
Revises: h3i4j5k6l7m8
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "i4j5k6l7m8n9"
down_revision = "h3i4j5k6l7m8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("full_name", sa.String(length=500), nullable=True))
    op.add_column("clubs", sa.Column("bulstat", sa.String(length=32), nullable=True))
    op.add_column("clubs", sa.Column("license_number", sa.String(length=64), nullable=True))
    op.add_column("clubs", sa.Column("bvf_region", sa.String(length=120), nullable=True))
    op.add_column("clubs", sa.Column("bvf_logo_id", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("phone", sa.String(length=50), nullable=True))
    op.add_column(
        "users",
        sa.Column("phone_visible_to_parents", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_column("users", "phone_visible_to_parents")
    op.drop_column("users", "phone")
    op.drop_column("clubs", "bvf_logo_id")
    op.drop_column("clubs", "bvf_region")
    op.drop_column("clubs", "license_number")
    op.drop_column("clubs", "bulstat")
    op.drop_column("clubs", "full_name")
