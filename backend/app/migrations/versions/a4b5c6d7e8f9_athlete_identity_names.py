"""Athlete identity fields for BVF readiness (names, nationality, photo id)."""

from alembic import op
import sqlalchemy as sa


revision = "a4b5c6d7e8f9"
down_revision = "f2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("athletes", sa.Column("first_name", sa.String(length=25), nullable=True))
    op.add_column("athletes", sa.Column("middle_name", sa.String(length=25), nullable=True))
    op.add_column("athletes", sa.Column("last_name", sa.String(length=25), nullable=True))
    op.add_column("athletes", sa.Column("nationality", sa.String(length=25), nullable=True))
    op.add_column("athletes", sa.Column("bvf_photo_id", sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column("athletes", "bvf_photo_id")
    op.drop_column("athletes", "nationality")
    op.drop_column("athletes", "last_name")
    op.drop_column("athletes", "middle_name")
    op.drop_column("athletes", "first_name")
