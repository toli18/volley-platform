"""assessment norm maturity & confidence metadata (ADR-003 Step 1)

Добавя nullable metadata колони към `assessment_norms`, за да поддържа бъдеща
Maturity/Confidence оценка: source_status, maturity_level, valid_from, valid_to,
coverage, confidence_score, season_count.

Чисто адитивно — не премахва/преименува колони, не променя поведение. Колоните
остават празни (NULL) и не се ползват от scoring/resolver/dashboard.

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-22 06:55:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d2e3f4a5b6c7"
down_revision = "c1d2e3f4a5b6"
branch_labels = None
depends_on = None


# (име, тип) на новите колони — всички nullable.
_NEW_COLUMNS = (
    ("source_status", sa.String(length=16)),
    ("maturity_level", sa.String(length=16)),
    ("valid_from", sa.Date()),
    ("valid_to", sa.Date()),
    ("coverage", sa.Float()),
    ("confidence_score", sa.Float()),
    ("season_count", sa.Integer()),
)


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_norms" not in set(inspector.get_table_names()):
        return
    existing = {col["name"] for col in inspector.get_columns("assessment_norms")}

    for name, col_type in _NEW_COLUMNS:
        if name not in existing:
            op.add_column("assessment_norms", sa.Column(name, col_type, nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_norms" not in set(inspector.get_table_names()):
        return
    existing = {col["name"] for col in inspector.get_columns("assessment_norms")}

    for name, _ in reversed(_NEW_COLUMNS):
        if name in existing:
            op.drop_column("assessment_norms", name)
