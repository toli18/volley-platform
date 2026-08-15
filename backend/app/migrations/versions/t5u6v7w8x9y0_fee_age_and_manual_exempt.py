"""Fee age exemption + per-athlete manual fee exempt.

Revision ID: t5u6v7w8x9y0
Revises: s4t5u6v7w8x9
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa


revision = "t5u6v7w8x9y0"
down_revision = "s4t5u6v7w8x9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clubs",
        sa.Column(
            "fee_age_exempt_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "clubs",
        sa.Column(
            "fee_age_exempt_min_age",
            sa.Integer(),
            nullable=False,
            server_default="18",
        ),
    )
    op.add_column(
        "clubs",
        sa.Column("fee_age_exempt_from_month", sa.String(length=7), nullable=True),
    )
    op.add_column(
        "athletes",
        sa.Column(
            "fee_exempt_manual",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("athletes", sa.Column("fee_exempt_note", sa.Text(), nullable=True))
    op.add_column(
        "athletes",
        sa.Column("fee_exempt_from_month", sa.String(length=7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("athletes", "fee_exempt_from_month")
    op.drop_column("athletes", "fee_exempt_note")
    op.drop_column("athletes", "fee_exempt_manual")
    op.drop_column("clubs", "fee_age_exempt_from_month")
    op.drop_column("clubs", "fee_age_exempt_min_age")
    op.drop_column("clubs", "fee_age_exempt_enabled")
