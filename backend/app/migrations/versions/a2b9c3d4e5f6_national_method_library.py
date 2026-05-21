"""national_method_library

Revision ID: a2b9c3d4e5f6
Revises: f1c8a92e4b6d
Create Date: 2026-05-20 10:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a2b9c3d4e5f6"
down_revision = "f1c8a92e4b6d"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    drill_cols = {c["name"] for c in inspector.get_columns("drills")} if "drills" in tables else set()
    if "scope" not in drill_cols:
        op.add_column("drills", sa.Column("scope", sa.String(length=20), nullable=False, server_default="community"))
        op.create_index("ix_drills_scope", "drills", ["scope"], unique=False)
    if "is_national_read_only" not in drill_cols:
        op.add_column(
            "drills",
            sa.Column("is_national_read_only", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    if "method_source_id" not in drill_cols:
        op.add_column("drills", sa.Column("method_source_id", sa.Integer(), nullable=True))

    if "method_sources" not in tables:
        op.create_table(
            "method_sources",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("filename", sa.String(length=512), nullable=False),
            sa.Column("original_language", sa.String(length=8), nullable=False, server_default="it"),
            sa.Column("content_type", sa.String(length=32), nullable=False),
            sa.Column("age_band", sa.String(length=16), nullable=False, server_default="all"),
            sa.Column("rights_note", sa.Text(), nullable=True),
            sa.Column("ingest_status", sa.String(length=32), nullable=False, server_default="pending"),
            sa.Column("extracted_text", sa.Text(), nullable=True),
            sa.Column("admin_notes", sa.Text(), nullable=True),
            sa.Column("wave", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_method_sources_id", "method_sources", ["id"], unique=False)

    if "method_articles" not in tables:
        op.create_table(
            "method_articles",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("title_bg", sa.String(length=512), nullable=False),
            sa.Column("body_bg", sa.Text(), nullable=False),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("age_band", sa.String(length=16), nullable=False, server_default="all"),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["source_id"], ["method_sources.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_method_articles_age_band", "method_articles", ["age_band"], unique=False)
        op.create_index("ix_method_articles_status", "method_articles", ["status"], unique=False)

    if "method_cycles" not in tables:
        op.create_table(
            "method_cycles",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("title_bg", sa.String(length=512), nullable=False),
            sa.Column("summary_bg", sa.Text(), nullable=True),
            sa.Column("cycle_type", sa.String(length=16), nullable=False, server_default="meso"),
            sa.Column("weeks", sa.Integer(), nullable=False, server_default="4"),
            sa.Column("age_band", sa.String(length=16), nullable=False, server_default="all"),
            sa.Column("structure_json", sa.JSON(), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("published_at", sa.DateTime(), nullable=True),
            sa.Column("created_by", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["source_id"], ["method_sources.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_method_cycles_age_band", "method_cycles", ["age_band"], unique=False)
        op.create_index("ix_method_cycles_status", "method_cycles", ["status"], unique=False)

    if "club_cycle_instances" not in tables:
        op.create_table(
            "club_cycle_instances",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("club_id", sa.Integer(), nullable=False),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("cycle_id", sa.Integer(), nullable=False),
            sa.Column("start_date", sa.String(length=10), nullable=False),
            sa.Column("customizations_json", sa.JSON(), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("created_by", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["cycle_id"], ["method_cycles.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_club_cycle_instances_club_id", "club_cycle_instances", ["club_id"], unique=False)

    if "method_assignments" not in tables:
        op.create_table(
            "method_assignments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("club_id", sa.Integer(), nullable=False),
            sa.Column("assigned_by", sa.Integer(), nullable=False),
            sa.Column("assigned_to", sa.Integer(), nullable=False),
            sa.Column("cycle_id", sa.Integer(), nullable=True),
            sa.Column("club_cycle_instance_id", sa.Integer(), nullable=True),
            sa.Column("week_ref", sa.Integer(), nullable=True),
            sa.Column("title_bg", sa.String(length=512), nullable=False),
            sa.Column("guidance_bg", sa.Text(), nullable=True),
            sa.Column("drill_ids", sa.JSON(), nullable=True),
            sa.Column("due_date", sa.String(length=10), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="new"),
            sa.Column("completion_note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["assigned_by"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["cycle_id"], ["method_cycles.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["club_cycle_instance_id"], ["club_cycle_instances.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_method_assignments_club_id", "method_assignments", ["club_id"], unique=False)

    drill_cols = {c["name"] for c in inspector.get_columns("drills")}
    if "method_source_id" in drill_cols and "method_sources" in set(inspector.get_table_names()):
        fks = {fk["name"] for fk in inspector.get_foreign_keys("drills")}
        if not any("method_source" in (n or "") for n in fks):
            op.create_foreign_key(
                "fk_drills_method_source_id",
                "drills",
                "method_sources",
                ["method_source_id"],
                ["id"],
                ondelete="SET NULL",
            )


def downgrade():
    op.drop_table("method_assignments")
    op.drop_table("club_cycle_instances")
    op.drop_table("method_cycles")
    op.drop_table("method_articles")
    op.drop_table("method_sources")
    op.drop_constraint("fk_drills_method_source_id", "drills", type_="foreignkey")
    op.drop_column("drills", "method_source_id")
    op.drop_column("drills", "is_national_read_only")
    op.drop_index("ix_drills_scope", table_name="drills")
    op.drop_column("drills", "scope")
