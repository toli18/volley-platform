from __future__ import annotations

from typing import Literal

CompetitionKind = Literal["championship", "tournament", "control", "friendly"]

COMPETITION_KIND_VALUES: tuple[str, ...] = ("championship", "tournament", "control", "friendly")

COMPETITION_KIND_LABELS: dict[str, str] = {
    "championship": "Първенство",
    "tournament": "Турнир",
    "control": "Контролна",
    "friendly": "Приятелска",
}


def competition_kind_label(kind: str | None) -> str:
    return COMPETITION_KIND_LABELS.get(str(kind or "").strip(), str(kind or "Състезание"))


def is_valid_competition_kind(kind: str | None) -> bool:
    return str(kind or "").strip() in COMPETITION_KIND_LABELS
