# backend/app/national_method/assessment_battery.py
"""Националната тестова батерия v1 като seed данни.

Това е каноничният стандарт (живее в методическата библиотека). Стойностите са
взети директно от тестовия материал на БФВ ("Тестова батерия — пояснения").

Записите се upsert-ват по `code`, така че повторно изпълнение е безопасно и не
дублира редове. Seed-ът се извиква от `init_db.py` (виж следваща стъпка от Phase 0).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import TestCategory, TestDefinition, TestDirection

BATTERY_VERSION = "v1.0"


# Всеки запис = един тест от националната батерия.
ASSESSMENT_BATTERY_V1: list[dict] = [
    # --- Технически тестове (точки, повече = по-добре) ---
    {
        "code": "TECH_PASS_TOP",
        "name": "Подаване с две ръце отгоре в цел",
        "category": TestCategory.technical,
        "unit": "points",
        "direction": TestDirection.higher_better,
        "protocol": (
            "Състезателят е с топка в квадрат 1×1 м в центъра на полето. Два ринга (65–70 см) "
            "в зони 2 и 4 до антените. Удря топката в земята и след отскачане я подава към ринга. "
            "Влязла топка = 2 т., докосване = 1 т., техническа грешка = −1 т. По 5 опита към зона 4 "
            "и 5 към зона 2, само с лице напред."
        ),
        "sort_order": 1,
    },
    {
        "code": "TECH_PASS_BOT",
        "name": "Подаване с две ръце отдолу в цел",
        "category": TestCategory.technical,
        "unit": "points",
        "direction": TestDirection.higher_better,
        "protocol": (
            "На стена два квадрата 80×80 см (долен ръб на 150 см и 250 см); ограничителна линия на "
            "250 см от стената. След свободно подхвърляне се изпълняват 20 последователни подавания "
            "отдолу, редувайки квадратите. Всеки уцелен последователно квадрат = +1 т. Спиране, "
            "хващане, изпускане или настъпване на линията = −1 т."
        ),
        "sort_order": 2,
    },
    {
        "code": "TECH_SERVE",
        "name": "Начален удар в цел",
        "category": TestCategory.technical,
        "unit": "points",
        "direction": TestDirection.higher_better,
        "protocol": (
            "Състезателят е с топка зад зона 1 или 5 (по желание). Изпълнява 10 сервиса по правата "
            "към ограничени зони на 1,5 и 2,5 м от страничната линия. По-близката до линията зона = "
            "2 т., по-далечната = 1 т. Броят се точните изпълнения."
        ),
        "sort_order": 3,
    },
    {
        "code": "TECH_ATTACK",
        "name": "Нападение в цел (зони 4 / 3 / 2)",
        "category": TestCategory.technical,
        "unit": "points",
        "direction": TestDirection.higher_better,
        "protocol": (
            "Две целеви зони — триъгълници с рамена 3,5 м от ъглите на зони 1 и 5. Атакува "
            "последователно от зони 4, 3 и 2, по 6 опита от всяка (3 към зона 1, 3 към зона 5), след "
            "самостоятелно подхвърляне, крачки и отскок. За деца без техника след засилване се "
            "позволява отскок от място с активен удар в безопорно състояние. Всяко попадение = +1 т."
        ),
        "sort_order": 4,
    },
    # --- Бързина (секунди, по-малко = по-добре) ---
    {
        "code": "SPEED_9363",
        "name": "Бързина 9-3-6-3-9",
        "category": TestCategory.speed,
        "unit": "sec",
        "direction": TestDirection.lower_better,
        "protocol": (
            "Висок старт от място зад крайната линия. Докосва централната линия, обръща се и докосва "
            "триметровата линия, другата триметрова, централната и финишира на срещуположната крайна "
            "линия. Отчита се времето старт → финал (2 знака след десетичната запетая)."
        ),
        "sort_order": 5,
    },
    # --- Физически тестове (см, повече = по-добре) ---
    {
        "code": "PHYS_MEDBALL",
        "name": "Хвърляне на медицинска топка 3 кг над глава",
        "category": TestCategory.physical,
        "unit": "cm",
        "direction": TestDirection.higher_better,
        "sort_order": 6,
    },
    {
        "code": "PHYS_LONGJUMP",
        "name": "Дълъг скок с два крака от място",
        "category": TestCategory.physical,
        "unit": "cm",
        "direction": TestDirection.higher_better,
        "sort_order": 7,
    },
    {
        "code": "PHYS_JUMP_1ARM",
        "name": "Отскок от място с една ръка",
        "category": TestCategory.physical,
        "unit": "cm",
        "direction": TestDirection.higher_better,
        "sort_order": 8,
    },
    {
        "code": "PHYS_JUMP_2ARM",
        "name": "Отскок от място с две ръце",
        "category": TestCategory.physical,
        "unit": "cm",
        "direction": TestDirection.higher_better,
        "sort_order": 9,
    },
    {
        "code": "PHYS_JUMP_APPROACH",
        "name": "Отскок след засилване (атака)",
        "category": TestCategory.physical,
        "unit": "cm",
        "direction": TestDirection.higher_better,
        "sort_order": 10,
    },
    # --- Антропометрия (контекст — НЕ се точкува, служи за нормализиране) ---
    {
        "code": "ANTH_HEIGHT",
        "name": "Ръст",
        "category": TestCategory.anthropometry,
        "unit": "cm",
        "direction": TestDirection.context,
        "sort_order": 11,
    },
    {
        "code": "ANTH_WEIGHT",
        "name": "Тегло",
        "category": TestCategory.anthropometry,
        "unit": "kg",
        "direction": TestDirection.context,
        "sort_order": 12,
    },
    {
        "code": "ANTH_REACH",
        "name": "Разтег",
        "category": TestCategory.anthropometry,
        "unit": "cm",
        "direction": TestDirection.context,
        "sort_order": 13,
    },
]


def seed_assessment_battery(db: Session) -> int:
    """Upsert на батерията по `code`. Връща броя създадени нови записи.

    Безопасно за повторно изпълнение: съществуващите записи се обновяват (име,
    категория, мярка, посока, протокол, ред), без да се дублират.
    """
    existing = {t.code: t for t in db.query(TestDefinition).all()}
    created = 0

    for item in ASSESSMENT_BATTERY_V1:
        row = existing.get(item["code"])
        if row is None:
            row = TestDefinition(code=item["code"], battery_version=BATTERY_VERSION)
            db.add(row)
            created += 1
        row.name = item["name"]
        row.category = item["category"]
        row.unit = item["unit"]
        row.direction = item.get("direction", TestDirection.higher_better)
        row.protocol = item.get("protocol")
        row.video_url = item.get("video_url")
        row.age_min = item.get("age_min")
        row.age_max = item.get("age_max")
        row.sort_order = item.get("sort_order", 0)
        row.is_active = True
        row.battery_version = BATTERY_VERSION

    db.commit()
    return created
