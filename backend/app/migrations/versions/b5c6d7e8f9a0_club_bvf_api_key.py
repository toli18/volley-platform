"""Store encrypted BVF ApiKey on clubs for X-Api-Key auth."""

from alembic import op
import sqlalchemy as sa


revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("clubs", sa.Column("bvf_api_key_enc", sa.Text(), nullable=True))
    op.add_column("clubs", sa.Column("bvf_api_key_prefix", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("clubs", "bvf_api_key_prefix")
    op.drop_column("clubs", "bvf_api_key_enc")
