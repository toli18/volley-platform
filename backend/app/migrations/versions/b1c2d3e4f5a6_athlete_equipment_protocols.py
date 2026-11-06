"""Athlete equipment handover protocols.

Revision ID: b1c2d3e4f5a6
Revises: a0b1c2d3e4f5
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5a6"
down_revision = "a0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "athlete_equipment_protocols",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("coach_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("return_coach_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("number", sa.String(length=32), nullable=True),
        sa.Column("season", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="issued"),
        sa.Column("issued_at", sa.Date(), nullable=False),
        sa.Column("returned_at", sa.Date(), nullable=True),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("athlete_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("club_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("coach_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("return_coach_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("recipient_signer_role", sa.String(length=16), nullable=False, server_default="athlete"),
        sa.Column("recipient_signer_name", sa.String(length=255), nullable=True),
        sa.Column("signature_recipient_data", sa.LargeBinary(), nullable=True),
        sa.Column("signature_coach_data", sa.LargeBinary(), nullable=True),
        sa.Column("signature_return_recipient_data", sa.LargeBinary(), nullable=True),
        sa.Column("signature_return_coach_data", sa.LargeBinary(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_athlete_equipment_protocols_club_id", "athlete_equipment_protocols", ["club_id"])
    op.create_index("ix_athlete_equipment_protocols_athlete_id", "athlete_equipment_protocols", ["athlete_id"])
    op.create_index("ix_athlete_equipment_protocols_coach_user_id", "athlete_equipment_protocols", ["coach_user_id"])
    op.create_index("ix_athlete_equipment_protocols_season", "athlete_equipment_protocols", ["season"])
    op.create_index("ix_athlete_equipment_protocols_status", "athlete_equipment_protocols", ["status"])
    op.create_index("ix_athlete_equipment_protocols_created_at", "athlete_equipment_protocols", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_athlete_equipment_protocols_created_at", table_name="athlete_equipment_protocols")
    op.drop_index("ix_athlete_equipment_protocols_status", table_name="athlete_equipment_protocols")
    op.drop_index("ix_athlete_equipment_protocols_season", table_name="athlete_equipment_protocols")
    op.drop_index("ix_athlete_equipment_protocols_coach_user_id", table_name="athlete_equipment_protocols")
    op.drop_index("ix_athlete_equipment_protocols_athlete_id", table_name="athlete_equipment_protocols")
    op.drop_index("ix_athlete_equipment_protocols_club_id", table_name="athlete_equipment_protocols")
    op.drop_table("athlete_equipment_protocols")
