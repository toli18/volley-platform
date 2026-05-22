"""Seed национална библиотека (вълна 1 + национални упражнения вълна 2)."""

from datetime import datetime

from sqlalchemy.orm import Session

from app.models import Drill, MethodArticle, MethodCycle, MethodSource
from app.national_method.cycle_days import enrich_structure


def _meso_structure_u14() -> dict:
    return enrich_structure(
        {
        "weeks": [
            {
                "week": 1,
                "theme": "Техническа база и комуникация",
                "load": "средна",
                "focus": ["подаване", "приемане", "комуникация"],
                "session_goals": [
                    "Стабилен прием в зона 2–3",
                    "Точно плоско подаване при натиск",
                ],
                "recommended_drill_tags": ["прием", "подаване"],
            },
            {
                "week": 2,
                "theme": "Игра в нападение",
                "load": "средна-висока",
                "focus": ["разпределение", "атака от зона 4"],
                "session_goals": ["Бързо разпределение след прием", "Атака с контролиран блок-аут"],
                "recommended_drill_tags": ["разпределение", "атака"],
            },
            {
                "week": 3,
                "theme": "Блок и защита",
                "load": "висока",
                "focus": ["блок", "защита в зона 6"],
                "session_goals": ["Синхронен блок", "Преход защита → контраатака"],
                "recommended_drill_tags": ["блок", "защита"],
            },
            {
                "week": 4,
                "theme": "Интеграция и състезателен ритъм",
                "load": "средна (тапер)",
                "focus": ["система", "сервис-рийт"],
                "session_goals": ["Пълна система 6:0", "Контрол на грешки под напрежение"],
                "recommended_drill_tags": ["система", "сервис"],
            },
        ]
        },
        cycle_type="meso",
        age_band="U14",
    )


def _meso_structure_u16() -> dict:
    return enrich_structure(
        {
        "weeks": [
            {
                "week": 1,
                "theme": "Физическа подготовка + техника",
                "load": "средна",
                "focus": ["скок", "подаване в зона 2"],
                "session_goals": ["PLOOM в началото на сесията", "Точност на подаване"],
            },
            {
                "week": 2,
                "theme": "Комплексни упражнения",
                "load": "висока",
                "focus": ["прием-разпределение-атака"],
                "session_goals": ["Непрекъснат ритъм в серия от 6 топки"],
            },
            {
                "week": 3,
                "theme": "Тактика и ротации",
                "load": "висока",
                "focus": ["ротации", "сервис-прием"],
                "session_goals": ["Четене на сервис", "Блок по скаут"],
            },
            {
                "week": 4,
                "theme": "Подготовка за мач",
                "load": "средна",
                "focus": ["видео", "ситуационна игра"],
                "session_goals": ["Симулация на мачови ротации", "Ментална устойчивост"],
            },
        ]
        },
        cycle_type="meso",
        age_band="U16",
    )


