"""add article comments table

Revision ID: c3a8e4d91b2f
Revises: 7f3b2b9a1c4d
Create Date: 2026-02-20 14:20:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "c3a8e4d91b2f"
down_revision = "7f3b2b9a1c4d"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("article_comments"):
        op.create_table(
            "article_comments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("article_id", sa.Integer(), nullable=False),
            sa.Column("author_id", sa.Integer(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
            sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {idx["name"] for idx in inspector.get_indexes("article_comments")}
    if op.f("ix_article_comments_id") not in existing_indexes:
        op.create_index(op.f("ix_article_comments_id"), "article_comments", ["id"], unique=False)
    if op.f("ix_article_comments_article_id") not in existing_indexes:
        op.create_index(op.f("ix_article_comments_article_id"), "article_comments", ["article_id"], unique=False)
    if op.f("ix_article_comments_author_id") not in existing_indexes:
        op.create_index(op.f("ix_article_comments_author_id"), "article_comments", ["author_id"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("article_comments"):
        existing_indexes = {idx["name"] for idx in inspector.get_indexes("article_comments")}
        if op.f("ix_article_comments_author_id") in existing_indexes:
            op.drop_index(op.f("ix_article_comments_author_id"), table_name="article_comments")
        if op.f("ix_article_comments_article_id") in existing_indexes:
            op.drop_index(op.f("ix_article_comments_article_id"), table_name="article_comments")
        if op.f("ix_article_comments_id") in existing_indexes:
            op.drop_index(op.f("ix_article_comments_id"), table_name="article_comments")
        op.drop_table("article_comments")

