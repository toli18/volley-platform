# backend/app/services/scouting_service.py
"""Скаутска таблица — всички деца × всички тестове, с две сравнения.

За всяко дете × тест показваме:
  • последната измерена сурова стойност (най-скорошния прозорец);
  • оценка спрямо националния стандарт 2022 (за неговата възраст, ако е покрит);
  • връстников процентил — „по-добър от X% от децата на същата възраст и пол"
    в цялата система (маркиран „индикативно" при малка извадка).

Принцип: само ЧЕТЕ. Не променя официалната оценка/нормализация/Development Score.
Достъпът (кои деца се виждат) се решава от рутера; тук получаваме вече филтриран
списък атлети и тестове.

Производителност: един пас за всички тестове наведнъж — изгражда индекс
„последна стойност на атлет" за цялата система, който служи и за показаните деца,
и за връстниковите извадки (без N+1 заявки).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    TestDefinition,
    TestDirection,
)
from app.national_method import national_norms_2022 as nn2022
from app.services.assessment_scoring import (
    _enum_value,
    age_band_from_birth_year,
    window_sort_key,
)
from app.services.peer_norms import MIN_PEER_SAMPLE, percentile_rank


@dataclass(frozen=True)
class ScoutCell:
    test_code: str
    raw_value: Optional[float] = None
    # Сравнение А: национален стандарт 2022 (за собствената възраст).
    score_2022: Optional[float] = None
    score_2022_label: Optional[str] = None
    # Сравнение Б: връстников процентил в системата.
    peer_percentile: Optional[float] = None
    peer_sample: int = 0
    peer_indicative: bool = False
    # Сравнение В: талант — спрямо най-младата покрита от 2022 летва (по-големите).
    # Свети и за U9–U12, които нямат собствен 2022 репер. Индикативно.
    talent_score: Optional[float] = None
    talent_label: Optional[str] = None


@dataclass(frozen=True)
class ScoutRow:
    athlete_id: int
    athlete_name: str
    age_band: Optional[str]
    gender: Optional[str]
    cells: list[ScoutCell] = field(default_factory=list)


def _latest_value_index(
    db: Session, test_codes: list[str], ref_year: int
) -> dict[str, dict[int, tuple[float, Optional[str], Optional[str]]]]:
    """test_code → { athlete_id → (последна стойност, U-band, пол) } за цялата система."""
    if not test_codes:
        return {}

    rows = (
        db.query(
            AssessmentResult.test_code,
            AssessmentResult.athlete_id,
            AssessmentResult.raw_value,
            Athlete.birth_year,
            Athlete.gender,
            AssessmentWindow,
        )
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(AssessmentWindow, AssessmentWindow.id == AssessmentSession.window_id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentResult.test_code.in_(test_codes),
            AssessmentResult.raw_value.isnot(None),
        )
        .all()
    )

    index: dict[str, dict[int, tuple[float, Optional[str], Optional[str]]]] = {}
    # Възходящо по прозорец → по-новите презаписват по-старите (последна стойност).
    for test_code, athlete_id, raw_value, birth_year, gender, window in sorted(
        rows, key=lambda r: window_sort_key(r[5])
    ):
        age_band = age_band_from_birth_year(birth_year, ref_year)
        index.setdefault(test_code, {})[athlete_id] = (raw_value, age_band, gender)
    return index


def build_scouting_table(
    db: Session,
    athletes: list[Athlete],
    tests: list[TestDefinition],
    *,
    ref_year: Optional[int] = None,
) -> list[ScoutRow]:
    """Сглобява редовете (деца) × клетки (тестове) с двете сравнения."""
    ref_year = ref_year or date.today().year
    test_defs = list(tests)
    test_codes = [t.code for t in test_defs]
    higher_by_code = {
        t.code: _enum_value(t.direction) != TestDirection.lower_better.value for t in test_defs
    }

    index = _latest_value_index(db, test_codes, ref_year)

    rows: list[ScoutRow] = []
    for athlete in athletes:
        age_band = age_band_from_birth_year(athlete.birth_year, ref_year)
        gender = athlete.gender
        # Референтна летва за таланта: най-младата покрита 2022 група за пола.
        ref_band = nn2022.reference_age_band(gender)
        cells: list[ScoutCell] = []

        for test in test_defs:
            code = test.code
            per_athlete = index.get(code, {})
            entry = per_athlete.get(athlete.id)
            raw = entry[0] if entry else None

            if raw is None:
                cells.append(ScoutCell(test_code=code))
                continue

            # Сравнение А — стандарт 2022 за собствената възраст (None, ако непокрит).
            s2022 = nn2022.score_2022(raw, code, age_band, gender)
            label = nn2022.grade_label(s2022) if s2022 is not None else None

            # Сравнение В — талант спрямо летвата на по-големите (най-младата 2022 група).
            talent = nn2022.score_2022(raw, code, ref_band, gender) if ref_band else None
            talent_label = nn2022.grade_label(talent) if talent is not None else None

            # Сравнение Б — връстников процентил (същ пол + възраст, без самото дете).
            percentile = None
            sample = 0
            indicative = False
            if age_band and gender:
                peers = [
                    v
                    for aid, (v, ab, g) in per_athlete.items()
                    if aid != athlete.id and ab == age_band and g == gender
                ]
                if peers:
                    percentile = percentile_rank(raw, peers, higher_by_code[code])
                    sample = len(peers)
                    indicative = sample < MIN_PEER_SAMPLE

            cells.append(
                ScoutCell(
                    test_code=code,
                    raw_value=raw,
                    score_2022=s2022,
                    score_2022_label=label,
                    peer_percentile=percentile,
                    peer_sample=sample,
                    peer_indicative=indicative,
                    talent_score=talent,
                    talent_label=talent_label,
                )
            )

        rows.append(
            ScoutRow(
                athlete_id=athlete.id,
                athlete_name=athlete.athlete_name,
                age_band=age_band,
                gender=gender,
                cells=cells,
            )
        )

    return rows
