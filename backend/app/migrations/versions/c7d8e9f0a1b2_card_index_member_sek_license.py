"""Track which SEK license each card-index member was synced to.

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-09-17
"""

from alembic import op
import sqlalchemy as sa


revision = "c7d8e9f0a1b2"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "bvf_card_index_members",
        sa.Column("sek_bvf_card_index_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_bvf_card_index_members_sek_bvf_card_index_id",
        "bvf_card_index_members",
        ["sek_bvf_card_index_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_bvf_card_index_members_sek_bvf_card_index_id", table_name="bvf_card_index_members")
    op.drop_column("bvf_card_index_members", "sek_bvf_card_index_id")
