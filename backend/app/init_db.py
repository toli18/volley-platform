# backend/app/init_db.py
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text

from .database import engine, SessionLocal, Base
from .settings import settings
from .models import User, UserRole, Club, Drill, MethodArticle
from .seed.seed_clubs import seed_clubs, sync_club_logos
from .seed.seed_drills import seed_drills
from .seed.seed_national_method import seed_national_method
from pathlib import Path
import os
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


# Уникален ключ за PostgreSQL advisory lock — гарантира, че само ЕДИН uvicorn
# worker изпълнява seeding/schema patch при старт (останалите пропускат безопасно).
_INIT_DB_LOCK_KEY = 911002


def init_db() -> None:
    """
    Безопасен за много worker-и старт.

    При PostgreSQL хваща advisory lock: само първият worker изпълнява
    реалната инициализация, а останалите я пропускат (схемата вече е
    подсигурена от `alembic upgrade head` в Procfile + от worker-а с lock-а).
    Това предотвратява състезания/дублирано seeding-ване между процесите.
    """
    db_url = (settings.database_url or "").lower()
    if "postgres" in db_url:
        try:
            conn = engine.connect()
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️ init_db: неуспешна връзка за advisory lock: {exc}")
            return
        try:
            got_lock = conn.exec_driver_sql(
                f"SELECT pg_try_advisory_lock({_INIT_DB_LOCK_KEY})"
            ).scalar()
            if not got_lock:
                print("ℹ️ init_db пропуснат (друг worker държи init lock-а)")
                return
            try:
                _init_db_impl()
            finally:
                conn.exec_driver_sql(f"SELECT pg_advisory_unlock({_INIT_DB_LOCK_KEY})")
        finally:
            conn.close()
    else:
        # SQLite / локален dev: един процес, lock не е нужен.
        _init_db_impl()


