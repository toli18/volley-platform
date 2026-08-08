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

    # Critical: users.phone must exist before any login SELECT (idempotent).
    db_url = (settings.database_url or "").lower()
    if "postgres" in db_url:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)"))
                conn.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_visible_to_parents "
                        "BOOLEAN DEFAULT TRUE"
                    )
                )
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS full_name VARCHAR(500)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bulstat VARCHAR(32)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS license_number VARCHAR(64)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_region VARCHAR(120)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_logo_id VARCHAR(64)"))
            print("✅ PostgreSQL: early club-profile / phone columns ensured")
        except Exception as early_exc:
            print(f"⚠️ early phone/club-profile patch: {early_exc}")

        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS public_slug VARCHAR(80)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS public_page_enabled "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS public_tagline VARCHAR(255)"
                    )
                )
                conn.execute(
                    text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS public_about TEXT")
                )
                conn.execute(
                    text(
                        "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS facebook_page_url VARCHAR(500)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE clubs ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE teams ADD COLUMN IF NOT EXISTS public_enrollment_open "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
                )
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_clubs_public_slug "
                        "ON clubs (public_slug)"
                    )
                )
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS club_enrollment_requests (
                            id SERIAL PRIMARY KEY,
                            club_id INTEGER NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
                            child_first_name VARCHAR(80) NOT NULL,
                            child_last_name VARCHAR(80),
                            child_birth_year INTEGER NOT NULL,
                            child_gender VARCHAR(16),
                            parent_name VARCHAR(255) NOT NULL,
                            parent_phone VARCHAR(50) NOT NULL,
                            parent_email VARCHAR(255),
                            preferred_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
                            note TEXT,
                            status VARCHAR(24) NOT NULL DEFAULT 'new',
                            trial_date VARCHAR(10),
                            trial_time VARCHAR(5),
                            trial_location VARCHAR(255),
                            trial_notes TEXT,
                            accepted_team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
                            athlete_id INTEGER REFERENCES athletes(id) ON DELETE SET NULL,
                            handled_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                            handled_at TIMESTAMP,
                            created_at TIMESTAMP DEFAULT NOW(),
                            updated_at TIMESTAMP DEFAULT NOW()
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_club_enrollment_requests_club_id "
                        "ON club_enrollment_requests (club_id)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_club_enrollment_requests_status "
                        "ON club_enrollment_requests (status)"
                    )
                )
            print("✅ PostgreSQL: public club page / enrollment schema ensured")
        except Exception as enroll_exc:
            print(f"⚠️ public club / enrollment patch: {enroll_exc}")

        # Critical for schedule / live match / parent portal after recent deploys.
        try:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "ALTER TABLE match_stat_events "
                        "ADD COLUMN IF NOT EXISTS related_athlete_id INTEGER"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_match_stat_events_related_athlete_id "
                        "ON match_stat_events (related_athlete_id)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_status VARCHAR(16) "
                        "NOT NULL DEFAULT 'pending'"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_edit_count INTEGER "
                        "NOT NULL DEFAULT 0"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_confirmed_at TIMESTAMP"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_locked_at TIMESTAMP"
                    )
                )
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS competition_roster_athletes (
                            id SERIAL PRIMARY KEY,
                            competition_id INTEGER NOT NULL
                                REFERENCES club_competition_events(id) ON DELETE CASCADE,
                            athlete_id INTEGER NOT NULL
                                REFERENCES athletes(id) ON DELETE CASCADE,
                            created_at TIMESTAMP DEFAULT NOW(),
                            CONSTRAINT uq_competition_roster_athlete
                                UNIQUE (competition_id, athlete_id)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_competition_roster_athletes_competition_id "
                        "ON competition_roster_athletes (competition_id)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_competition_roster_athletes_athlete_id "
                        "ON competition_roster_athletes (athlete_id)"
                    )
                )
            print("✅ PostgreSQL: early match-stat / competition-roster schema ensured")
        except Exception as early_roster_exc:
            print(f"⚠️ early match-stat / competition-roster patch: {early_roster_exc}")

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
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS birth_date DATE"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS place_of_birth VARCHAR(255)"))
                conn.execute(text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS libero_athlete_id INTEGER"))
                conn.execute(
                    text(
                        "ALTER TABLE matches ADD COLUMN IF NOT EXISTS format "
                        "VARCHAR(8) NOT NULL DEFAULT 'bo5'"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_input_locked "
                        "INTEGER NOT NULL DEFAULT 0"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_share_token "
                        "VARCHAR(64)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_matches_live_share_token "
                        "ON matches (live_share_token)"
                    )
                )
                conn.execute(
                    text("ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_court_positions JSON")
                )
                conn.execute(
                    text(
                        "ALTER TABLE match_sets ADD COLUMN IF NOT EXISTS start_rotation "
                        "INTEGER NOT NULL DEFAULT 1"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE match_sets ADD COLUMN IF NOT EXISTS start_we_serve "
                        "INTEGER NOT NULL DEFAULT 1"
                    )
                )
                # Placeholder дати за стари записи (годината се запазва).
                conn.execute(
                    text(
                        "UPDATE athletes "
                        "SET birth_date = make_date(birth_year, 1, 1) "
                        "WHERE birth_year IS NOT NULL AND birth_date IS NULL"
                    )
                )
                conn.execute(
                    text(
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
                # Някои slug-ове на секции от учебника стигат до 80 символа —
                # разширяваме идемпотентно, иначе импортът гърми с StringDataRightTruncation.
                conn.execute(text("ALTER TABLE method_articles ALTER COLUMN series TYPE VARCHAR(160)"))
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

                # BVF federation link (Администрация БФВ)
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_club_id INTEGER"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_club_name VARCHAR(255)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_linked_at TIMESTAMP"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_username VARCHAR(100)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_password_enc TEXT"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_api_key_enc TEXT"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_api_key_prefix VARCHAR(20)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_enabled BOOLEAN NOT NULL DEFAULT false"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_addressee TEXT"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_body TEXT"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_gdpr TEXT"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_fee_amount INTEGER"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS membership_consent_fee_due_day INTEGER"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_default_first_coach_id INTEGER"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_default_first_coach_name VARCHAR(255)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bvf_coach_id INTEGER"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bvf_coach_name VARCHAR(255)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bvf_first_coach_proxy_id INTEGER"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bvf_first_coach_proxy_name VARCHAR(255)"))
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_users_bvf_coach_id ON users (bvf_coach_id)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_clubs_bvf_club_id "
                        "ON clubs (bvf_club_id)"
                    )
                )
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS egn VARCHAR(16)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS bvf_player_id INTEGER"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS bvf_player_number INTEGER"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS bvf_synced_at TIMESTAMP"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS first_name VARCHAR(25)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS middle_name VARCHAR(25)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS last_name VARCHAR(25)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS nationality VARCHAR(25)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS bvf_photo_id VARCHAR(64)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sek_task_code VARCHAR(32)"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sek_task_detail TEXT"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sek_task_at TIMESTAMP"))
                conn.execute(text("ALTER TABLE athletes ADD COLUMN IF NOT EXISTS sek_task_by_user_id INTEGER"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_athletes_egn ON athletes (egn)"))
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX IF NOT EXISTS ix_athletes_bvf_player_id "
                        "ON athletes (bvf_player_id)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS created_by_user_id INTEGER"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS signed_by_user_id INTEGER"
                    )
                )
                conn.execute(
                    text("ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP")
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS assigned_coach_user_id INTEGER"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS season_application_id INTEGER"
                    )
                )
                conn.execute(
                    text("ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP")
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS requested_by_user_id INTEGER"
                    )
                )
                conn.execute(
                    text("ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS request_note TEXT")
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS second_coach_user_id INTEGER"
                    )
                )
                conn.execute(
                    text("ALTER TABLE bvf_card_indexes ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255)")
                )
                conn.execute(
                    text(
                        "ALTER TABLE bvf_season_applications ADD COLUMN IF NOT EXISTS forms_active "
                        "BOOLEAN NOT NULL DEFAULT false"
                    )
                )
                # Вече отворени сезони са имали Форма 03 заедно със status=open — запазваме поведението.
                conn.execute(
                    text(
                        "UPDATE bvf_season_applications SET forms_active = true "
                        "WHERE status = 'open' AND forms_active IS DISTINCT FROM true"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_athletes_bvf_player_number "
                        "ON athletes (bvf_player_number)"
                    )
                )
                # Club profile (СЕК) + coach phones — must stay inside this connection
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS full_name VARCHAR(500)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bulstat VARCHAR(32)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS license_number VARCHAR(64)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_region VARCHAR(120)"))
                conn.execute(text("ALTER TABLE clubs ADD COLUMN IF NOT EXISTS bvf_logo_id VARCHAR(64)"))
                conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50)"))
                conn.execute(
                    text(
                        "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_visible_to_parents "
                        "BOOLEAN DEFAULT TRUE"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS card_index_id INTEGER"
                    )
                )
                # Match substitutions + competition travel roster (ако Alembic не е минал на Railway).
                conn.execute(
                    text(
                        "ALTER TABLE match_stat_events "
                        "ADD COLUMN IF NOT EXISTS related_athlete_id INTEGER"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_match_stat_events_related_athlete_id "
                        "ON match_stat_events (related_athlete_id)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_status VARCHAR(16) "
                        "NOT NULL DEFAULT 'pending'"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_edit_count INTEGER "
                        "NOT NULL DEFAULT 0"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_confirmed_at TIMESTAMP"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE club_competition_events "
                        "ADD COLUMN IF NOT EXISTS roster_locked_at TIMESTAMP"
                    )
                )
                conn.execute(
                    text(
                        """
                        CREATE TABLE IF NOT EXISTS competition_roster_athletes (
                            id SERIAL PRIMARY KEY,
                            competition_id INTEGER NOT NULL
                                REFERENCES club_competition_events(id) ON DELETE CASCADE,
                            athlete_id INTEGER NOT NULL
                                REFERENCES athletes(id) ON DELETE CASCADE,
                            created_at TIMESTAMP DEFAULT NOW(),
                            CONSTRAINT uq_competition_roster_athlete
                                UNIQUE (competition_id, athlete_id)
                        )
                        """
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_competition_roster_athletes_competition_id "
                        "ON competition_roster_athletes (competition_id)"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_competition_roster_athletes_athlete_id "
                        "ON competition_roster_athletes (athlete_id)"
                    )
                )
                conn.execute(
                    text(
                        "ALTER TABLE parent_absence_notices "
                        "ADD COLUMN IF NOT EXISTS end_date VARCHAR(10)"
                    )
                )
                conn.execute(
                    text(
                        "UPDATE parent_absence_notices SET end_date = notice_date "
                        "WHERE end_date IS NULL"
                    )
                )
            print("✅ PostgreSQL: training_assignments.completion_note ensured")
            print("✅ PostgreSQL: athletes.gender / birth_date / place_of_birth ensured")
            print("✅ PostgreSQL: teams.gender ensured")
            print("✅ PostgreSQL: assessment_results / assessment_norms columns ensured")
            print("✅ PostgreSQL: clubs/athletes BVF link columns ensured")
            print("✅ PostgreSQL: club profile / users.phone columns ensured")
            print("✅ PostgreSQL: club_competition_events.card_index_id ensured")
            print("✅ PostgreSQL: match_stat_events.related_athlete_id ensured")
            print("✅ PostgreSQL: competition travel roster columns/table ensured")
            print("✅ PostgreSQL: parent_absence_notices.end_date ensured")
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
            if "egn" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN egn VARCHAR(16)"))
                print("✅ Added athletes.egn column")
            if "bvf_player_id" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN bvf_player_id INTEGER"))
                print("✅ Added athletes.bvf_player_id column")
            if "bvf_player_number" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN bvf_player_number INTEGER"))
                print("✅ Added athletes.bvf_player_number column")
            if "bvf_synced_at" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN bvf_synced_at DATETIME"))
                print("✅ Added athletes.bvf_synced_at column")
            if "first_name" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN first_name VARCHAR(25)"))
                print("✅ Added athletes.first_name column")
            if "middle_name" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN middle_name VARCHAR(25)"))
                print("✅ Added athletes.middle_name column")
            if "last_name" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN last_name VARCHAR(25)"))
                print("✅ Added athletes.last_name column")
            if "nationality" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN nationality VARCHAR(25)"))
                print("✅ Added athletes.nationality column")
            if "bvf_photo_id" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN bvf_photo_id VARCHAR(64)"))
                print("✅ Added athletes.bvf_photo_id column")
            if "sek_task_code" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN sek_task_code VARCHAR(32)"))
                print("✅ Added athletes.sek_task_code column")
            if "sek_task_detail" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN sek_task_detail TEXT"))
                print("✅ Added athletes.sek_task_detail column")
            if "sek_task_at" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN sek_task_at DATETIME"))
                print("✅ Added athletes.sek_task_at column")
            if "sek_task_by_user_id" not in athlete_col_names:
                conn.execute(text("ALTER TABLE athletes ADD COLUMN sek_task_by_user_id INTEGER"))
                print("✅ Added athletes.sek_task_by_user_id column")

            try:
                ci_cols = conn.execute(text("PRAGMA table_info(bvf_card_indexes)")).fetchall()
                ci_names = {row[1] for row in ci_cols}
                if ci_cols:
                    if "created_by_user_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN created_by_user_id INTEGER"))
                        print("✅ Added bvf_card_indexes.created_by_user_id")
                    if "signed_by_user_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN signed_by_user_id INTEGER"))
                        print("✅ Added bvf_card_indexes.signed_by_user_id")
                    if "signed_at" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN signed_at DATETIME"))
                        print("✅ Added bvf_card_indexes.signed_at")
                    if "assigned_coach_user_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN assigned_coach_user_id INTEGER"))
                        print("✅ Added bvf_card_indexes.assigned_coach_user_id")
                    if "season_application_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN season_application_id INTEGER"))
                        print("✅ Added bvf_card_indexes.season_application_id")
                    if "requested_at" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN requested_at DATETIME"))
                        print("✅ Added bvf_card_indexes.requested_at")
                    if "requested_by_user_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN requested_by_user_id INTEGER"))
                        print("✅ Added bvf_card_indexes.requested_by_user_id")
                    if "request_note" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN request_note TEXT"))
                        print("✅ Added bvf_card_indexes.request_note")
                    if "second_coach_user_id" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN second_coach_user_id INTEGER"))
                        print("✅ Added bvf_card_indexes.second_coach_user_id")
                    if "doctor_name" not in ci_names:
                        conn.execute(text("ALTER TABLE bvf_card_indexes ADD COLUMN doctor_name VARCHAR(255)"))
                        print("✅ Added bvf_card_indexes.doctor_name")
            except Exception:
                pass

            try:
                sa_cols = conn.execute(text("PRAGMA table_info(bvf_season_applications)")).fetchall()
                sa_names = {row[1] for row in sa_cols}
                if "forms_active" not in sa_names:
                    conn.execute(
                        text(
                            "ALTER TABLE bvf_season_applications ADD COLUMN forms_active "
                            "BOOLEAN NOT NULL DEFAULT 0"
                        )
                    )
                    conn.execute(
                        text(
                            "UPDATE bvf_season_applications SET forms_active = 1 WHERE status = 'open'"
                        )
                    )
                    print("✅ Added bvf_season_applications.forms_active")
            except Exception:
                pass

            club_cols = conn.execute(text("PRAGMA table_info(clubs)")).fetchall()
            club_col_names = {row[1] for row in club_cols}
            if "bvf_club_id" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_club_id INTEGER"))
                print("✅ Added clubs.bvf_club_id column")
            if "bvf_club_name" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_club_name VARCHAR(255)"))
                print("✅ Added clubs.bvf_club_name column")
            if "full_name" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN full_name VARCHAR(500)"))
                print("✅ Added clubs.full_name")
            if "bulstat" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bulstat VARCHAR(32)"))
                print("✅ Added clubs.bulstat")
            if "license_number" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN license_number VARCHAR(64)"))
                print("✅ Added clubs.license_number")
            if "bvf_region" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_region VARCHAR(120)"))
                print("✅ Added clubs.bvf_region")
            if "bvf_logo_id" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_logo_id VARCHAR(64)"))
                print("✅ Added clubs.bvf_logo_id")
            user_cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            user_col_names = {row[1] for row in user_cols}
            if "phone" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN phone VARCHAR(50)"))
                print("✅ Added users.phone")
            if "phone_visible_to_parents" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN phone_visible_to_parents BOOLEAN NOT NULL DEFAULT 1"))
                print("✅ Added users.phone_visible_to_parents")
            if "bvf_linked_at" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_linked_at DATETIME"))
                print("✅ Added clubs.bvf_linked_at column")
            if "bvf_username" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_username VARCHAR(100)"))
                print("✅ Added clubs.bvf_username column")
            if "bvf_password_enc" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_password_enc TEXT"))
                print("✅ Added clubs.bvf_password_enc column")
            if "bvf_api_key_enc" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_api_key_enc TEXT"))
                print("✅ Added clubs.bvf_api_key_enc column")
            if "bvf_api_key_prefix" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_api_key_prefix VARCHAR(20)"))
                print("✅ Added clubs.bvf_api_key_prefix column")
            if "membership_consent_enabled" not in club_col_names:
                conn.execute(
                    text("ALTER TABLE clubs ADD COLUMN membership_consent_enabled BOOLEAN NOT NULL DEFAULT 0")
                )
                print("✅ Added clubs.membership_consent_enabled column")
            if "membership_consent_addressee" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN membership_consent_addressee TEXT"))
                print("✅ Added clubs.membership_consent_addressee column")
            if "membership_consent_body" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN membership_consent_body TEXT"))
                print("✅ Added clubs.membership_consent_body column")
            if "membership_consent_gdpr" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN membership_consent_gdpr TEXT"))
                print("✅ Added clubs.membership_consent_gdpr column")
            if "membership_consent_fee_amount" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN membership_consent_fee_amount INTEGER"))
                print("✅ Added clubs.membership_consent_fee_amount column")
            if "membership_consent_fee_due_day" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN membership_consent_fee_due_day INTEGER"))
                print("✅ Added clubs.membership_consent_fee_due_day column")
            if "bvf_default_first_coach_id" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_default_first_coach_id INTEGER"))
                print("✅ Added clubs.bvf_default_first_coach_id column")
            if "bvf_default_first_coach_name" not in club_col_names:
                conn.execute(text("ALTER TABLE clubs ADD COLUMN bvf_default_first_coach_name VARCHAR(255)"))
                print("✅ Added clubs.bvf_default_first_coach_name column")

            user_cols = conn.execute(text("PRAGMA table_info(users)")).fetchall()
            user_col_names = {row[1] for row in user_cols}
            if "bvf_coach_id" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN bvf_coach_id INTEGER"))
                print("✅ Added users.bvf_coach_id column")
            if "bvf_coach_name" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN bvf_coach_name VARCHAR(255)"))
                print("✅ Added users.bvf_coach_name column")
            if "bvf_first_coach_proxy_id" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN bvf_first_coach_proxy_id INTEGER"))
                print("✅ Added users.bvf_first_coach_proxy_id column")
            if "bvf_first_coach_proxy_name" not in user_col_names:
                conn.execute(text("ALTER TABLE users ADD COLUMN bvf_first_coach_proxy_name VARCHAR(255)"))
                print("✅ Added users.bvf_first_coach_proxy_name column")

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
            db.rollback()
            print(f"⚠️ Club logo sync skipped: {exc}")

        # Drills: идемпотентна синхронизация от CSV (добавя липсващите,
        # опреснява таговете на seed упражненията, не пипа потребителските)
        try:
            seed_drills(db)
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            print(f"⚠️ Drills sync skipped: {exc}")

        try:
            seed_national_method(db)
            print("✅ National method library seeded (if needed)")
        except Exception as exc:
            db.rollback()
            print(f"⚠️ National method seed skipped: {exc}")

        # Национална диагностична карта — тестовата батерия е част от
        # методическата библиотека. Idempotent upsert по `code`.
        try:
            from app.national_method.assessment_battery import seed_assessment_battery

            created = seed_assessment_battery(db)
            print(f"✅ Тестова батерия (assessment) seeded — нови записи: {created}")
        except Exception as exc:
            db.rollback()
            print(f"⚠️ Assessment battery seed skipped: {exc}")

        # Референтни норми (репери) — дават абсолютна скала за cold-start, за да
        # имаме истинска делта от първото измерване. Idempotent; не презаписва
        # норми, изчислени от реални данни (source="computed").
        try:
            from app.national_method.assessment_norms_seed import seed_reference_norms

            created_norms = seed_reference_norms(db)
            print(f"✅ Референтни норми (assessment) seeded — нови записи: {created_norms}")
        except Exception as exc:
            db.rollback()
            print(f"⚠️ Assessment reference norms seed skipped: {exc}")

        try:
            from app.national_method.annual_program import ensure_annual_program_seeded

            ap_stats = ensure_annual_program_seeded(db)
            if not ap_stats.get("skipped"):
                db.commit()
                print(f"✅ Годишна програма (ensure): {ap_stats}")
        except Exception as exc:
            db.rollback()
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
