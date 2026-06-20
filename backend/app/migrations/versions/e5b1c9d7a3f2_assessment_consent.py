"""assessment parental consent

Създава таблицата `assessment_consents` — маркер за съгласие индивидуалната
Карта за развитие да е видима за родителя (Phase 4, governance).

Revision ID: e5b1c9d7a3f2
Revises: d3f7a1b9c2e5
Create Date: 2026-06-20 20:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "e5b1c9d7a3f2"
down_revision = "d3f7a1b9c2e5"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "assessment_consents" not in tables:
        op.create_table(
            "assessment_consents",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("athlete_id", sa.Integer(), nullable=False),
            sa.Column("is_granted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("granted_by_user_id", sa.Integer(), nullable=True),
            sa.Column("granted_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["granted_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("athlete_id", name="uq_assessment_consent_athlete"),
        )
        op.create_index("ix_assessment_consents_id", "assessment_consents", ["id"], unique=False)
        op.create_index(
            "ix_assessment_consents_athlete_id", "assessment_consents", ["athlete_id"], unique=False
        )


def downgrade():
    op.drop_table("assessment_consents")
