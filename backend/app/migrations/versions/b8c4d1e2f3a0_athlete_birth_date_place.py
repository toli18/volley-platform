"""Add athlete birth_date and place_of_birth

Revision ID: b8c4d1e2f3a0
Revises: a1b2c3d4e5f7
Create Date: 2026-07-16
"""

from alembic import op
import sqlalchemy as sa


revision = "b8c4d1e2f3a0"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athletes")} if "athletes" in inspector.get_table_names() else set()

    if "birth_date" not in cols:
        op.add_column("athletes", sa.Column("birth_date", sa.Date(), nullable=True))
    if "place_of_birth" not in cols:
        op.add_column("athletes", sa.Column("place_of_birth", sa.String(length=255), nullable=True))

    # Стари записи: запазваме годината, слагаме 01.01 като placeholder.
    rows = bind.execute(
        sa.text(
            "SELECT id, birth_year FROM athletes "
            "WHERE birth_year IS NOT NULL AND birth_date IS NULL"
        )
    ).fetchall()
    for row in rows:
        athlete_id, birth_year = row[0], row[1]
        if not birth_year:
            continue
        bind.execute(
            sa.text("UPDATE athletes SET birth_date = :d WHERE id = :id"),
            {"d": f"{int(birth_year):04d}-01-01", "id": athlete_id},
        )

    # Място на раждане по подразбиране = град на клуба (където липсва).
    try:
        bind.execute(
            sa.text(
                """
                UPDATE athletes AS a
                SET place_of_birth = c.city
                FROM clubs AS c
                WHERE a.club_id = c.id
                  AND (a.place_of_birth IS NULL OR btrim(a.place_of_birth) = '')
                  AND c.city IS NOT NULL
                  AND btrim(c.city) <> ''
                """
            )
        )
    except Exception:
        # SQLite / други диалекти без UPDATE ... FROM
        clubs = bind.execute(sa.text("SELECT id, city FROM clubs WHERE city IS NOT NULL")).fetchall()
        for club_id, city in clubs:
            city = (city or "").strip()
            if not city:
                continue
            bind.execute(
                sa.text(
                    "UPDATE athletes SET place_of_birth = :city "
                    "WHERE club_id = :club_id "
                    "AND (place_of_birth IS NULL OR trim(place_of_birth) = '')"
                ),
                {"city": city, "club_id": club_id},
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    cols = {c["name"] for c in inspector.get_columns("athletes")} if "athletes" in inspector.get_table_names() else set()
    if "place_of_birth" in cols:
        op.drop_column("athletes", "place_of_birth")
    if "birth_date" in cols:
        op.drop_column("athletes", "birth_date")
