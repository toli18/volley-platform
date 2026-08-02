"""Coach SEK link fields + club default FirstCoach.

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa


revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("bvf_coach_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("bvf_coach_name", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("bvf_first_coach_proxy_id", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("bvf_first_coach_proxy_name", sa.String(length=255), nullable=True))
    op.create_index("ix_users_bvf_coach_id", "users", ["bvf_coach_id"], unique=False)

    op.add_column("clubs", sa.Column("bvf_default_first_coach_id", sa.Integer(), nullable=True))
    op.add_column("clubs", sa.Column("bvf_default_first_coach_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("clubs", "bvf_default_first_coach_name")
    op.drop_column("clubs", "bvf_default_first_coach_id")
    op.drop_index("ix_users_bvf_coach_id", table_name="users")
    op.drop_column("users", "bvf_first_coach_proxy_name")
    op.drop_column("users", "bvf_first_coach_proxy_id")
    op.drop_column("users", "bvf_coach_name")
    op.drop_column("users", "bvf_coach_id")
