"""Persist carding form canvas signatures in DB (Railway-safe).

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-09-12
"""

from alembic import op
import sqlalchemy as sa


revision = "b6c7d8e9f0a1"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athlete_carding_forms")}
    if "signature_parent1_image_data" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_parent1_image_data", sa.LargeBinary(), nullable=True),
        )
    if "signature_parent2_image_data" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_parent2_image_data", sa.LargeBinary(), nullable=True),
        )
    if "signature_athlete_image_data" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_athlete_image_data", sa.LargeBinary(), nullable=True),
        )


def downgrade() -> None:
    op.drop_column("athlete_carding_forms", "signature_athlete_image_data")
    op.drop_column("athlete_carding_forms", "signature_parent2_image_data")
    op.drop_column("athlete_carding_forms", "signature_parent1_image_data")
