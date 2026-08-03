"""Parent Form 03 / 03-A carding forms (seasonal).

Revision ID: g2h3i4j5k6l7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "g2h3i4j5k6l7"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_carding_forms",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("season_year", sa.Integer(), nullable=False),
        # "03" (<14) | "03a" (14+)
        sa.Column("form_kind", sa.String(length=8), nullable=False),
        sa.Column("parent1_full_name", sa.String(length=255), nullable=False),
        sa.Column("parent1_egn", sa.String(length=16), nullable=False),
        sa.Column("parent2_full_name", sa.String(length=255), nullable=True),
        sa.Column("parent2_egn", sa.String(length=16), nullable=True),
        sa.Column("athlete_full_name", sa.String(length=255), nullable=False),
        sa.Column("athlete_egn", sa.String(length=16), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("rules_accepted", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("signature_parent1", sa.String(length=255), nullable=False),
        sa.Column("signature_parent2", sa.String(length=255), nullable=True),
        sa.Column("signature_athlete", sa.String(length=255), nullable=True),
        sa.Column("signed_at", sa.DateTime(), nullable=False),
        sa.Column("club_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("season_label_snapshot", sa.String(length=64), nullable=True),
        sa.Column("pdf_rel_path", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_athlete_carding_forms_athlete_id", "athlete_carding_forms", ["athlete_id"])
    op.create_index("ix_athlete_carding_forms_club_id", "athlete_carding_forms", ["club_id"])
    op.create_index("ix_athlete_carding_forms_season_year", "athlete_carding_forms", ["season_year"])


def downgrade() -> None:
    op.drop_index("ix_athlete_carding_forms_season_year", table_name="athlete_carding_forms")
    op.drop_index("ix_athlete_carding_forms_club_id", table_name="athlete_carding_forms")
    op.drop_index("ix_athlete_carding_forms_athlete_id", table_name="athlete_carding_forms")
    op.drop_table("athlete_carding_forms")
