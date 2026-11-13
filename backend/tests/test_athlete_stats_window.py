# -*- coding: utf-8 -*-
from datetime import datetime
from types import SimpleNamespace

from app.services.athlete_stats_window import (
    athlete_history_from_month,
    date_in_athlete_history,
    filter_months_in_athlete_history,
    month_in_athlete_history,
)


def test_history_from_created_at_month():
    athlete = SimpleNamespace(created_at=datetime(2026, 11, 13, 10, 0, 0))
    assert athlete_history_from_month(athlete) == "2026-11"
    assert month_in_athlete_history(athlete, "2026-11") is True
    assert month_in_athlete_history(athlete, "2026-12") is True
    assert month_in_athlete_history(athlete, "2026-10") is False


def test_no_created_at_allows_all():
    athlete = SimpleNamespace(created_at=None)
    assert month_in_athlete_history(athlete, "2020-01") is True
    assert date_in_athlete_history(athlete, "2020-01-01") is True


def test_filter_months_and_dates():
    athlete = SimpleNamespace(created_at=datetime(2026, 3, 5, 8, 0, 0))
    months = ["2026-01", "2026-02", "2026-03", "2026-04"]
    assert filter_months_in_athlete_history(months, athlete) == ["2026-03", "2026-04"]
    assert date_in_athlete_history(athlete, "2026-03-04") is False
    assert date_in_athlete_history(athlete, "2026-03-05") is True
    assert date_in_athlete_history(athlete, "2026-03-06") is True
