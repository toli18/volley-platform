# backend/app/services/norm_producer.py
"""Продуцент на национални норми (Фаза 2 — „Машина за национални норми").

Смята „живата" българска летва за всяка клетка `тест × възраст × пол` от
ПОСЛЕДНАТА стойност на всяко дете (същата логика като скаут таблицата и
таланта). Това е слоят, който досега липсваше: резолверът отдавна знае да
ползва изчислена норма, но никой не я произвеждаше.

Принципи (потвърдени с треньора):
  • Двата стандарта остават: живата норма се показва ДО стандарт 2022.
  • Два прага:
      - ПОКАЗВАЙ от MIN_DISPLAY_SAMPLE (5) — летвата се вижда, маркирана индикативно;
      - ОФИЦИАЛНА основа от MIN_TRUST_SAMPLE (20) и САМО след изрично одобрение.
  • Одобрението записва допустима `computed` норма (maturity ≥ provisional),
    която резолверът вече знае да избира — официалните оценки се променят само
    тогава, не изненадващо.
  • След одобрение нормата се опреснява автоматично с растежа на данните
    (`refresh_approved_norms`, закачено към finalize), без ново одобрение.

Само четене за прегледа; записва в БД само при одобрение/оттегляне/опресняване.
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy.orm import Session

from app.models import (
    AssessmentNorm,
    AssessmentResult,
    AssessmentSession,
    AssessmentWindow,
    Athlete,
    Club,
    TestDefinition,
)
from app.models_assessment import TestCategory, TestDirection
from app.national_method import national_norms_2022 as nn2022
from app.national_method.assessment_battery import BATTERY_VERSION
from app.national_method.bulgaria_regions import REGIONS, region_for_city
from app.services import norm_confidence as nc
from app.services.assessment_scoring import (
    MIN_NORM_SAMPLE,
    age_band_from_birth_year,
    window_sort_key,
)

# Прагове: показвай от 5, доверявай се (официална основа) от 20.
MIN_DISPLAY_SAMPLE = 5
MIN_TRUST_SAMPLE = MIN_NORM_SAMPLE  # = 20


@dataclass(frozen=True)
class NormCandidate:
    """Изчислена (жива) норма за една клетка `тест × възраст × пол`."""

    test_code: str
    age_band: str
    gender: str
    n: int
    mean: Optional[float]
    std: Optional[float]
    p20: Optional[float]
    p40: Optional[float]
    p60: Optional[float]
    p80: Optional[float]
    clubs_count: int
    regions_count: int
    coverage: float  # дял покрити региони 0.0–1.0
    season_count: int
    eligible_athletes: int  # всички деца от тази възраст+пол (знаменател за участие)
    display_ready: bool  # n >= MIN_DISPLAY_SAMPLE
    trust_ready: bool  # n >= MIN_TRUST_SAMPLE
    confidence: str
    # Сравнение със стандарт 2022 (ако клетката е покрита).
    has_2022: bool
    mean_score_2022: Optional[float]  # къде ляга нашето средно по скалата 2022
    mean_label_2022: Optional[str]
    # Статус на одобрение (официална основа за оценката).
    is_approved: bool


def _percentile(sorted_vals: list[float], q: float) -> Optional[float]:
    """Линейно интерполиран процентил (q в 0..1) върху сортирани стойности."""
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    idx = q * (len(sorted_vals) - 1)
    lo = int(idx)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = idx - lo
    return round(sorted_vals[lo] + (sorted_vals[hi] - sorted_vals[lo]) * frac, 2)


@dataclass
class _CellData:
    raws: list[float]
    club_ids: set[int]
    seasons: set[str]


def _latest_by_cell(db: Session) -> dict[tuple[str, str, str], _CellData]:
    """Последна стойност на всяко дете, групирана по (тест, възраст, пол).

    „Последна" = по подредбата на прозорците (`window_sort_key`). Връща суровите
    стойности + участващите клубове и сезони (за покритие/зрялост).
    """
    ref_year = date.today().year
    rows = (
        db.query(
            AssessmentResult.athlete_id,
            AssessmentResult.test_code,
            AssessmentResult.raw_value,
            AssessmentWindow,
            Athlete.birth_year,
            Athlete.gender,
            Athlete.club_id,
        )
        .join(AssessmentSession, AssessmentResult.session_id == AssessmentSession.id)
        .join(AssessmentWindow, AssessmentWindow.id == AssessmentSession.window_id)
        .join(Athlete, Athlete.id == AssessmentResult.athlete_id)
        .filter(
            AssessmentResult.raw_value.isnot(None),
            Athlete.is_active.is_(True),
            Athlete.birth_year.isnot(None),
            Athlete.gender.isnot(None),
        )
        .all()
    )

    # latest[(athlete_id, test_code)] = (raw, age_band, gender, club_id, season)
    latest: dict[tuple[int, str], tuple] = {}
    for athlete_id, test_code, raw, window, birth_year, gender, club_id in sorted(
        rows, key=lambda r: window_sort_key(r[3])
    ):
        age_band = age_band_from_birth_year(birth_year, ref_year)
        if not age_band:
            continue
        latest[(athlete_id, test_code)] = (raw, age_band, gender, club_id, window.season)

    cells: dict[tuple[str, str, str], _CellData] = {}
    for (_athlete_id, test_code), (raw, age_band, gender, club_id, season) in latest.items():
        key = (test_code, age_band, gender)
        cell = cells.get(key)
        if cell is None:
            cell = _CellData(raws=[], club_ids=set(), seasons=set())
            cells[key] = cell
        cell.raws.append(raw)
        if club_id is not None:
            cell.club_ids.add(club_id)
        if season:
            cell.seasons.add(season)
    return cells


def _eligible_counts(db: Session) -> dict[tuple[str, str], int]:
    """Брой активни деца по (възраст, пол) — знаменател за „участие"."""
    ref_year = date.today().year
    rows = (
        db.query(Athlete.birth_year, Athlete.gender)
        .filter(
            Athlete.is_active.is_(True),
            Athlete.birth_year.isnot(None),
            Athlete.gender.isnot(None),
        )
        .all()
    )
    counts: dict[tuple[str, str], int] = {}
    for birth_year, gender in rows:
        age_band = age_band_from_birth_year(birth_year, ref_year)
        if not age_band:
            continue
        counts[(age_band, gender)] = counts.get((age_band, gender), 0) + 1
    return counts


