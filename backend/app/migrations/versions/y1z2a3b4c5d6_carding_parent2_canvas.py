"""Require canvas signature for parent 2 on carding forms.

Revision ID: y1z2a3b4c5d6
Revises: x9y0z1a2b3c4
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa


revision = "y1z2a3b4c5d6"
down_revision = "x9y0z1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athlete_carding_forms")}
    if "signature_parent2_image_rel" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_parent2_image_rel", sa.String(length=500), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athlete_carding_forms")}
    if "signature_parent2_image_rel" in cols:
        op.drop_column("athlete_carding_forms", "signature_parent2_image_rel")
