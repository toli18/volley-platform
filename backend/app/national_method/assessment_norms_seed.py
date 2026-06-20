# backend/app/national_method/assessment_norms_seed.py
"""Референтни норми (репери) за тестовата батерия — seed данни.

Целта е да имаме **абсолютна скала** още от първото измерване (cold-start), за
да показваме истински прогрес (делта), а не само относително подреждане в
рамките на кохортата.

ВАЖНО: Стойностите тук са ИНДИКАТИВНИ начални репери за youth волейбол и
подлежат на замяна с официални данни от методическия комитет на БФВ. Структурата
(тест × възрастова група × пол → mean/std) е окончателна; числата са примерни.

Поведение спрямо изчислените норми:
  • Тези репери се записват със `source="seed"`.
  • Когато за същия ключ се натрупа реална норма от данни (`source="computed"`),
    тя НЕ се презаписва от seed-а (виж `seed_reference_norms`).

Покрити са само точкуваните тестове (технически, бързина, физически).
Антропометрията не се точкува и няма репери.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AssessmentNorm

BATTERY_VERSION = "v1.0"

# Възрастови групи, за които даваме начални репери (ядро на youth волейбола).
# `age_band` се мачва с `age_band_from_birth_year` (формат "U{възраст}").
_BANDS = ("U13", "U14")

# Индикативни референтни стойности по възраст и тест.
# Формат: {test_code: {"male": mean_m, "female": mean_f, "std": std}}
# Единици: технически = точки; SPEED_9363 = секунди (по-малко = по-добре);
# физически = см. `std` е общо за двата пола (опростяване за v1).
_REFERENCE_BY_BAND: dict[str, dict[str, dict]] = {
    "U13": {
        "TECH_PASS_TOP":      {"male": 12.0, "female": 11.0, "std": 3.0},
        "TECH_PASS_BOT":      {"male": 11.0, "female": 10.0, "std": 3.5},
        "TECH_SERVE":         {"male": 9.0,  "female": 8.0,  "std": 3.0},
        "TECH_ATTACK":        {"male": 7.0,  "female": 6.0,  "std": 2.5},
        "SPEED_9363":         {"male": 9.2,  "female": 9.6,  "std": 0.6},
        "PHYS_MEDBALL":       {"male": 600.0, "female": 520.0, "std": 90.0},
        "PHYS_LONGJUMP":      {"male": 185.0, "female": 170.0, "std": 22.0},
        "PHYS_JUMP_1ARM":     {"male": 250.0, "female": 235.0, "std": 25.0},
        "PHYS_JUMP_2ARM":     {"male": 240.0, "female": 226.0, "std": 24.0},
        "PHYS_JUMP_APPROACH": {"male": 260.0, "female": 244.0, "std": 28.0},
    },
    "U14": {
        "TECH_PASS_TOP":      {"male": 13.0, "female": 12.0, "std": 3.0},
        "TECH_PASS_BOT":      {"male": 12.0, "female": 11.0, "std": 3.5},
        "TECH_SERVE":         {"male": 10.0, "female": 9.0,  "std": 3.0},
        "TECH_ATTACK":        {"male": 8.0,  "female": 7.0,  "std": 2.5},
        "SPEED_9363":         {"male": 8.9,  "female": 9.3,  "std": 0.6},
        "PHYS_MEDBALL":       {"male": 660.0, "female": 560.0, "std": 95.0},
        "PHYS_LONGJUMP":      {"male": 198.0, "female": 180.0, "std": 23.0},
        "PHYS_JUMP_1ARM":     {"male": 265.0, "female": 246.0, "std": 26.0},
        "PHYS_JUMP_2ARM":     {"male": 255.0, "female": 238.0, "std": 25.0},
        "PHYS_JUMP_APPROACH": {"male": 278.0, "female": 257.0, "std": 30.0},
    },
}


def _build_reference_norms() -> list[dict]:
    """Разгъва компактната таблица в плосък списък от репери (по пол)."""
    out: list[dict] = []
    for band in _BANDS:
        per_test = _REFERENCE_BY_BAND.get(band, {})
        for test_code, vals in per_test.items():
            std = vals["std"]
            for gender in ("male", "female"):
                out.append(
                    {
                        "test_code": test_code,
                        "age_band": band,
                        "gender": gender,
                        "mean": vals[gender],
                        "std": std,
                    }
                )
    return out


# Каноничният списък с репери (генериран от таблицата по-горе).
REFERENCE_NORMS_V1: list[dict] = _build_reference_norms()


def seed_reference_norms(db: Session) -> int:
    """Idempotent upsert на референтните норми. Връща броя нови записи.

    Безопасно за повторно изпълнение. НЕ презаписва норми, които вече са узрели
    от реални данни (`source="computed"`) — само създава/обновява `source="seed"`.
    """
    created = 0
    for item in REFERENCE_NORMS_V1:
        row = (
            db.query(AssessmentNorm)
            .filter(
                AssessmentNorm.test_code == item["test_code"],
                AssessmentNorm.age_band == item["age_band"],
                AssessmentNorm.gender == item["gender"],
                AssessmentNorm.battery_version == BATTERY_VERSION,
            )
            .first()
        )
        # Не пипаме норми, изчислени от реални данни.
        if row is not None and getattr(row, "source", "computed") == "computed":
            continue
        if row is None:
            row = AssessmentNorm(
                test_code=item["test_code"],
                age_band=item["age_band"],
                gender=item["gender"],
                battery_version=BATTERY_VERSION,
            )
            db.add(row)
            created += 1
        row.source = "seed"
        row.mean_value = item["mean"]
        row.std_value = item["std"]
        # Перцентилите засега остават None (ще се добавят с реални данни).
        row.sample_count = item.get("sample_count", 0)

    db.commit()
    return created