def _club_region_map(db: Session, club_ids: set[int]) -> dict[int, Optional[str]]:
    """club_id → регион (по града на клуба)."""
    if not club_ids:
        return {}
    out: dict[int, Optional[str]] = {}
    for cid, city in db.query(Club.id, Club.city).filter(Club.id.in_(club_ids)).all():
        out[cid] = region_for_city(city)
    return out


def _scoreable_tests(db: Session, test_code: Optional[str]) -> list[TestDefinition]:
    query = db.query(TestDefinition).filter(TestDefinition.is_active.is_(True))
    if test_code:
        query = query.filter(TestDefinition.code == test_code)
    tests = query.order_by(TestDefinition.sort_order.asc(), TestDefinition.id.asc()).all()
    return [
        t
        for t in tests
        if (t.category.value if hasattr(t.category, "value") else t.category) != TestCategory.anthropometry.value
        and (t.direction.value if hasattr(t.direction, "value") else t.direction) != TestDirection.context.value
    ]


def _approved_keys(db: Session) -> set[tuple[str, str, str]]:
    """Клетки с активна одобрена `computed` норма (официална основа)."""
    rows = (
        db.query(AssessmentNorm.test_code, AssessmentNorm.age_band, AssessmentNorm.gender)
        .filter(
            AssessmentNorm.source == "computed",
            AssessmentNorm.source_status == "active",
            AssessmentNorm.battery_version == BATTERY_VERSION,
        )
        .all()
    )
    return {(tc, ab, g) for tc, ab, g in rows}


