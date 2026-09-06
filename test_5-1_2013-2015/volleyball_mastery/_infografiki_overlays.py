"""Overlay zones (% of frame) — cover only text areas, keep illustrations visible."""
from __future__ import annotations

from _infografiki_content import COMPARISON

Overlay = dict


def _comparison_layers(fn: str) -> list[Overlay]:
    spec = COMPARISON[fn]
    layers: list[Overlay] = [
        {"x": 0, "y": 0, "w": 100, "h": 8.8, "text": spec["title"], "cls": "title"},
        {"x": 0, "y": 8.8, "w": 100, "h": 2.8, "text": spec["subtitle"], "cls": "sub"},
        {"x": 0, "y": 11.4, "w": 100, "h": 2.2, "text": spec.get("tagline", ""), "cls": "tag"},
        {"x": 0, "y": 14.2, "w": 49.8, "h": 2.6, "text": spec["left_head"], "cls": "head-l"},
        {"x": 50.2, "y": 14.2, "w": 49.8, "h": 2.6, "text": spec["right_head"], "cls": "head-r"},
    ]
    # Small callout boxes (not full-width bands)
    left_pos = [
        (2, 17.5, 38, 5.2),
        (2, 27, 38, 5.2),
        (2, 36.5, 38, 5.2),
        (2, 46, 38, 5.2),
        (2, 55.5, 38, 5.2),
        (2, 65, 38, 5.2),
    ]
    right_pos = [
        (60, 17.5, 38, 5.2),
        (60, 27, 38, 5.2),
        (60, 36.5, 38, 5.2),
        (60, 46, 38, 5.2),
        (60, 55.5, 38, 5.2),
        (60, 65, 38, 5.2),
    ]
    for i, txt in enumerate(spec.get("left_labels", [])):
        if i < len(left_pos):
            x, y, w, h = left_pos[i]
            layers.append({"x": x, "y": y, "w": w, "h": h, "text": txt, "cls": "label-l"})
    for i, txt in enumerate(spec.get("right_labels", [])):
        if i < len(right_pos):
            x, y, w, h = right_pos[i]
            layers.append({"x": x, "y": y, "w": w, "h": h, "text": txt, "cls": "label-r"})
    layers.append({
        "x": 0, "y": 72, "w": 49.8, "h": 17.5,
        "text": spec.get("left_footer_title", "Ключови точки"),
        "cls": "foot-l", "items": spec.get("left_footer", []),
    })
    layers.append({
        "x": 50.2, "y": 72, "w": 49.8, "h": 17.5,
        "text": spec.get("right_footer_title", "Чести грешки"),
        "cls": "foot-r", "items": spec.get("right_footer", []),
    })
    layers.append({"x": 0, "y": 90.5, "w": 100, "h": 9.5, "text": spec.get("banner", ""), "cls": "banner"})
    return layers


def _vertical_layers(steps: list[str], title: str, ratio: float) -> list[Overlay]:
    """Each band: cover header + footer text only; middle = illustration."""
    n = max(len(steps), 1)
    layers: list[Overlay] = []

    # Global title only on tall images (short squares already have title in art)
    if ratio >= 1.15:
        layers.append({"x": 0, "y": 0, "w": 100, "h": 7.5, "text": title, "cls": "title"})

    top0 = 7.5 if ratio >= 1.15 else 0
    usable = 100 - top0
    sh = usable / n

    for i, step in enumerate(steps):
        y = top0 + i * sh
        short = step.split("—")[0].strip() if "—" in step else step[:32]
        # Header bar (~14% of strip)
        layers.append({"x": 0, "y": y, "w": 100, "h": sh * 0.14, "text": f"{i + 1}. {short}", "cls": "step-h"})
        # Body text at bottom of strip (~28% of strip), NOT over illustration
        layers.append({
            "x": 2, "y": y + sh * 0.68, "w": 96, "h": sh * 0.30,
            "text": step, "cls": "step-b",
        })
    return layers


def overlays_for(fn: str, title: str, steps: list[str], w: int, h: int) -> list[Overlay]:
    if fn in COMPARISON:
        return _comparison_layers(fn)
    ratio = h / w if w else 1.5
    if len(steps) >= 2:
        return _vertical_layers(steps, title, ratio)
    return _vertical_layers([title], title, ratio)
