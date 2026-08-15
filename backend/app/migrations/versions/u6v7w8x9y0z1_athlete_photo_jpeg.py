"""Persist athlete portrait bytes in DB (durable vs ephemeral disk).

Revision ID: u6v7w8x9y0z1
Revises: t5u6v7w8x9y0
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa


revision = "u6v7w8x9y0z1"
down_revision = "t5u6v7w8x9y0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("photo_jpeg", sa.LargeBinary(), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "photo_jpeg")