def _build_candidate(
    *,
    test_code: str,
    age_band: str,
    gender: str,
    cell: _CellData,
    region_map: dict[int, Optional[str]],
    eligible: int,
    is_approved: bool,
) -> NormCandidate:
    vals = sorted(cell.raws)
    n = len(vals)
    mean = round(statistics.fmean(vals), 2) if n else None
    std = round(statistics.pstdev(vals), 2) if n >= 2 else (0.0 if n == 1 else None)

    regions = {region_map.get(cid) for cid in cell.club_ids}
    regions.discard(None)
    regions_count = len(regions)
    coverage = round(regions_count / len(REGIONS), 3) if REGIONS else 0.0
    season_count = len(cell.seasons)

    confidence = nc.evaluate_confidence(
        nc.NormEvidence(
            source_type=nc.NormSourceType.NATIONAL,
            sample_size=n,
            coverage=coverage,
            season_count=season_count,
        )
    )

    bands = nn2022.get_bands(test_code, age_band, gender)
    mean_score_2022 = nn2022.score_2022(mean, test_code, age_band, gender) if (bands and mean is not None) else None
    mean_label_2022 = nn2022.grade_label(mean_score_2022) if mean_score_2022 is not None else None

    return NormCandidate(
        test_code=test_code,
        age_band=age_band,
        gender=gender,
        n=n,
        mean=mean,
        std=std,
        p20=_percentile(vals, 0.20),
        p40=_percentile(vals, 0.40),
        p60=_percentile(vals, 0.60),
        p80=_percentile(vals, 0.80),
        clubs_count=len(cell.club_ids),
        regions_count=regions_count,
        coverage=coverage,
        season_count=season_count,
        eligible_athletes=eligible,
        display_ready=n >= MIN_DISPLAY_SAMPLE,
        trust_ready=n >= MIN_TRUST_SAMPLE,
        confidence=confidence,
        has_2022=bands is not None,
        mean_score_2022=mean_score_2022,
        mean_label_2022=mean_label_2022,
        is_approved=is_approved,
    )


def compute_candidates(
    db: Session,
    *,
    gender: Optional[str] = None,
    age_band: Optional[str] = None,
    test_code: Optional[str] = None,
    include_below_display: bool = False,
) -> list[NormCandidate]:
    """Живите норми по клетки (за екрана на федерацията).

    По подразбиране връща само клетки с поне MIN_DISPLAY_SAMPLE деца; с
    `include_below_display=True` връща и по-малките (маркирани като ненастъпили).
    """
    cells = _latest_by_cell(db)
    eligible = _eligible_counts(db)
    approved = _approved_keys(db)
    all_clubs = {cid for cell in cells.values() for cid in cell.club_ids}
    region_map = _club_region_map(db, all_clubs)
    test_names = {t.code: t for t in _scoreable_tests(db, test_code)}
    valid_codes = set(test_names.keys())

    out: list[NormCandidate] = []
    for (tc, ab, g), cell in cells.items():
        if tc not in valid_codes:
            continue
        if gender and g != gender:
            continue
        if age_band and ab != age_band:
            continue
        if not include_below_display and len(cell.raws) < MIN_DISPLAY_SAMPLE:
            continue
        out.append(
            _build_candidate(
                test_code=tc,
                age_band=ab,
                gender=g,
                cell=cell,
                region_map=region_map,
                eligible=eligible.get((ab, g), 0),
                is_approved=(tc, ab, g) in approved,
            )
        )

    cat_order = {"technical": 0, "speed": 1, "physical": 2}

    def _cat(code: str) -> int:
        td = test_names.get(code)
        cat = (td.category.value if hasattr(td.category, "value") else td.category) if td else ""
        return cat_order.get(cat, 9)

    out.sort(key=lambda c: (c.gender, c.age_band, _cat(c.test_code), c.test_code))
    return out


def _single_candidate(db: Session, test_code: str, age_band: str, gender: str) -> Optional[NormCandidate]:
    cands = compute_candidates(
        db, gender=gender, age_band=age_band, test_code=test_code, include_below_display=True
    )
    for c in cands:
        if c.test_code == test_code and c.age_band == age_band and c.gender == gender:
            return c
    return None