def seed_national_method(db: Session) -> None:
    if db.query(MethodArticle).filter(MethodArticle.status == "published").count() >= 3:
        return

    now = datetime.utcnow()
    src = MethodSource(
        filename="Programmazione-Macrociclo-4-Settimane.xls",
        original_language="it",
        content_type="periodization",
        age_band="all",
        rights_note="БФВ — документирано право",
        ingest_status="published",
        wave=1,
        admin_notes="Референтен източник за мезо шаблони",
    )
    db.add(src)
    db.flush()

    articles = [
        MethodArticle(
            source_id=src.id,
            title_bg="Организация на тренировъчната сесия",
            body_bg=(
                "## Структура (90–120 мин)\n\n"
                "1. **Въведение (10–15 мин)** — цел, правила, разгрявка с топка.\n"
                "2. **Технически блок (20–25 мин)** — фокус по седмичната тема.\n"
                "3. **Тактически/игрови блок (25–35 мин)** — комплексни упражнения с ротации.\n"
                "4. **Игра и/или физически блок (15–20 мин)** — контролиран интензитет.\n"
                "5. **Заключение (5–10 мин)** — обратна връзка, домашно задание.\n\n"
                "Между блоковете — кратка хидратация. Интензитетът следва седмичния мезо план."
            ),
            category="organization",
            age_band="all",
            status="published",
            sort_order=1,
            published_at=now,
        ),
        MethodArticle(
            source_id=src.id,
            title_bg="Принципи FIPAV 2024–2028 (обобщение)",
            body_bg=(
                "Националната методика подчертава: **дългосрочно развитие**, "
                "**многостранност** пред специализация в ранна възраст, "
                "**качество на повторенията** пред обем без фокус.\n\n"
                "- U13–U14: максимум техника и радост от играта.\n"
                "- U15–U16: постепенно въвеждане на тактика и физическа подготовка.\n"
                "- U17–U18: състезателен модел, индивидуални планове.\n\n"
                "Всяка седмица има ясен фокус — вижте мезоцикълите по възраст."
            ),
            category="principles",
            age_band="all",
            status="published",
            sort_order=2,
            published_at=now,
        ),
        MethodArticle(
            title_bg="Микроцикъл: управление на натоварването",
            body_bg=(
                "В рамките на една седмица:\n"
                "- **Ден 1** — по-висок интензитет (техника + игра).\n"
                "- **Ден 2** — среден (тактика).\n"
                "- **Ден 3** — възстановяване или мач.\n\n"
                "След мач — намалете обема с 20–30% и акцентирайте възстановяване."
            ),
            category="periodization",
            age_band="all",
            status="published",
            sort_order=3,
            published_at=now,
        ),
        MethodArticle(
            title_bg="Комуникация и роли в отбора",
            body_bg=(
                "Всяка сесия започва с ясни роли: капитан на пода, капитан в защита, "
                "сигнали за сервис и прием. Треньорът моделира гласов контрол — "
                "не повече от 3 команди на ротация."
            ),
            category="psychology",
            age_band="U14",
            status="published",
            sort_order=4,
            published_at=now,
        ),
        MethodArticle(
            title_bg="Скаутинг и подготовка за състезание (U16+)",
            body_bg=(
                "Преди мач: кратък видео анализ (15 мин), силни/слаби страни на съперника, "
                "план за сервис. След мач: 3 точки за подобрение, без публична критика на играч."
            ),
            category="tactical",
            age_band="U16",
            status="published",
            sort_order=5,
            published_at=now,
        ),
    ]
    for a in articles:
        db.add(a)

    cycles = [
        MethodCycle(
            source_id=src.id,
            title_bg="Мезоцикъл 4 седмици — U14",
            summary_bg="Техника → нападение → блок/защита → интеграция",
            cycle_type="meso",
            weeks=4,
            age_band="U14",
            structure_json=_meso_structure_u14(),
            status="published",
            sort_order=1,
            published_at=now,
        ),
        MethodCycle(
            source_id=src.id,
            title_bg="Мезоцикъл 4 седмици — U16",
            summary_bg="Физика и техника → комплекс → тактика → мач",
            cycle_type="meso",
            weeks=4,
            age_band="U16",
            structure_json=_meso_structure_u16(),
            status="published",
            sort_order=2,
            published_at=now,
        ),
        MethodCycle(
            title_bg="Микроцикъл — седмица преди турнир (U18)",
            summary_bg="Тапер и ментална подготовка",
            cycle_type="micro",
            weeks=1,
            age_band="U18",
            structure_json=enrich_structure(
                {
                    "weeks": [
                        {
                            "week": 1,
                            "theme": "Тапер",
                            "load": "ниска-средна",
                            "focus": ["сервис", "система"],
                            "session_goals": ["Свежест", "Минимум на нови елементи"],
                        }
                    ]
                },
                cycle_type="micro",
                age_band="U18",
            ),
            status="published",
            sort_order=3,
            published_at=now,
        ),
    ]
    for c in cycles:
        db.add(c)

    db.flush()
    _seed_national_drills(db, src.id)
    db.commit()


def ensure_national_drills(db: Session) -> int:
    """Възстановява курираните BG упражнения след purge на GTP/bundle."""
    if db.query(Drill).filter(Drill.scope == "federation").count() >= 20:
        return 0
    src = (
        db.query(MethodSource)
        .filter(MethodSource.filename == "Programmazione-Macrociclo-4-Settimane.xls")
        .first()
    )
    if not src:
        src = MethodSource(
            filename="Programmazione-Macrociclo-4-Settimane.xls",
            original_language="it",
            content_type="periodization",
            age_band="all",
            rights_note="БФВ — документирано право",
            ingest_status="published",
            wave=1,
            admin_notes="Референтен източник за мезо шаблони",
        )
        db.add(src)
        db.flush()
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