def _init_db_impl() -> None:
    """
    - Създава таблиците ако липсват (create_all)
    - НЕ трие данни при рестарт
    - Seed-ва clubs/drills само ако таблиците са празни
    - Seed-ва platform admin само ако няма такъв
    """
    # ✅ НЕ ПИПАМЕ ДАННИ! Само създаваме таблици ако липсват.
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ensured (create_all)")

    # PostgreSQL: Alembic often не се пуска на Railway — добавяме липсващи колони идемпотентно.
    db_url = (settings.database_url or "").lower()
    if "postgres" in db_url:
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE training_assignments "
                        "ADD COLUMN IF NOT EXISTS completion_note TEXT"
                    )
                )
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS gender VARCHAR(16)"))
                conn.execute(text("ALTER TABLE teams ADD COLUMN IF NOT EXISTS gender VARCHAR(16)"))
                conn.execute(
                    text(
                        "ALTER TABLE parent_push_subscriptions "
                        "ADD COLUMN IF NOT EXISTS portal VARCHAR(32) NOT NULL DEFAULT 'parent'"
                    )
                )
                conn.execute(
                    text("ALTER TABLE drills ADD COLUMN IF NOT EXISTS scope VARCHAR(20) NOT NULL DEFAULT 'community'")
                )
                conn.execute(
                    text(
                        "ALTER TABLE drills ADD COLUMN IF NOT EXISTS is_national_read_only "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
                )
                conn.execute(text("ALTER TABLE drills ADD COLUMN IF NOT EXISTS method_source_id INTEGER"))
                conn.execute(text("ALTER TABLE trainings ADD COLUMN IF NOT EXISTS team_id INTEGER"))
                conn.execute(text("ALTER TABLE trainings ADD COLUMN IF NOT EXISTS session_date VARCHAR(10)"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS source_url VARCHAR(1024)"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS author VARCHAR(256)"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS series VARCHAR(64)"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS summary_bg TEXT"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS key_points JSONB"))
                conn.execute(text("ALTER TABLE method_articles ADD COLUMN IF NOT EXISTS content_origin VARCHAR(32)"))

                # Assessment layer — нови колони (ADR-002 / Norms Machine), добавени
                # към моделите, но липсващи в стара продукционна схема. Без тях
                # SELECT-ите към тези таблици гърмят (напр. създаване на сесия → 500).
                conn.execute(text("ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS norm_source VARCHAR(24)"))
                conn.execute(text("ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS norm_confidence VARCHAR(16)"))
                conn.execute(text("ALTER TABLE assessment_results ADD COLUMN IF NOT EXISTS norm_explanation VARCHAR(255)"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS source_status VARCHAR(16)"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS maturity_level VARCHAR(16)"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS valid_from DATE"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS valid_to DATE"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS coverage DOUBLE PRECISION"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS confidence_score DOUBLE PRECISION"))
                conn.execute(text("ALTER TABLE assessment_norms ADD COLUMN IF NOT EXISTS season_count INTEGER"))
            print("✅ PostgreSQL: training_assignments.completion_note ensured")
            print("✅ PostgreSQL: athletes.gender ensured")
            print("✅ PostgreSQL: teams.gender ensured")
            print("✅ PostgreSQL: assessment_results / assessment_norms columns ensured")
        except Exception as exc:
            print(f"⚠️ PostgreSQL schema patch (completion_note): {exc}")

    # SQLite-only compatibility patching.
    # On PostgreSQL we rely on Alembic migrations and skip PRAGMA-based checks.
    if settings.database_url.startswith("sqlite"):
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
            if "team_id" not in training_col_names:
                conn.execute(text("ALTER TABLE trainings ADD COLUMN team_id INTEGER"))
                print("✅ Added trainings.team_id column")
            if "session_date" not in training_col_names:
                conn.execute(text("ALTER TABLE trainings ADD COLUMN session_date VARCHAR(10)"))
                print("✅ Added trainings.session_date column")

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

            athlete_cols = conn.execute(text("PRAGMA table_info(athletes)")).fetchall()
            athlete_col_names = {row[1] for row in athlete_cols}
            if "gender" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN gender VARCHAR(16)"))
                print("✅ Added athletes.gender column")

            team_cols = conn.execute(text("PRAGMA table_info(teams)")).fetchall()
            team_col_names = {row[1] for row in team_cols}
            if "gender" not in team_col_names:
                conn.execute(text("ALTER TABLE teams ADD COLUMN gender VARCHAR(16)"))
                print("✅ Added teams.gender column")

            push_cols = conn.execute(text("PRAGMA table_info(parent_push_subscriptions)")).fetchall()
            push_col_names = {row[1] for row in push_cols}
            if push_cols and "portal" not in push_col_names:
                conn.execute(
                    text("ALTER TABLE parent_push_subscriptions ADD COLUMN portal VARCHAR(32) NOT NULL DEFAULT 'parent'")
                )
                print("✅ Added parent_push_subscriptions.portal column")

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

        # Винаги синхронизирай реалните клубни лога (заменя само placeholder-и)
        try:
            sync_club_logos(db)
        except Exception as exc:  # noqa: BLE001
            print(f"⚠️ Club logo sync skipped: {exc}")

        # Drills seed само ако таблицата е празна
        if not _table_has_rows(db, Drill):
            seed_drills(db)
            print("✅ Drills seeded")
        else:
            print("ℹ️ Drills already exist - seeding skipped")

        try:
            seed_national_method(db)
            print("✅ National method library seeded (if needed)")
        except Exception as exc:
            print(f"⚠️ National method seed skipped: {exc}")

        # Национална диагностична карта — тестовата батерия е част от
        # методическата библиотека. Idempotent upsert по `code`.
        try:
            from app.national_method.assessment_battery import seed_assessment_battery

            created = seed_assessment_battery(db)
            print(f"✅ Тестова батерия (assessment) seeded — нови записи: {created}")
        except Exception as exc:
            print(f"⚠️ Assessment battery seed skipped: {exc}")

        # Референтни норми (репери) — дават абсолютна скала за cold-start, за да
        # имаме истинска делта от първото измерване. Idempotent; не презаписва
        # норми, изчислени от реални данни (source="computed").
        try:
            from app.national_method.assessment_norms_seed import seed_reference_norms

            created_norms = seed_reference_norms(db)
            print(f"✅ Референтни норми (assessment) seeded — нови записи: {created_norms}")
        except Exception as exc:
            print(f"⚠️ Assessment reference norms seed skipped: {exc}")

        try:
            from app.national_method.annual_program import ensure_annual_program_seeded

            ap_stats = ensure_annual_program_seeded(db)
            if not ap_stats.get("skipped"):
                db.commit()
                print(f"✅ Годишна програма (ensure): {ap_stats}")
        except Exception as exc:
            print(f"⚠️ Annual program ensure skipped: {exc}")

        try:
            from pathlib import Path as _Path

            tb_json = _Path(__file__).resolve().parent / "seed" / "data" / "bvf_textbook_bg.json"
            tb_txt = _Path(__file__).resolve().parent / "seed" / "data" / "bvf_textbook_bg.txt"
            if tb_txt.is_file() or tb_json.is_file():
                from app.scripts.ingest_bvf_textbook import import_to_db

                stats = import_to_db(force=False, replace_vc=True)
                db.commit()
                print(f"✅ Учебник БФВ (фаза 1): {stats}")
                from app.scripts.build_bvf_ai_knowledge import main as build_ai_knowledge

                build_ai_knowledge()
                print("✅ AI knowledge от учебника")
                from app.scripts.seed_annual_program import seed_annual_program

                ap_stats = seed_annual_program(db, replace=False)
                db.commit()
                print(f"✅ Годишна програма: {ap_stats}")
                from app.national_method.content_policy import purge_pre_textbook_method

                purge_stats = purge_pre_textbook_method(db, dry_run=False)
                db.commit()
                print(f"✅ Почистване legacy методика: {purge_stats}")
            else:
                print("ℹ️ bvf_textbook_bg.txt липсва — пропуск учебник импорт")
        except Exception as exc:
            print(f"⚠️ BVF library import skipped: {exc}")

        print("✅ Database initialized successfully")
    except Exception as e:
        db.rollback()
        print(f"❌ init_db failed: {e}")
    finally:
        db.close()