def approve_cell(
    db: Session, test_code: str, age_band: str, gender: str, *, force: bool = False
) -> AssessmentNorm:
    """Одобрява живата норма за клетка като официална основа (записва computed).

    Изисква n ≥ MIN_TRUST_SAMPLE, освен ако `force=True`. Резолверът вече знае да
    избира тази норма (maturity ≥ provisional) — оттук насетне оценките я ползват.
    """
    cand = _single_candidate(db, test_code, age_band, gender)
    if cand is None or cand.n == 0:
        raise ValueError("Няма данни за тази клетка.")
    if not force and cand.n < MIN_TRUST_SAMPLE:
        raise ValueError(
            f"Нужни са поне {MIN_TRUST_SAMPLE} деца за официална норма (сега са {cand.n})."
        )

    # Зрялост: поне PROVISIONAL (за да е допустима), надградена ако данните стигат.
    computed_maturity = nc.classify_maturity(cand.n, cand.season_count, cand.coverage)
    if nc.maturity_rank(computed_maturity) < nc.maturity_rank(nc.MaturityLevel.PROVISIONAL):
        maturity = nc.MaturityLevel.PROVISIONAL
    else:
        maturity = computed_maturity

    row = (
        db.query(AssessmentNorm)
        .filter(
            AssessmentNorm.test_code == test_code,
            AssessmentNorm.age_band == age_band,
            AssessmentNorm.gender == gender,
            AssessmentNorm.battery_version == BATTERY_VERSION,
        )
        .first()
    )
    if row is None:
        row = AssessmentNorm(
            test_code=test_code,
            age_band=age_band,
            gender=gender,
            battery_version=BATTERY_VERSION,
        )
        db.add(row)

    _apply_stats(row, cand)
    row.source = "computed"
    row.source_status = "active"
    row.maturity_level = maturity
    row.valid_from = date.today()
    row.valid_to = None
    db.commit()
    db.refresh(row)
    return row


def revoke_cell(db: Session, test_code: str, age_band: str, gender: str) -> Optional[AssessmentNorm]:
    """Оттегля одобрението: нормата става недопустима (резолверът пада на 2022/кохорта)."""
    row = (
        db.query(AssessmentNorm)
        .filter(
            AssessmentNorm.test_code == test_code,
            AssessmentNorm.age_band == age_band,
            AssessmentNorm.gender == gender,
            AssessmentNorm.battery_version == BATTERY_VERSION,
            AssessmentNorm.source == "computed",
        )
        .first()
    )
    if row is None:
        return None
    # Запазваме реда за история, но го правим недопустим за резолвера.
    row.source_status = "archived"
    row.maturity_level = nc.MaturityLevel.SEED
    row.valid_to = date.today()
    db.commit()
    db.refresh(row)
    return row


def refresh_approved_norms(db: Session) -> int:
    """Опреснява статистиките на ВЕЧЕ одобрените норми с текущите данни.

    Закача се към finalize: щом влязат нови резултати, одобрените летви се
    преизчисляват автоматично (без ново одобрение). Не активира нови клетки.
    Връща броя опреснени норми.
    """
    approved = (
        db.query(AssessmentNorm)
        .filter(
            AssessmentNorm.source == "computed",
            AssessmentNorm.source_status == "active",
            AssessmentNorm.battery_version == BATTERY_VERSION,
        )
        .all()
    )
    if not approved:
        return 0

    updated = 0
    for row in approved:
        cand = _single_candidate(db, row.test_code, row.age_band, row.gender)
        if cand is None or cand.n == 0:
            continue
        _apply_stats(row, cand)
        # Зрялостта може само да расте (никога под PROVISIONAL, докато е активна).
        computed_maturity = nc.classify_maturity(cand.n, cand.season_count, cand.coverage)
        if nc.maturity_rank(computed_maturity) > nc.maturity_rank(row.maturity_level or nc.MaturityLevel.PROVISIONAL):
            row.maturity_level = computed_maturity
        updated += 1

    if updated:
        db.commit()
    return updated


def _apply_stats(row: AssessmentNorm, cand: NormCandidate) -> None:
    """Пренася изчислените статистики върху ред AssessmentNorm."""
    row.sample_count = cand.n
    row.mean_value = cand.mean
    row.std_value = cand.std
    row.p20 = cand.p20
    row.p40 = cand.p40
    row.p60 = cand.p60
    row.p80 = cand.p80
    row.coverage = cand.coverage
    row.season_count = cand.season_count
