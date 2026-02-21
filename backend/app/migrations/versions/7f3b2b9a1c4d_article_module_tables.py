"""article module tables and article workflow columns

Revision ID: 7f3b2b9a1c4d
Revises: d62f8a4ffe9e
Create Date: 2026-02-20 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "7f3b2b9a1c4d"
down_revision = "d62f8a4ffe9e"
branch_labels = None
depends_on = None


old_article_status = sa.Enum("draft", "pending", "approved", "rejected", name="drillstatus")
new_article_status = sa.Enum("PENDING", "APPROVED", "REJECTED", "NEEDS_EDIT", name="articlestatus")
media_type_enum = sa.Enum("IMAGE", "FILE", name="articlemediatype")


def upgrade():
    bind = op.get_bind()

    # Add moderation/workflow columns on existing articles table.
    with op.batch_alter_table("articles") as batch_op:
        batch_op.add_column(sa.Column("excerpt", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("approved_by", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("approved_at", sa.DateTime(), nullable=True))
        batch_op.add_column(sa.Column("reject_reason", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("needs_edit_comment", sa.Text(), nullable=True))
        batch_op.create_foreign_key("fk_articles_approved_by_users", "users", ["approved_by"], ["id"])

    # Normalize legacy status values before switching enum definition.
    op.execute(
        """
        UPDATE articles
        SET status = CASE
            WHEN status = 'approved' THEN 'APPROVED'
            WHEN status = 'rejected' THEN 'REJECTED'
            ELSE 'PENDING'
        END
        """
    )

    if bind.dialect.name == "postgresql":
        new_article_status.create(bind, checkfirst=True)
        op.alter_column(
            "articles",
            "status",
            existing_type=old_article_status,
            type_=new_article_status,
            postgresql_using=(
                "CASE "
                "WHEN status = 'approved' THEN 'APPROVED' "
                "WHEN status = 'rejected' THEN 'REJECTED' "
                "ELSE 'PENDING' "
                "END"
            ),
            existing_nullable=False,
        )
    else:
        with op.batch_alter_table("articles") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=old_article_status,
                type_=new_article_status,
                existing_nullable=False,
            )

    op.create_table(
        "article_media",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("article_id", sa.Integer(), nullable=False),
        sa.Column("type", media_type_enum, nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=True),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_article_media_id"), "article_media", ["id"], unique=False)
    op.create_index(op.f("ix_article_media_article_id"), "article_media", ["article_id"], unique=False)

    op.create_table(
        "article_links",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("article_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.ForeignKeyConstraint(["article_id"], ["articles.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_article_links_id"), "article_links", ["id"], unique=False)
    op.create_index(op.f("ix_article_links_article_id"), "article_links", ["article_id"], unique=False)


def downgrade():
    bind = op.get_bind()

    op.drop_index(op.f("ix_article_links_article_id"), table_name="article_links")
    op.drop_index(op.f("ix_article_links_id"), table_name="article_links")
    op.drop_table("article_links")

    op.drop_index(op.f("ix_article_media_article_id"), table_name="article_media")
    op.drop_index(op.f("ix_article_media_id"), table_name="article_media")
    op.drop_table("article_media")

    if bind.dialect.name == "postgresql":
        op.alter_column(
            "articles",
            "status",
            existing_type=new_article_status,
            type_=old_article_status,
            postgresql_using=(
                "CASE "
                "WHEN status = 'APPROVED' THEN 'approved' "
                "WHEN status = 'REJECTED' THEN 'rejected' "
                "ELSE 'pending' "
                "END"
            ),
            existing_nullable=False,
        )
    else:
        with op.batch_alter_table("articles") as batch_op:
            batch_op.alter_column(
                "status",
                existing_type=new_article_status,
                type_=old_article_status,
                existing_nullable=False,
            )

    with op.batch_alter_table("articles") as batch_op:
        batch_op.drop_constraint("fk_articles_approved_by_users", type_="foreignkey")
        batch_op.drop_column("needs_edit_comment")
        batch_op.drop_column("reject_reason")
        batch_op.drop_column("approved_at")
        batch_op.drop_column("approved_by")
        batch_op.drop_column("excerpt")


