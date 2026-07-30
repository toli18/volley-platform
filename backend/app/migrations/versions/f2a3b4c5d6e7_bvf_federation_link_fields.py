"""BVF federation link fields on clubs and athletes

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-30
"""

from alembic import op
import sqlalchemy as sa


revision = "f2a3b4c5d6e7"
down_revision = "e1f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "clubs" in tables:
        cols = {c["name"] for c in inspector.get_columns("clubs")}
        if "bvf_club_id" not in cols:
            op.add_column("clubs", sa.Column("bvf_club_id", sa.Integer(), nullable=True))
        if "bvf_club_name" not in cols:
            op.add_column("clubs", sa.Column("bvf_club_name", sa.String(length=255), nullable=True))
        if "bvf_linked_at" not in cols:
            op.add_column("clubs", sa.Column("bvf_linked_at", sa.DateTime(), nullable=True))
        # unique index (idempotent)
        idxs = {i["name"] for i in inspector.get_indexes("clubs")}
        if "ix_clubs_bvf_club_id" not in idxs:
            op.create_index("ix_clubs_bvf_club_id", "clubs", ["bvf_club_id"], unique=True)

    if "athletes" in tables:
        cols = {c["name"] for c in inspector.get_columns("athletes")}
        if "egn" not in cols:
            op.add_column("athletes", sa.Column("egn", sa.String(length=16), nullable=True))
        if "bvf_player_id" not in cols:
            op.add_column("athletes", sa.Column("bvf_player_id", sa.Integer(), nullable=True))
        if "bvf_player_number" not in cols:
            op.add_column("athletes", sa.Column("bvf_player_number", sa.Integer(), nullable=True))
        if "bvf_synced_at" not in cols:
            op.add_column("athletes", sa.Column("bvf_synced_at", sa.DateTime(), nullable=True))
        idxs = {i["name"] for i in inspector.get_indexes("athletes")}
        if "ix_athletes_egn" not in idxs:
            op.create_index("ix_athletes_egn", "athletes", ["egn"], unique=False)
        if "ix_athletes_bvf_player_id" not in idxs:
            op.create_index("ix_athletes_bvf_player_id", "athletes", ["bvf_player_id"], unique=True)
        if "ix_athletes_bvf_player_number" not in idxs:
            op.create_index("ix_athletes_bvf_player_number", "athletes", ["bvf_player_number"], unique=False)


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "athletes" in tables:
        idxs = {i["name"] for i in inspector.get_indexes("athletes")}
        cols = {c["name"] for c in inspector.get_columns("athletes")}
        if "ix_athletes_bvf_player_number" in idxs:
            op.drop_index("ix_athletes_bvf_player_number", table_name="athletes")
        if "ix_athletes_bvf_player_id" in idxs:
            op.drop_index("ix_athletes_bvf_player_id", table_name="athletes")
        if "ix_athletes_egn" in idxs:
            op.drop_index("ix_athletes_egn", table_name="athletes")
        for col in ("bvf_synced_at", "bvf_player_number", "bvf_player_id", "egn"):
            if col in cols:
                op.drop_column("athletes", col)

    if "clubs" in tables:
        idxs = {i["name"] for i in inspector.get_indexes("clubs")}
        cols = {c["name"] for c in inspector.get_columns("clubs")}
        if "ix_clubs_bvf_club_id" in idxs:
            op.drop_index("ix_clubs_bvf_club_id", table_name="clubs")
        for col in ("bvf_linked_at", "bvf_club_name", "bvf_club_id"):
            if col in cols:
                op.drop_column("clubs", col)
