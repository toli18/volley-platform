"""Match video URL + video coding proposals.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-11-08
"""

from alembic import op
import sqlalchemy as sa


revision = "c2d3e4f5a6b7"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("matches", sa.Column("video_url", sa.String(length=1024), nullable=True))
    op.add_column("match_stat_events", sa.Column("video_offset_sec", sa.Integer(), nullable=True))
    op.create_table(
        "match_video_coding_proposals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("match_id", sa.Integer(), sa.ForeignKey("matches.id", ondelete="CASCADE"), nullable=False),
        sa.Column("set_id", sa.Integer(), sa.ForeignKey("match_sets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("athletes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=24), nullable=False),
        sa.Column("video_offset_sec", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("source", sa.String(length=16), nullable=False, server_default="manual"),
        sa.Column("note", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "approved_event_id",
            sa.Integer(),
            sa.ForeignKey("match_stat_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_match_video_coding_proposals_match_id", "match_video_coding_proposals", ["match_id"])
    op.create_index("ix_match_video_coding_proposals_status", "match_video_coding_proposals", ["status"])
    op.create_index("ix_match_video_coding_proposals_created_at", "match_video_coding_proposals", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_match_video_coding_proposals_created_at", table_name="match_video_coding_proposals")
    op.drop_index("ix_match_video_coding_proposals_status", table_name="match_video_coding_proposals")
    op.drop_index("ix_match_video_coding_proposals_match_id", table_name="match_video_coding_proposals")
    op.drop_table("match_video_coding_proposals")
    op.drop_column("match_stat_events", "video_offset_sec")
    op.drop_column("matches", "video_url")
