"""team_chat_message_reads

Revision ID: f1c8a92e4b6d
Revises: e8a1c4f92b3d
Create Date: 2026-05-20 14:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "f1c8a92e4b6d"
down_revision = "e8a1c4f92b3d"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "team_chat_message_reads" in inspector.get_table_names():
        return
    op.create_table(
        "team_chat_message_reads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("message_id", sa.Integer(), nullable=False),
        sa.Column("athlete_id", sa.Integer(), nullable=False),
        sa.Column("read_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["message_id"], ["team_chat_messages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("message_id", "athlete_id", name="uq_team_chat_message_read"),
    )
    op.create_index("ix_team_chat_message_reads_message_id", "team_chat_message_reads", ["message_id"])
    op.create_index("ix_team_chat_message_reads_athlete_id", "team_chat_message_reads", ["athlete_id"])


def downgrade():
    op.drop_table("team_chat_message_reads")
