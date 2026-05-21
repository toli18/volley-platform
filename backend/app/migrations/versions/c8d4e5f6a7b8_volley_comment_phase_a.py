"""volley_comment_phase_a — Volley Comment статии + насоки за корекция

Revision ID: c8d4e5f6a7b8
Revises: a2b9c3d4e5f6
"""

from alembic import op
import sqlalchemy as sa


revision = "c8d4e5f6a7b8"
down_revision = "a2b9c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("method_articles", sa.Column("source_url", sa.String(length=1024), nullable=True))
    op.add_column("method_articles", sa.Column("author", sa.String(length=256), nullable=True))
    op.add_column("method_articles", sa.Column("series", sa.String(length=64), nullable=True))
    op.add_column("method_articles", sa.Column("summary_bg", sa.Text(), nullable=True))
    op.add_column("method_articles", sa.Column("key_points", sa.JSON(), nullable=True))
    op.add_column("method_articles", sa.Column("content_origin", sa.String(length=32), nullable=True))

    op.create_table(
        "method_guidelines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("skill_element", sa.String(length=32), nullable=False),
        sa.Column("error_bg", sa.Text(), nullable=False),
        sa.Column("correction_bg", sa.Text(), nullable=False),
        sa.Column("age_band", sa.String(length=16), nullable=False, server_default="all"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="published"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_method_guidelines_skill", "method_guidelines", ["skill_element"])


def downgrade():
    op.drop_index("ix_method_guidelines_skill", table_name="method_guidelines")
    op.drop_table("method_guidelines")
    op.drop_column("method_articles", "content_origin")
    op.drop_column("method_articles", "key_points")
    op.drop_column("method_articles", "summary_bg")
    op.drop_column("method_articles", "series")
    op.drop_column("method_articles", "author")
    op.drop_column("method_articles", "source_url")
