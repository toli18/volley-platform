"""Позиция в годишната програма по календар (чист модул, без БД).

Идея:
- Годишната програма за дадена възраст = последователност от мезоцикли (4 седмици всеки).
- Позицията (кой мезо / коя седмица) се определя от КАЛЕНДАРА:
    дата → изминали седмици от старта → отместване по мезота.
- Стартовият мезо по подразбиране се избира по МЕСЕЦА на началната дата
  (с възможност за override).

Модулът е чист: приема списък с meso-дефиниции (от annual_program.meso_definitions_for)
и връща число на мезо + седмица (1..4). Не чете база и не пише състояние.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Optional

WEEKS_PER_MESO = 4

# Български месеци → номер (1..12). Поддържа и варианти с пълни имена.
_BG_MONTHS: dict[str, int] = {
    "януари": 1,
    "февруари": 2,
    "март": 3,
    "април": 4,
    "май": 5,
    "юни": 6,
    "юли": 7,
    "август": 8,
    "септември": 9,
    "октомври": 10,
    "ноември": 11,
    "декември": 12,
}

# Възможни разделители в "months_bg" (en-dash, em-dash, hyphen, наклонена черта).
_RANGE_SEPARATORS = ("–", "—", "-", "/", ",")


def parse_iso_date(value: Any) -> Optional[date]:
    """Толерантен парсер за 'YYYY-MM-DD' (или date/datetime)."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip()
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _first_month_of(months_bg: Any) -> Optional[int]:
    """Връща номера на ПЪРВИЯ месец от низ като 'август–септември'."""
    if not months_bg:
        return None
    text = str(months_bg).strip().lower()
    for sep in _RANGE_SEPARATORS:
        if sep in text:
            text = text.split(sep, 1)[0].strip()
            break
    return _BG_MONTHS.get(text)


def month_to_meso(defs: list[dict[str, Any]], month: int) -> int:
    """Кой мезо (по meso_number) отговаря на даден календарен месец.

    Мезотата вървят последователно през сезона (напр. август→юни). За месец
    избираме последния мезо, чийто начален месец вече е настъпил в сезонния ред
    (с пренос през Нова година). Ако нищо не пасва — първият мезо.
    """
    if not defs:
        return 1
    starts: list[tuple[int, int]] = []  # (meso_number, first_month)
    for d in defs:
        fm = _first_month_of(d.get("months_bg"))
        if fm is not None:
            starts.append((int(d["meso_number"]), fm))
    if not starts:
        return int(defs[0]["meso_number"])

    season_start = starts[0][1]

    def season_ord(m: int) -> int:
        return (m - season_start) % 12

    target = season_ord(month)
    chosen = starts[0][0]
    best_ord = -1
    for meso_number, fm in starts:
        o = season_ord(fm)
        if o <= target and o > best_ord:
            best_ord = o
            chosen = meso_number
    return chosen


def _meso_index_by_number(defs: list[dict[str, Any]], meso_number: int) -> int:
    for i, d in enumerate(defs):
        if int(d["meso_number"]) == int(meso_number):
            return i
    return 0


def resolve_start_meso(
    defs: list[dict[str, Any]],
    start_date: date,
    *,
    override: Any = None,
) -> int:
    """Стартов мезо: override (ако валиден) > по месеца на началната дата."""
    if override is not None:
        try:
            num = int(override)
        except (TypeError, ValueError):
            num = None
        if num is not None and any(int(d["meso_number"]) == num for d in defs):
            return num
    return month_to_meso(defs, start_date.month)


def monday_of(d: date) -> date:
    """Понеделник (00:00) на седмицата, съдържаща d (седмица = пон–нед)."""
    return d - timedelta(days=d.weekday())


def resolve_position(
    defs: list[dict[str, Any]],
    start_date: date,
    ref_date: date,
    *,
    start_meso_override: Any = None,
) -> dict[str, Any]:
    """Връща позицията в програмата за референтна дата ref_date.

    Седмицата е единицата на придвижване: всеки мезо = 4 седмици.
    Броим по календарни седмици (пон–нед) от седмицата на старта.
    """
    if not defs:
        return {
            "started": False,
            "completed": False,
            "meso_number": None,
            "meso_index": 0,
            "total_mesos": 0,
            "week_in_meso": 0,
            "global_week": 0,
        }

    total = len(defs)
    start_meso = resolve_start_meso(defs, start_date, override=start_meso_override)
    start_index = _meso_index_by_number(defs, start_meso)

    start_monday = monday_of(start_date)
    ref_monday = monday_of(ref_date)
    weeks_elapsed = (ref_monday - start_monday).days // 7

    if weeks_elapsed < 0:
        # Програмата още не е започнала към ref_date.
        first = defs[start_index]
        return {
            "started": False,
            "completed": False,
            "meso_number": int(first["meso_number"]),
            "meso_index": start_index + 1,
            "total_mesos": total,
            "week_in_meso": 0,
            "global_week": weeks_elapsed,
            "weeks_until_start": -weeks_elapsed,
        }

    meso_offset = weeks_elapsed // WEEKS_PER_MESO
    week_in_meso = (weeks_elapsed % WEEKS_PER_MESO) + 1
    target_index = start_index + meso_offset

    if target_index >= total:
        # Програмата е изчерпана — заковаваме на последния мезо/седмица.
        last = defs[total - 1]
        return {
            "started": True,
            "completed": True,
            "meso_number": int(last["meso_number"]),
            "meso_index": total,
            "total_mesos": total,
            "week_in_meso": WEEKS_PER_MESO,
            "global_week": weeks_elapsed,
        }

    cur = defs[target_index]
    return {
        "started": True,
        "completed": False,
        "meso_number": int(cur["meso_number"]),
        "meso_index": target_index + 1,
        "total_mesos": total,
        "week_in_meso": week_in_meso,
        "global_week": weeks_elapsed,
    }
