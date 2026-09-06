"""Per-image overlay zones (% of width/height) for Bulgarian text on original art."""
from __future__ import annotations

from _infografiki_content import COMPARISON

# cls: title | sub | head-l | head-r | label | foot-l | foot-r | banner | step-h | step-b
Overlay = dict  # {x,y,w,h,text,cls}


def _comparison_layers(fn: str) -> list[Overlay]:
    spec = COMPARISON[fn]
    layers: list[Overlay] = [
        {"x": 0, "y": 0, "w": 100, "h": 9.5, "text": spec["title"], "cls": "title"},
        {"x": 0, "y": 9.5, "w": 100, "h": 3.2, "text": spec["subtitle"], "cls": "sub"},
        {"x": 0, "y": 12.5, "w": 100, "h": 2.5, "text": spec.get("tagline", ""), "cls": "tag"},
        {"x": 0, "y": 15, "w": 49.5, "h": 3, "text": spec["left_head"], "cls": "head-l"},
        {"x": 50.5, "y": 15, "w": 49.5, "h": 3, "text": spec["right_head"], "cls": "head-r"},
    ]
    y_bands = [19, 28.5, 38, 47.5, 57, 66.5]
    for i, y in enumerate(y_bands):
        if i < len(spec.get("left_labels", [])):
            layers.append({
                "x": 1, "y": y, "w": 47, "h": 7.5,
                "text": spec["left_labels"][i], "cls": "label-l",
            })
        if i < len(spec.get("right_labels", [])):
            layers.append({
                "x": 52, "y": y, "w": 47, "h": 7.5,
                "text": spec["right_labels"][i], "cls": "label-r",
            })
    layers.append({
        "x": 0, "y": 71.5, "w": 49.5, "h": 19,
        "text": spec.get("left_footer_title", "Ключови точки"),
        "cls": "foot-title-l",
        "items": spec.get("left_footer", []),
    })
    layers.append({
        "x": 50.5, "y": 71.5, "w": 49.5, "h": 19,
        "text": spec.get("right_footer_title", "Чести грешки"),
        "cls": "foot-title-r",
        "items": spec.get("right_footer", []),
    })
    layers.append({"x": 0, "y": 90.5, "w": 100, "h": 9.5, "text": spec.get("banner", ""), "cls": "banner"})
    return layers


def _vertical_layers(steps: list[str], title: str) -> list[Overlay]:
    n = max(len(steps), 1)
    h = 100 / n
    layers: list[Overlay] = [{"x": 0, "y": 0, "w": 100, "h": min(8.5, h * 0.35), "text": title, "cls": "title"}]
    top0 = min(8.5, h * 0.35)
    usable = 100 - top0
    sh = usable / n
    for i, step in enumerate(steps):
        y = top0 + i * sh
        short = step.split("—")[0].strip() if "—" in step else step[:40]
        layers.append({"x": 0, "y": y, "w": 100, "h": sh * 0.22, "text": f"{i + 1}. {short}", "cls": "step-h"})
        layers.append({"x": 0, "y": y + sh * 0.38, "w": 100, "h": sh * 0.58, "text": step, "cls": "step-b"})
    return layers


def _tall_layers(steps: list[str], title: str) -> list[Overlay]:
    """Tall HD posters — title on top, numbered blocks on bottom third."""
    layers: list[Overlay] = [{"x": 0, "y": 0, "w": 100, "h": 8, "text": title, "cls": "title"}]
    bot = 66
    bh = (100 - bot) / max(len(steps), 1)
    for i, step in enumerate(steps):
        layers.append({
            "x": 2, "y": bot + i * bh, "w": 96, "h": bh - 0.5,
            "text": f"{i + 1}. {step}", "cls": "step-b",
        })
    return layers


def overlays_for(fn: str, title: str, steps: list[str], w: int, h: int) -> list[Overlay]:
    if fn in COMPARISON:
        return _comparison_layers(fn)
    ratio = h / w if w else 1.5
    if ratio >= 1.35:
        return _tall_layers(steps, title)
    if len(steps) >= 3:
        return _vertical_layers(steps, title)
    return _vertical_layers(steps or [title], title)
