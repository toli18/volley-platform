"""Извличане на статии „Наука и спорта“ от volleycomment.bg (с ОК от БФВ)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from html import unescape
from typing import Optional
from urllib.parse import urljoin

import httpx

BASE = "https://volleycomment.bg"
SEARCH_URL = f"{BASE}/?s=%D0%BD%D0%B0%D1%83%D0%BA%D0%B0"
ARTICLE_LINK_RE = re.compile(
    r'href="(https://volleycomment\.bg/(?:naukata-i-sporta|naukata-i-spotra)[^"]+)"',
    re.I,
)
STRIP_MARKERS = (
    "Трябва да",
    "влезете",
    "публикувате коментар",
    "Отказ",
    "photo:",
    "February ",
    "Photo by",
    "© Volley",
)


@dataclass
class VolleyCommentArticle:
    url: str
    slug: str
    title_bg: str
    author: Optional[str] = None
    body_bg: str = ""
    summary_bg: str = ""
    key_points: list[str] = field(default_factory=list)
    category: str = "methodology"


def _clean_html_text(html: str) -> str:
    text = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<style[^>]*>.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _category_from_title(title: str) -> str:
    t = title.lower()
    if any(x in t for x in ("тактик", "защит", "отбран")):
        return "tactical"
    if any(x in t for x in ("мотивац", "ментал", "псих")):
        return "psychology"
    if any(x in t for x in ("план", "конспект", "организац")):
        return "organization"
    if any(x in t for x in ("split", "физиолог", "биомехан", "ssc")):
        return "physical"
    if any(x in t for x in ("учен", "ключ", "успех")):
        return "psychology"
    if any(x in t for x in ("анализ", "ефективност")):
        return "tactical"
    return "methodology"


def _extract_author_and_body(raw: str) -> tuple[Optional[str], str]:
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    author = None
    body_lines: list[str] = []
    for ln in lines:
        if any(m in ln for m in STRIP_MARKERS):
            break
        if re.match(r"^(доц\.|проф\.|д-р|Стефан|Светослав|Васил)", ln, re.I):
            if len(ln) < 120 and not author:
                author = ln
                continue
        if ln.startswith("Search Results") or ln == "Volley Comment":
            continue
        if re.match(r"^(January|February|March|April|May|June|July|August|September|October|November|December)\s", ln):
            continue
        body_lines.append(ln)
    body = "\n\n".join(body_lines).strip()
    return author, body


def _build_summary_and_points(body: str) -> tuple[str, list[str]]:
    paragraphs = [p.strip() for p in body.split("\n\n") if len(p.strip()) > 40]
    if not paragraphs:
        return "", []
    summary_parts = paragraphs[:2]
    summary = " ".join(summary_parts)
    if len(summary) > 900:
        summary = summary[:897] + "…"
    points: list[str] = []
    for p in paragraphs:
        for sent in re.split(r"(?<=[.!?])\s+", p):
            s = sent.strip()
            if 50 < len(s) < 420 and s not in points:
                if any(
                    kw in s.lower()
                    for kw in (
                        "тактик",
                        "треньор",
                        "състезател",
                        "отбор",
                        "игра",
                        "тренир",
                        "волейбол",
                        "защит",
                        "напад",
                        "систем",
                        "ротац",
                        "подготов",
                    )
                ):
                    points.append(s)
            if len(points) >= 10:
                break
        if len(points) >= 10:
            break
    if len(points) < 4:
        for p in paragraphs[2:6]:
            if len(p) > 60:
                points.append(p[:350] + ("…" if len(p) > 350 else ""))
            if len(points) >= 6:
                break
    return summary, points[:10]


def discover_article_urls(max_pages: int = 10) -> list[str]:
    seen: set[str] = set()
    urls: list[str] = []
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        for page in range(1, max_pages + 1):
            page_url = SEARCH_URL if page == 1 else f"{SEARCH_URL}&paged={page}"
            r = client.get(page_url, headers={"User-Agent": "BVF-VolleyPlatform/1.0 (educational ingest)"})
            r.raise_for_status()
            found = ARTICLE_LINK_RE.findall(r.text)
            if not found:
                break
            new = 0
            for href in found:
                href = href.split("#")[0].rstrip("/") + "/"
                if href not in seen:
                    seen.add(href)
                    urls.append(href)
                    new += 1
            if new == 0 and page > 1:
                break
    return urls


def fetch_article(url: str) -> Optional[VolleyCommentArticle]:
    with httpx.Client(timeout=45.0, follow_redirects=True) as client:
        r = client.get(url, headers={"User-Agent": "BVF-VolleyPlatform/1.0 (educational ingest)"})
        r.raise_for_status()
        html = r.text
    slug = url.rstrip("/").split("/")[-1]
    title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
    title = ""
    if title_m:
        title = re.sub(r"\s*\|.*$", "", unescape(title_m.group(1))).strip()
        title = re.sub(r"^Науката и спорта\s*[-–]\s*", "", title).strip()
    raw = _clean_html_text(html)
    author, body = _extract_author_and_body(raw)
    if not body or len(body) < 200:
        return None
    if not title:
        title = body.split("\n")[0][:200]
    summary, key_points = _build_summary_and_points(body)
    body_md = body
    if key_points:
        body_md += "\n\n## Ключови точки за треньора\n\n" + "\n".join(f"- {k}" for k in key_points)
    body_md += f"\n\n---\n\n*Източник: [Volley Comment / БФВ]({url})*"
    return VolleyCommentArticle(
        url=url,
        slug=slug,
        title_bg=title[:512],
        author=author,
        body_bg=body_md[:118_000],
        summary_bg=summary,
        key_points=key_points,
        category=_category_from_title(title),
    )
