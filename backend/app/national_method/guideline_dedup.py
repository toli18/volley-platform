"""Дедупликация на method_guidelines (грешка → корекция)."""

from __future__ import annotations

import re
from typing import Any


def error_fingerprint(error: str) -> str:
    t = (error or "").lower().strip()
    t = re.sub(r"\s+", " ", t)
    for a, b in (
        ("приемане", "прием"),
        ("блокиране", "блок"),
        ("атакуващ", "атака"),
        ("подаване", "подаване"),
    ):
        t = t.replace(a, b)
    return t[:80]


def dedupe_guideline_pairs(pairs: list[dict[str, str]]) -> list[dict[str, str]]:
    """Запазва по една корекция на уникална грешка (по-дългата корекция)."""
    best: dict[str, dict[str, str]] = {}
    for p in pairs:
        key = error_fingerprint(p.get("error", ""))
        if not key:
            continue
        prev = best.get(key)
        if not prev or len(p.get("correction", "")) > len(prev.get("correction", "")):
            best[key] = {"error": p["error"], "correction": p["correction"]}
    return list(best.values())
