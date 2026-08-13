"""Add canvas signature image paths on carding forms.

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-08-13
"""

from alembic import op
import sqlalchemy as sa


revision = "r3s4t5u6v7w8"
down_revision = "q2r3s4t5u6v7"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athlete_carding_forms")}
    if "signature_parent1_image_rel" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_parent1_image_rel", sa.String(length=500), nullable=True),
        )
    if "signature_athlete_image_rel" not in cols:
        op.add_column(
            "athlete_carding_forms",
            sa.Column("signature_athlete_image_rel", sa.String(length=500), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athlete_carding_forms")}
    if "signature_athlete_image_rel" in cols:
        op.drop_column("athlete_carding_forms", "signature_athlete_image_rel")
    if "signature_parent1_image_rel" in cols:
        op.drop_column("athlete_carding_forms", "signature_parent1_image_rel")
