"""Seed национална библиотека — само курирани BG упражнения (методиката е в учебника)."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Drill, MethodSource

NATIONAL_DRILLS_SOURCE = "bvf-national-drills"


def _ensure_drills_source(db: Session) -> MethodSource:
    src = db.query(MethodSource).filter(MethodSource.filename == NATIONAL_DRILLS_SOURCE).first()
    if src:
        return src
    src = MethodSource(
        filename=NATIONAL_DRILLS_SOURCE,
        original_language="bg",
        content_type="drills",
        age_band="all",
        rights_note="БФВ — курирани национални упражнения",
        ingest_status="published",
        wave=2,
        admin_notes="Национални упражнения за AI генератора (отделно от учебника)",
    )
    db.add(src)
    db.flush()
    return src


def seed_national_method(db: Session) -> None:
    """Само federation drills — статии/цикли идват от учебника и годишната програма."""
    src = _ensure_drills_source(db)
    _seed_national_drills(db, src.id)
    db.commit()


def ensure_national_drills(db: Session) -> int:
    """Възстановява курираните BG упражнения след purge."""
    if db.query(Drill).filter(Drill.scope == "federation").count() >= 20:
        return 0
    src = _ensure_drills_source(db)
    _seed_national_drills(db, src.id)
    db.flush()
    return db.query(Drill).filter(Drill.scope == "federation").count()


def _seed_national_drills(db: Session, source_id: int) -> None:
    if db.query(Drill).filter(Drill.scope == "federation").count() >= 20:
        return

    templates = [
        ("Прием в зона 2 — серия 10", "Прием", 13, 14, "Стабилен платформен прием", "Прием в зона 2", "Гледай топката в ръцете"),
        ("Подаване плоско — цел зона 3", "Подаване", 13, 16, "Точност под натиск", "Плоско подаване", "Краката към целта"),
        ("Разпределение след прием", "Разпределение", 14, 18, "Бързо решение", "Разпределение", "Висока ръка, тих глас"),
        ("Атака от зона 4", "Атака", 14, 18, "Ефективност", "Атака", "Замах отдолу нагоре"),
        ("Блок синхрон — двойка", "Блок", 15, 18, "Синхрон", "Блок", "Скачване при последен момент"),
        ("Защита в зона 6", "Защита", 13, 17, "Контрол", "Защита", "Ниска позиция"),
        ("Сервис — зона 1 и 5", "Сервис", 13, 18, "Стабилност", "Сервис", "Рутина преди удар"),
        ("Система 6:0 — ротация 1", "Система", 14, 16, "Игра", "Система", "Ясни роли"),
        ("Контраатака 3 топки", "Преход", 15, 18, "Скорост", "Контра", "Първа стъпка напред"),
        ("Игра 4 на 4 — мини поле", "Игра", 13, 15, "Радост", "Игра", "Много докосвания"),
        ("Плиометрика — кратка серия", "Физика", 15, 18, "Скок", "Физика", "Качество пред брой"),
        ("Сервис-прием 6 на 6", "Игра", 14, 18, "Ритъм", "Сервис-прием", "Комуникация"),
        ("Техника на пас — стена", "Техника", 13, 14, "Повторения", "Пас", "След топката"),
        ("Блок-аут цел", "Атака", 16, 18, "Точност", "Блок-аут", "Открий ръка"),
        ("Прием със скаут", "Прием", 16, 18, "Четене", "Прием", "Позиция според сервис"),
        ("Разпределение на темпо", "Разпределение", 15, 17, "Темпо", "Разпределение", "Висок 2, бърз 4"),
        ("Защита + подиграване", "Защита", 14, 16, "Контрол", "Защита", "Спокойни ръце"),
        ("Атака от зона 2", "Атака", 15, 18, "Разнообразие", "Атака", "Открита линия"),
        ("Сервис с въртливост", "Сервис", 16, 18, "Предимство", "Сервис", "Консистентност"),
        ("Игра с правила — 3 докосвания", "Игра", 13, 16, "Система", "Игра", "Максимум 3 докосвания"),
        ("Разгрявка с топка — U13", "Разгрявка", 12, 13, "Мобилност", "Разгрявка", "Лека интензивност"),
        ("Двойки прием-подаване", "Прием", 13, 15, "Ритъм", "Прием", "Говорете"),
    ]

    for title, cat, amin, amax, goal, focus, cp in templates:
        db.add(
            Drill(
                title=title,
                description=f"Национално упражнение БФВ — {cat}.",
                goal=goal,
                category=cat,
                level="national",
                skill_focus=focus,
                age_min=amin,
                age_max=amax,
                setup="Стандартна зала; групи по 4–6 играчи.",
                instructions=(
                    f"1. Обяснете целта: {goal}.\n"
                    f"2. Демонстрация от треньор.\n"
                    f"3. Серии от 8–12 повторения.\n"
                    f"4. Кратка обратна връзка и ротация."
                ),
                coaching_points=cp,
                common_mistakes="Бързане без комуникация; нестабилен прием.",
                scope="federation",
                is_national_read_only=True,
                method_source_id=source_id,
                status="approved",
                skill_domains=[focus.lower()] if focus else [],
            )
        )
