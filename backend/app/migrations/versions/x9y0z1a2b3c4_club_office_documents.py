"""Club office documents: service notes and invoices.

Revision ID: x9y0z1a2b3c4
Revises: w8x9y0z1a2b3
Create Date: 2026-08-18
"""

from alembic import op
import sqlalchemy as sa


revision = "x9y0z1a2b3c4"
down_revision = "w8x9y0z1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "club_service_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(length=32), nullable=False, server_default="no_claims"),
        sa.Column("number", sa.String(length=32), nullable=True),
        sa.Column("issued_at", sa.Date(), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("recipient_name", sa.String(length=255), nullable=False),
        sa.Column("recipient_egn", sa.String(length=16), nullable=False),
        sa.Column("representative_name", sa.String(length=255), nullable=False),
        sa.Column("representative_title", sa.String(length=120), nullable=False, server_default="Председател на УС"),
        sa.Column("club_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("club_address_snapshot", sa.String(length=500), nullable=True),
        sa.Column("custom_body", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_club_service_notes_club_id", "club_service_notes", ["club_id"])
    op.create_index("ix_club_service_notes_athlete_id", "club_service_notes", ["athlete_id"])
    op.create_index("ix_club_service_notes_created_at", "club_service_notes", ["created_at"])

    op.create_table(
        "club_invoices",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("club_id", sa.Integer(), sa.ForeignKey("clubs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("number", sa.String(length=32), nullable=False),
        sa.Column("issued_at", sa.Date(), nullable=False),
        sa.Column("place_of_issue", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="issued"),
        sa.Column("supplier_name", sa.String(length=255), nullable=False),
        sa.Column("supplier_address", sa.String(length=500), nullable=True),
        sa.Column("supplier_bulstat", sa.String(length=32), nullable=True),
        sa.Column("supplier_vat_id", sa.String(length=32), nullable=True),
        sa.Column("buyer_name", sa.String(length=255), nullable=False),
        sa.Column("buyer_id_number", sa.String(length=32), nullable=True),
        sa.Column("buyer_address", sa.String(length=500), nullable=True),
        sa.Column("vat_registered", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("vat_rate", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("currency", sa.String(length=8), nullable=False, server_default="BGN"),
        sa.Column("payment_method", sa.String(length=32), nullable=False, server_default="cash"),
        sa.Column("bank_iban", sa.String(length=34), nullable=True),
        sa.Column("bank_name", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("club_id", "number", name="uq_club_invoices_club_number"),
    )
    op.create_index("ix_club_invoices_club_id", "club_invoices", ["club_id"])
    op.create_index("ix_club_invoices_athlete_id", "club_invoices", ["athlete_id"])
    op.create_index("ix_club_invoices_created_at", "club_invoices", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_club_invoices_created_at", table_name="club_invoices")
    op.drop_index("ix_club_invoices_athlete_id", table_name="club_invoices")
    op.drop_index("ix_club_invoices_club_id", table_name="club_invoices")
    op.drop_table("club_invoices")
    op.drop_index("ix_club_service_notes_created_at", table_name="club_service_notes")
    op.drop_index("ix_club_service_notes_athlete_id", table_name="club_service_notes")
    op.drop_index("ix_club_service_notes_club_id", table_name="club_service_notes")
    op.drop_table("club_service_notes")
