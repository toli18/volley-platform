"""pilot requests table

Публични заявки от /pilot/ → известия в админ акаунта.

Revision ID: a1b2c3d4e5f7
Revises: e7a1b2c3d4f5
Create Date: 2026-07-11
"""

from alembic import op
import sqlalchemy as sa


revision = "a1b2c3d4e5f7"
down_revision = "e7a1b2c3d4f5"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "pilot_requests" in inspector.get_table_names():
        return

    op.create_table(
        "pilot_requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("club_name", sa.String(length=255), nullable=False),
        sa.Column("city", sa.String(length=120), nullable=True),
        sa.Column("region", sa.String(length=64), nullable=True),
        sa.Column("teams_count", sa.String(length=32), nullable=True),
        sa.Column("coaches_count", sa.String(length=32), nullable=True),
        sa.Column("contact_name", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("new", "contacted", "activated", "declined", name="pilotrequeststatus"),
            nullable=False,
            server_default="new",
        ),
        sa.Column("admin_seen", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pilot_requests_id", "pilot_requests", ["id"], unique=False)
    op.create_index("ix_pilot_requests_created_at", "pilot_requests", ["created_at"], unique=False)


def downgrade():
    op.drop_index("ix_pilot_requests_created_at", table_name="pilot_requests")
    op.drop_index("ix_pilot_requests_id", table_name="pilot_requests")
    op.drop_table("pilot_requests")
    op.execute("DROP TYPE IF EXISTS pilotrequeststatus")
