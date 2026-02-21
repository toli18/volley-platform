# backend/app/init_db.py
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text

from .database import engine, SessionLocal, Base
from .models import User, UserRole, Club, Drill
from .seed.seed_clubs import seed_clubs
from .seed.seed_drills import seed_drills
from .auth import get_password_hash


def seed_platform_admin(db: Session) -> None:
    """
    Създава platform admin само ако няма такъв.
    НЕ трие нищо.
    """
    admin = db.execute(
        select(User).where(User.role == UserRole.platform_admin)
    ).scalar_one_or_none()

    if not admin:
        admin = User(
            email="admin@admin.com",
            hashed_password=get_password_hash("admin"),
            name="Platform Admin",
            role=UserRole.platform_admin,
        )
        db.add(admin)
        db.commit()
        print("✅ Admin user created (admin@admin.com / admin)")
    else:
        print("ℹ️ Admin already exists")


def _table_has_rows(db: Session, model) -> bool:
    """
    True ако таблицата има поне 1 ред.
    """
    count = db.execute(select(func.count()).select_from(model)).scalar_one()
    return (count or 0) > 0


def init_db() -> None:
    """
    - Създава таблиците ако липсват (create_all)
    - НЕ трие данни при рестарт
    - Seed-ва clubs/drills само ако таблиците са празни
    - Seed-ва platform admin само ако няма такъв
    """
    # ✅ НЕ ПИПАМЕ ДАННИ! Само създаваме таблици ако липсват.
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ensured (create_all)")

    # Backward-compatible schema fix for existing SQLite DBs:
    # add clubs.is_active if table was created before this column existed.
    with engine.begin() as conn:
        cols = conn.execute(text("PRAGMA table_info(clubs)")).fetchall()
        col_names = {row[1] for row in cols}
        if "is_active" not in col_names:
            conn.execute(text("ALTER TABLE clubs ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))
            print("✅ Added clubs.is_active column")

        training_cols = conn.execute(text("PRAGMA table_info(trainings)")).fetchall()
        training_col_names = {row[1] for row in training_cols}
        if "generation_request" not in training_col_names:
            conn.execute(text("ALTER TABLE trainings ADD COLUMN generation_request JSON"))
            print("✅ Added trainings.generation_request column")
        if "model_version" not in training_col_names:
            conn.execute(text("ALTER TABLE trainings ADD COLUMN model_version VARCHAR(50)"))
            print("✅ Added trainings.model_version column")
        if "score_summary" not in training_col_names:
            conn.execute(text("ALTER TABLE trainings ADD COLUMN score_summary JSON"))
            print("✅ Added trainings.score_summary column")
        if "selected_drill_ids" not in training_col_names:
            conn.execute(text("ALTER TABLE trainings ADD COLUMN selected_drill_ids JSON"))
            print("✅ Added trainings.selected_drill_ids column")

        forum_post_cols = conn.execute(text("PRAGMA table_info(forum_posts)")).fetchall()
        forum_post_col_names = {row[1] for row in forum_post_cols}
        if "category" not in forum_post_col_names:
            conn.execute(text("ALTER TABLE forum_posts ADD COLUMN category VARCHAR(100)"))
            print("✅ Added forum_posts.category column")
        if "tags" not in forum_post_col_names:
            conn.execute(text("ALTER TABLE forum_posts ADD COLUMN tags JSON"))
            print("✅ Added forum_posts.tags column")
        if "is_pinned" not in forum_post_col_names:
            conn.execute(text("ALTER TABLE forum_posts ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT 0"))
            print("✅ Added forum_posts.is_pinned column")
        if "is_locked" not in forum_post_col_names:
            conn.execute(text("ALTER TABLE forum_posts ADD COLUMN is_locked BOOLEAN NOT NULL DEFAULT 0"))
            print("✅ Added forum_posts.is_locked column")

    db = SessionLocal()
    try:
        # Admin (идемпотентно)
        seed_platform_admin(db)

        # Clubs seed само ако таблицата е празна
        if not _table_has_rows(db, Club):
            seed_clubs(db)
            print("✅ Clubs seeded")
        else:
            print("ℹ️ Clubs already exist - seeding skipped")

        # Drills seed само ако таблицата е празна
        if not _table_has_rows(db, Drill):
            seed_drills(db)
            print("✅ Drills seeded")
        else:
            print("ℹ️ Drills already exist - seeding skipped")

        print("✅ Database initialized successfully")
    except Exception as e:
        db.rollback()
        print(f"❌ init_db failed: {e}")
    finally:
        db.close()
