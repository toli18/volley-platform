"""Club membership consent (Заявление) — template on club + signed records.

Revision ID: c6d7e8f9a0b1
Revises: b5c6d7e8f9a0
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa


revision = "c6d7e8f9a0b1"
down_revision = "b5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "clubs",
        sa.Column(
            "membership_consent_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column("clubs", sa.Column("membership_consent_addressee", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("membership_consent_body", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("membership_consent_gdpr", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("membership_consent_fee_amount", sa.Integer(), nullable=True))
    op.add_column("clubs", sa.Column("membership_consent_fee_due_day", sa.Integer(), nullable=True))

    op.create_table(
        "athlete_club_consents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("club_id", sa.Integer(), nullable=False),
        sa.Column("parent_full_name", sa.String(length=255), nullable=False),
        sa.Column("parent_egn", sa.String(length=16), nullable=False),
        sa.Column("parent_address", sa.String(length=500), nullable=False),
        sa.Column("parent_phone", sa.String(length=50), nullable=False),
        sa.Column("child_full_name", sa.String(length=255), nullable=False),
        sa.Column("child_egn", sa.String(length=16), nullable=False),
        sa.Column("child_address", sa.String(length=500), nullable=True),
        sa.Column("child_phone", sa.String(length=50), nullable=True),
        sa.Column("gdpr_accepted", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("signature_name", sa.String(length=255), nullable=False),
        sa.Column("signed_at", sa.DateTime(), nullable=False),
        sa.Column("addressee_snapshot", sa.Text(), nullable=True),
        sa.Column("body_text_snapshot", sa.Text(), nullable=True),
        sa.Column("gdpr_text_snapshot", sa.Text(), nullable=True),
        sa.Column("club_name_snapshot", sa.String(length=255), nullable=True),
        sa.Column("fee_amount_snapshot", sa.Integer(), nullable=True),
        sa.Column("fee_due_day_snapshot", sa.Integer(), nullable=True),
        sa.Column("pdf_rel_path", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_by_user_id", sa.Integer(), nullable=True),
        sa.Column("revoke_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revoked_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_athlete_club_consents_id", "athlete_club_consents", ["id"])
    op.create_index("ix_athlete_club_consents_athlete_id", "athlete_club_consents", ["athlete_id"])
    op.create_index("ix_athlete_club_consents_club_id", "athlete_club_consents", ["club_id"])
    op.create_index(
        "ix_athlete_club_consents_athlete_active",
        "athlete_club_consents",
        ["athlete_id", "is_active"],
    )


def downgrade() -> None:
    op.drop_table("athlete_club_consents")
    op.drop_column("clubs", "membership_consent_fee_due_day")
    op.drop_column("clubs", "membership_consent_fee_amount")
    op.drop_column("clubs", "membership_consent_gdpr")
    op.drop_column("clubs", "membership_consent_body")
    op.drop_column("clubs", "membership_consent_addressee")
    op.drop_column("clubs", "membership_consent_enabled")
