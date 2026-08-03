"""Season application + coach assignment fields on card indexes.

Revision ID: f1a2b3c4d5e6
Revises: e0f1a2b3c4d5
Create Date: 2026-08-03
"""

from alembic import op
import sqlalchemy as sa


revision = "f1a2b3c4d5e6"
down_revision = "e0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "bvf_season_applications",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="open"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("club_id", "year", name="uq_bvf_season_app_club_year"),
    )
    op.create_index("ix_bvf_season_applications_club_id", "bvf_season_applications", ["club_id"])
    op.create_index("ix_bvf_season_applications_year", "bvf_season_applications", ["year"])

    op.add_column(
        "bvf_card_indexes",
        sa.Column("assigned_coach_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column(
        "bvf_card_indexes",
        sa.Column(
            "season_application_id",
            sa.Integer(),
            sa.ForeignKey("bvf_season_applications.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column("bvf_card_indexes", sa.Column("requested_at", sa.DateTime(), nullable=True))
    op.add_column(
        "bvf_card_indexes",
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("bvf_card_indexes", sa.Column("request_note", sa.Text(), nullable=True))
    op.create_index("ix_bvf_card_indexes_assigned_coach_user_id", "bvf_card_indexes", ["assigned_coach_user_id"])
    op.create_index("ix_bvf_card_indexes_season_application_id", "bvf_card_indexes", ["season_application_id"])


def downgrade() -> None:
    op.drop_index("ix_bvf_card_indexes_season_application_id", table_name="bvf_card_indexes")
    op.drop_index("ix_bvf_card_indexes_assigned_coach_user_id", table_name="bvf_card_indexes")
    op.drop_column("bvf_card_indexes", "request_note")
    op.drop_column("bvf_card_indexes", "requested_by_user_id")
    op.drop_column("bvf_card_indexes", "requested_at")
    op.drop_column("bvf_card_indexes", "season_application_id")
    op.drop_column("bvf_card_indexes", "assigned_coach_user_id")
    op.drop_index("ix_bvf_season_applications_year", table_name="bvf_season_applications")
    op.drop_index("ix_bvf_season_applications_club_id", table_name="bvf_season_applications")
    op.drop_table("bvf_season_applications")
