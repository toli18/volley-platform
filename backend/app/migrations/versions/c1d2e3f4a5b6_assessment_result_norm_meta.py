"""assessment result norm metadata (ADR-002 UX Contract)

Добавя nullable колони `norm_source`, `norm_confidence`, `norm_explanation`
към `assessment_results`, за да може системата да повърхва произхода на всяка
оценка (source/confidence/explanation). Чисто адитивно — не променя
съществуващи колони и не влияе на изчислените оценки.

Revision ID: c1d2e3f4a5b6
Revises: f7c2e9a4b1d8
Create Date: 2026-06-21 14:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "c1d2e3f4a5b6"
down_revision = "f7c2e9a4b1d8"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_results" not in set(inspector.get_table_names()):
        return
    existing = {col["name"] for col in inspector.get_columns("assessment_results")}

    if "norm_source" not in existing:
        op.add_column("assessment_results", sa.Column("norm_source", sa.String(length=24), nullable=True))
    if "norm_confidence" not in existing:
        op.add_column(
            "assessment_results", sa.Column("norm_confidence", sa.String(length=16), nullable=True)
        )
    if "norm_explanation" not in existing:
        op.add_column(
            "assessment_results", sa.Column("norm_explanation", sa.String(length=255), nullable=True)
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_results" not in set(inspector.get_table_names()):
        return
    existing = {col["name"] for col in inspector.get_columns("assessment_results")}

    if "norm_explanation" in existing:
        op.drop_column("assessment_results", "norm_explanation")
    if "norm_confidence" in existing:
        op.drop_column("assessment_results", "norm_confidence")
    if "norm_source" in existing:
        op.drop_column("assessment_results", "norm_source")
