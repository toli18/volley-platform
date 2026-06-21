"""battery audit log

Създава таблицата `battery_audit_logs` — журнал на промените по тестовата
батерия (governance / проследимост: кой, кога, какво е сменил).

Revision ID: f7c2e9a4b1d8
Revises: e5b1c9d7a3f2
Create Date: 2026-06-21 13:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f7c2e9a4b1d8"
down_revision = "e5b1c9d7a3f2"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "battery_audit_logs" not in tables:
        op.create_table(
            "battery_audit_logs",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("test_code", sa.String(length=64), nullable=False),
            sa.Column("action", sa.String(length=24), nullable=False),
            sa.Column("changes", sa.JSON(), nullable=True),
            sa.Column("actor_user_id", sa.Integer(), nullable=True),
            sa.Column("actor_name", sa.String(length=255), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_battery_audit_logs_id", "battery_audit_logs", ["id"], unique=False)
        op.create_index(
            "ix_battery_audit_logs_test_code", "battery_audit_logs", ["test_code"], unique=False
        )
        op.create_index(
            "ix_battery_audit_logs_created_at", "battery_audit_logs", ["created_at"], unique=False
        )


def downgrade():
    op.drop_table("battery_audit_logs")
