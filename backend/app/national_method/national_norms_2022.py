# backend/app/national_method/national_norms_2022.py
"""Официални репери от националното тестване на БФВ (2022) — ЧИСТ модул.

Това е каноничен **външен репер** (external reference), въведен дословно от
публикуваните таблици за оценка. За разлика от изчислените норми (от наши данни),
тези тук са за един сезон и са от ограничена извадка, затова концептуално са
„индикативни" — служат като отправна точка, докато платформата натрупа
собствени български данни.

Какво има в източника
----------------------
Таблиците дават 4 словесни нива на оценка за всеки показател:

    Незадоволително · Задоволително · Много добро · Отлично

Налични са два листа:
  • Момичета 13–14 г.  → прилагаме за female, възрасти U13 и U14
  • Момчета  14–15 г.  → прилагаме за male,   възрасти U14 и U15

Свързване с тестовете на платформата
------------------------------------
  • Медицинска топка — таблицата е в МЕТРИ, платформата пази в СМ → ×100.
  • Отскоците в платформата пазят ОБЩАТА височина на докосване (разтег + отскок),
    затова ползваме редовете за „височина" (големите числа), НЕ „чистия" отскок
    (чистият = докосване − разтег, той се изчислява отделно и не се точкува тук).
  • Два теста на платформата ги НЯМА в таблиците 2022 и затова нямат репер тук:
    `TECH_ATTACK` (нападение в цел) и `PHYS_JUMP_1ARM` (отскок с една ръка).
  • Антропометрията (ръст/тегло/разтег) не се точкува и не се включва тук.

Превръщане на нивата в оценка 0–100
-----------------------------------
Скалата е подравнена към интуицията „като бележки в тетрадката":

    Незадоволително → под 40 · Задоволително → ~50 · Много добро → ~70 · Отлично → 80–100

Реализирано чрез опорни точки (raw → score) на границите между нивата и линейна
интерполация/екстраполация между тях (clamp 0–100). Виж `score_from_anchors`.

ВАЖНО: този модул е ЧИСТ (без БД/IO) и засега НЕ е закачен към scoring/resolver —
въвеждането му не променя текущото поведение. Активирането е отделна стъпка.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

SOURCE_LABEL = "БФВ — национално тестване 2022"
SEASON = "2022"

# Граничните опорни оценки между словесните нива.
SCORE_SATISFACTORY = 40.0  # долна граница на „Задоволително"
SCORE_VERY_GOOD = 60.0  # долна граница на „Много добро"
SCORE_EXCELLENT = 80.0  # долна граница на „Отлично"

# Словесните нива (както са публикувани в таблиците 2022).
LEVEL_UNSATISFACTORY = "Незадоволително"
LEVEL_SATISFACTORY = "Задоволително"
LEVEL_VERY_GOOD = "Много добро"
LEVEL_EXCELLENT = "Отлично"


def grade_label(score: float) -> str:
    """Превръща оценка 0–100 в словесно ниво (както „бележка в тетрадката")."""
    if score < SCORE_SATISFACTORY:
        return LEVEL_UNSATISFACTORY
    if score < SCORE_VERY_GOOD:
        return LEVEL_SATISFACTORY
    if score < SCORE_EXCELLENT:
        return LEVEL_VERY_GOOD
    return LEVEL_EXCELLENT


@dataclass(frozen=True)
class GradeBands:
    """Границите между четирите нива в СУРОВИ единици (платформени).

    Стойностите са границите между съседните нива (midpoint между съседните
    числа от таблицата). Подредени са по нарастваща сурова стойност:
      • `t_low`  — граница Незадоволително ↔ Задоволително
      • `t_mid`  — граница Задоволително ↔ Много добро
      • `t_high` — граница Много добро ↔ Отлично

    `higher_better=False` (напр. бързина) означава, че по-малката сурова стойност
    е по-добра; опорните точки се конструират съответно.
    """

    t_low: float
    t_mid: float
    t_high: float
    higher_better: bool = True

    def anchors(self) -> list[tuple[float, float]]:
        """Опорни точки (raw, score), сортирани по нарастващ raw.

        За higher_better: по-голям raw → по-висока оценка.
        За lower_better:  по-голям raw → по-ниска оценка.
        """
        if self.higher_better:
            return [
                (self.t_low, SCORE_SATISFACTORY),
                (self.t_mid, SCORE_VERY_GOOD),
                (self.t_high, SCORE_EXCELLENT),
            ]
        # lower_better: t_high е най-добрата (най-малка) граница.
        return [
            (self.t_high, SCORE_EXCELLENT),
            (self.t_mid, SCORE_VERY_GOOD),
            (self.t_low, SCORE_SATISFACTORY),
        ]


def score_from_anchors(raw: float, anchors: list[tuple[float, float]]) -> float:
    """Превръща сурова стойност в оценка 0–100 по опорни точки.

    `anchors` са (raw, score), сортирани по нарастващ raw, с МОНОТОННА оценка
    (растяща за higher_better, намаляваща за lower_better). Между опорните точки
    се интерполира линейно; извън тях се екстраполира по наклона на крайния
    сегмент. Резултатът се ограничава в [0, 100].
    """
    if not anchors:
        return 50.0
    if len(anchors) == 1:
        return _clamp(anchors[0][1])

    # Преди първата опорна точка — екстраполация по първия сегмент.
    if raw <= anchors[0][0]:
        (x0, y0), (x1, y1) = anchors[0], anchors[1]
        return _clamp(_lerp(raw, x0, y0, x1, y1))
    # След последната — екстраполация по последния сегмент.
    if raw >= anchors[-1][0]:
        (x0, y0), (x1, y1) = anchors[-2], anchors[-1]
        return _clamp(_lerp(raw, x0, y0, x1, y1))
    # Вътре — намираме обхващащия сегмент.
    for (x0, y0), (x1, y1) in zip(anchors, anchors[1:]):
        if x0 <= raw <= x1:
            return _clamp(_lerp(raw, x0, y0, x1, y1))
    return _clamp(anchors[-1][1])  # теоретично недостижимо


def _lerp(x: float, x0: float, y0: float, x1: float, y1: float) -> float:
    if x1 == x0:
        return y0
    return y0 + (y1 - y0) * (x - x0) / (x1 - x0)


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return round(max(lo, min(hi, x)), 1)


# =========================================================================
# Дословни граници от таблиците 2022 (в платформени единици).
# Коментарите цитират публикуваните нива: НЗ=Незадоволително, З=Задоволително,
# МД=Много добро, ОТ=Отлично.
# =========================================================================

# --- Момичета 13–14 г. (female; прилага се за U13 и U14) ---
_GIRLS_13_14: dict[str, GradeBands] = {
    # Хвърляне мед. топка 3 кг (м→см): НЗ<4.4 · З 4.5–5.9 · МД 6–7.9 · ОТ>8
    "PHYS_MEDBALL":       GradeBands(445.0, 595.0, 795.0, higher_better=True),
    # Бързина 9-3-6-3-9 (сек, по-малко=по-добре): ОТ<8.50 · МД 8.51–9.20 · З 9.21–9.99 · НЗ>10
    "SPEED_9363":         GradeBands(9.995, 9.205, 8.505, higher_better=False),
    # Дълъг скок (см): НЗ<169 · З 170–194 · МД 195–219 · ОТ>220
    "PHYS_LONGJUMP":      GradeBands(169.5, 194.5, 219.5, higher_better=True),
    # Отскок от място, докосване 2 ръце — височина (см): НЗ<234 · З 235–259 · МД 260–274 · ОТ>275
    "PHYS_JUMP_2ARM":     GradeBands(234.5, 259.5, 274.5, higher_better=True),
    # Отскок след засилване (забиване) — височина (см): НЗ<245 · З 244–260 · МД 261–281 · ОТ>282
    "PHYS_JUMP_APPROACH": GradeBands(244.5, 260.5, 281.5, higher_better=True),
    # Подаване отгоре (точки): НЗ<2 · З 3–4 · МД 5–9 · ОТ>10
    "TECH_PASS_TOP":      GradeBands(2.5, 4.5, 9.5, higher_better=True),
    # Подаване отдолу (точки): НЗ<7 · З 8–13 · МД 14–19 · ОТ>20
    "TECH_PASS_BOT":      GradeBands(7.5, 13.5, 19.5, higher_better=True),
    # Горен начален удар (точки): НЗ<3 · З 4–7 · МД 8–13 · ОТ>14
    "TECH_SERVE":         GradeBands(3.5, 7.5, 13.5, higher_better=True),
}

# --- Момчета 14–15 г. (male; прилага се за U14 и U15) ---
_BOYS_14_15: dict[str, GradeBands] = {
    # Хвърляне мед. топка 3 кг (м→см): НЗ<5.9 · З 6–7.9 · МД 8–9.9 · ОТ 10–12
    "PHYS_MEDBALL":       GradeBands(595.0, 795.0, 995.0, higher_better=True),
    # Бързина 9-3-6-3-9 (сек, по-малко=по-добре): ОТ<7.4 · МД 7.5–8.4 · З 8.5–9 · НЗ>9
    "SPEED_9363":         GradeBands(9.0, 8.45, 7.45, higher_better=False),
    # Дълъг скок (см): НЗ<190 · З 191–219 · МД 220–250 · ОТ>251
    "PHYS_LONGJUMP":      GradeBands(190.5, 219.5, 250.5, higher_better=True),
    # Отскок от място, докосване 2 ръце — височина (см): НЗ<270 · З 270–289 · МД 290–309 · ОТ>310
    "PHYS_JUMP_2ARM":     GradeBands(269.5, 289.5, 309.5, higher_better=True),
    # Отскок след засилване (забиване) — височина (см): НЗ<280 · З 281–299 · МД 300–324 · ОТ>325
    "PHYS_JUMP_APPROACH": GradeBands(280.5, 299.5, 324.5, higher_better=True),
    # Подаване отгоре (точки): НЗ 0–2 · З 3–5 · МД 6–8 · ОТ>8
    "TECH_PASS_TOP":      GradeBands(2.5, 5.5, 8.5, higher_better=True),
    # Подаване отдолу (точки): НЗ 0–5 · З 6–10 · МД 11–15 · ОТ 16–20
    "TECH_PASS_BOT":      GradeBands(5.5, 10.5, 15.5, higher_better=True),
    # Горен начален удар (точки): НЗ 0–4 · З 5–8 · МД 9–15 · ОТ 16–20
    "TECH_SERVE":         GradeBands(4.5, 8.5, 15.5, higher_better=True),
}


# Разгъване: всеки лист покрива две възрастови групи (по един и същ репер).
_COVERAGE: list[tuple[str, tuple[str, ...], dict[str, GradeBands]]] = [
    ("female", ("U13", "U14"), _GIRLS_13_14),
    ("male", ("U14", "U15"), _BOYS_14_15),
]


def get_bands(test_code: str, age_band: Optional[str], gender: Optional[str]) -> Optional[GradeBands]:
    """Връща нивата 2022 за клетка (test × age × gender) или None, ако няма репер."""
    if not age_band or not gender:
        return None
    for g, bands_ages, table in _COVERAGE:
        if gender == g and age_band in bands_ages and test_code in table:
            return table[test_code]
    return None


def reference_age_band(gender: Optional[str]) -> Optional[str]:
    """Най-младата покрита от 2022 възрастова група за пола — „горната летва".

    Тя служи като референтен стандарт за откриване на талант: по-малко дете се
    сравнява срещу тази летва (female → U13, male → U14). Връща None, ако полът
    не е покрит от таблиците 2022.
    """
    if not gender:
        return None
    for g, bands_ages, _table in _COVERAGE:
        if gender == g and bands_ages:
            return bands_ages[0]
    return None


def score_2022(
    raw: float, test_code: str, age_band: Optional[str], gender: Optional[str]
) -> Optional[float]:
    """Оценка 0–100 спрямо репера 2022 за клетката, или None, ако няма репер."""
    bands = get_bands(test_code, age_band, gender)
    if bands is None:
        return None
    return score_from_anchors(raw, bands.anchors())


def iter_cells():
    """Итерира всички (test_code, age_band, gender, GradeBands) клетки на репера."""
    for gender, ages, table in _COVERAGE:
        for age_band in ages:
            for test_code, bands in table.items():
                yield test_code, age_band, gender, bands
