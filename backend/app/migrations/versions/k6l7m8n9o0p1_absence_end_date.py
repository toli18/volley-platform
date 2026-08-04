"""Parent absence notices: optional end_date for multi-day ranges.

Revision ID: k6l7m8n9o0p1
Revises: j5k6l7m8n9o0
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "k6l7m8n9o0p1"
down_revision = "j5k6l7m8n9o0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "parent_absence_notices",
        sa.Column("end_date", sa.String(length=10), nullable=True),
    )
    op.create_index("ix_parent_absence_notices_end_date", "parent_absence_notices", ["end_date"])
    # Backfill: single-day notices keep end_date = notice_date
    op.execute("UPDATE parent_absence_notices SET end_date = notice_date WHERE end_date IS NULL")


def downgrade() -> None:
    op.drop_index("ix_parent_absence_notices_end_date", table_name="parent_absence_notices")
    op.drop_column("parent_absence_notices", "end_date")
