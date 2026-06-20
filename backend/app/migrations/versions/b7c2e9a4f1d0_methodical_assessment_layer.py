"""methodical assessment layer v1

Създава таблиците на модула „Национална диагностична карта" (Methodical
Assessment Layer v1): тестова батерия, прозорци, сесии, резултати, норми,
Development Score и Методически Индекс.

Revision ID: b7c2e9a4f1d0
Revises: a9f1d23c7e84
Create Date: 2026-06-19 15:10:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "b7c2e9a4f1d0"
down_revision = "a9f1d23c7e84"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "test_definitions" not in tables:
        op.create_table(
            "test_definitions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("code", sa.String(length=64), nullable=False),
            sa.Column("name", sa.String(length=255), nullable=False),
            sa.Column("category", sa.String(length=24), nullable=False),
            sa.Column("unit", sa.String(length=32), nullable=False),
            sa.Column("direction", sa.String(length=24), nullable=False, server_default="higher_better"),
            sa.Column("protocol", sa.Text(), nullable=True),
            sa.Column("video_url", sa.String(length=512), nullable=True),
            sa.Column("age_min", sa.Integer(), nullable=True),
            sa.Column("age_max", sa.Integer(), nullable=True),
            sa.Column("battery_version", sa.String(length=16), nullable=False, server_default="v1.0"),
            sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("code", name="uq_test_definitions_code"),
        )
        op.create_index("ix_test_definitions_id", "test_definitions", ["id"], unique=False)
        op.create_index("ix_test_definitions_code", "test_definitions", ["code"], unique=False)

    if "assessment_windows" not in tables:
        op.create_table(
            "assessment_windows",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("season", sa.String(length=16), nullable=False),
            sa.Column("cycle", sa.String(length=32), nullable=False, server_default="6м"),
            sa.Column("phase", sa.String(length=24), nullable=False),
            sa.Column("club_id", sa.Integer(), nullable=True),
            sa.Column("label", sa.String(length=120), nullable=True),
            sa.Column("start_date", sa.Date(), nullable=True),
            sa.Column("end_date", sa.Date(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["club_id"], ["clubs.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_assessment_windows_id", "assessment_windows", ["id"], unique=False)
        op.create_index("ix_assessment_windows_club_id", "assessment_windows", ["club_id"], unique=False)
        op.create_index(
            "ix_assessment_windows_season_phase", "assessment_windows", ["season", "phase"], unique=False
        )

    if "assessment_sessions" not in tables:
        op.create_table(
            "assessment_sessions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("window_id", sa.Integer(), nullable=False),
            sa.Column("team_id", sa.Integer(), nullable=False),
            sa.Column("coach_id", sa.Integer(), nullable=True),
            sa.Column("conducted_on", sa.Date(), nullable=True),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="open"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["window_id"], ["assessment_windows.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["team_id"], ["teams.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["coach_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("window_id", "team_id", name="uq_assessment_session_window_team"),
        )
        op.create_index("ix_assessment_sessions_id", "assessment_sessions", ["id"], unique=False)
        op.create_index("ix_assessment_sessions_window_id", "assessment_sessions", ["window_id"], unique=False)
        op.create_index("ix_assessment_sessions_team_id", "assessment_sessions", ["team_id"], unique=False)
        op.create_index("ix_assessment_sessions_coach_id", "assessment_sessions", ["coach_id"], unique=False)

    if "assessment_results" not in tables:
        op.create_table(
            "assessment_results",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("session_id", sa.Integer(), nullable=False),
            sa.Column("athlete_id", sa.Integer(), nullable=False),
            sa.Column("test_code", sa.String(length=64), nullable=False),
            sa.Column("raw_value", sa.Float(), nullable=True),
            sa.Column("normalized", sa.Float(), nullable=True),
            sa.Column("percentile", sa.Float(), nullable=True),
            sa.Column("is_indicative", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["assessment_sessions.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("session_id", "athlete_id", "test_code", name="uq_assessment_result_unique"),
        )
        op.create_index("ix_assessment_results_id", "assessment_results", ["id"], unique=False)
        op.create_index("ix_assessment_results_session_id", "assessment_results", ["session_id"], unique=False)
        op.create_index("ix_assessment_results_athlete_id", "assessment_results", ["athlete_id"], unique=False)
        op.create_index("ix_assessment_results_test_code", "assessment_results", ["test_code"], unique=False)
        op.create_index(
            "ix_assessment_results_athlete_test", "assessment_results", ["athlete_id", "test_code"], unique=False
        )

    if "assessment_norms" not in tables:
        op.create_table(
            "assessment_norms",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("test_code", sa.String(length=64), nullable=False),
            sa.Column("age_band", sa.String(length=16), nullable=False),
            sa.Column("gender", sa.String(length=16), nullable=False),
            sa.Column("sample_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("mean_value", sa.Float(), nullable=True),
            sa.Column("std_value", sa.Float(), nullable=True),
            sa.Column("p20", sa.Float(), nullable=True),
            sa.Column("p40", sa.Float(), nullable=True),
            sa.Column("p60", sa.Float(), nullable=True),
            sa.Column("p80", sa.Float(), nullable=True),
            sa.Column("battery_version", sa.String(length=16), nullable=False, server_default="v1.0"),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "test_code", "age_band", "gender", "battery_version", name="uq_assessment_norm_unique"
            ),
        )
        op.create_index("ix_assessment_norms_id", "assessment_norms", ["id"], unique=False)
        op.create_index("ix_assessment_norms_test_code", "assessment_norms", ["test_code"], unique=False)

    if "development_scores" not in tables:
        op.create_table(
            "development_scores",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("athlete_id", sa.Integer(), nullable=False),
            sa.Column("window_id", sa.Integer(), nullable=False),
            sa.Column("technical_subindex", sa.Float(), nullable=True),
            sa.Column("physical_subindex", sa.Float(), nullable=True),
            sa.Column("development_score", sa.Float(), nullable=True),
            sa.Column("delta", sa.Float(), nullable=True),
            sa.Column("computed_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["athlete_id"], ["athletes.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["window_id"], ["assessment_windows.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("athlete_id", "window_id", name="uq_development_score_unique"),
        )
        op.create_index("ix_development_scores_id", "development_scores", ["id"], unique=False)
        op.create_index("ix_development_scores_athlete_id", "development_scores", ["athlete_id"], unique=False)
        op.create_index("ix_development_scores_window_id", "development_scores", ["window_id"], unique=False)

    if "methodical_index_snapshots" not in tables:
        op.create_table(
            "methodical_index_snapshots",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("subject_type", sa.String(length=16), nullable=False),
            sa.Column("subject_id", sa.Integer(), nullable=True),
            sa.Column("window_id", sa.Integer(), nullable=False),
            sa.Column("adoption", sa.Float(), nullable=True),
            sa.Column("measurement_discipline", sa.Float(), nullable=True),
            sa.Column("development", sa.Float(), nullable=True),
            sa.Column("methodical_index", sa.Float(), nullable=True),
            sa.Column("computed_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
            sa.ForeignKeyConstraint(["window_id"], ["assessment_windows.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_methodical_index_snapshots_id", "methodical_index_snapshots", ["id"], unique=False)
        op.create_index(
            "ix_methodical_index_snapshots_window_id", "methodical_index_snapshots", ["window_id"], unique=False
        )
        op.create_index(
            "ix_methodical_index_subject_window",
            "methodical_index_snapshots",
            ["subject_type", "subject_id", "window_id"],
            unique=False,
        )


def downgrade():
    for table in (
        "methodical_index_snapshots",
        "development_scores",
        "assessment_norms",
        "assessment_results",
        "assessment_sessions",
        "assessment_windows",
        "test_definitions",
    ):
        op.drop_table(table)
