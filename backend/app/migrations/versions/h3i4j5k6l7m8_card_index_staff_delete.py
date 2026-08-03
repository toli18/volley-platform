"""Card index second coach + doctor; support local draft delete.

Revision ID: h3i4j5k6l7m8
Revises: g2h3i4j5k6l7
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "h3i4j5k6l7m8"
down_revision = "g2h3i4j5k6l7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bvf_card_indexes",
        sa.Column("second_coach_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("bvf_card_indexes", sa.Column("doctor_name", sa.String(length=255), nullable=True))
    op.create_index("ix_bvf_card_indexes_second_coach_user_id", "bvf_card_indexes", ["second_coach_user_id"])


def downgrade() -> None:
    op.drop_index("ix_bvf_card_indexes_second_coach_user_id", table_name="bvf_card_indexes")
    op.drop_column("bvf_card_indexes", "doctor_name")
    op.drop_column("bvf_card_indexes", "second_coach_user_id")
