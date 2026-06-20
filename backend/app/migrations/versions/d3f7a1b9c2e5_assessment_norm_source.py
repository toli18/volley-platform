"""assessment norm source column

Добавя колоната `source` ("seed" | "computed") към `assessment_norms`, за да
различаваме реперите от методическия комитет (абсолютна скала за cold-start)
от нормите, изчислени от реални данни.

Revision ID: d3f7a1b9c2e5
Revises: b7c2e9a4f1d0
Create Date: 2026-06-19 22:40:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "d3f7a1b9c2e5"
down_revision = "b7c2e9a4f1d0"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_norms" not in set(inspector.get_table_names()):
        return
    columns = {c["name"] for c in inspector.get_columns("assessment_norms")}
    if "source" not in columns:
        op.add_column(
            "assessment_norms",
            sa.Column(
                "source",
                sa.String(length=16),
                nullable=False,
                server_default="computed",
            ),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "assessment_norms" not in set(inspector.get_table_names()):
        return
    columns = {c["name"] for c in inspector.get_columns("assessment_norms")}
    if "source" in columns:
        op.drop_column("assessment_norms", "source")
