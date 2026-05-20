"""Resolve and proxy publicly linked external videos (Google Drive, etc.)."""

from __future__ import annotations

import re
from typing import Optional
from urllib.parse import parse_qs, urlparse

import httpx

DRIVE_HOSTS = ("drive.google.com", "docs.google.com")
DRIVE_ID_RE = re.compile(r"/file/d/([^/]+)")
DRIVE_OPEN_RE = re.compile(r"[?&]id=([^&]+)")


def extract_google_drive_file_id(url: str) -> Optional[str]:
    u = (url or "").strip()
    if not u:
        return None
    m = DRIVE_ID_RE.search(u)
    if m:
        return m.group(1)
    m = DRIVE_OPEN_RE.search(u)
    if m:
        return m.group(1)
    return None


def is_allowed_video_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").lower()
    if host in DRIVE_HOSTS:
        return extract_google_drive_file_id(url) is not None
    if host.endswith("dropbox.com"):
        return True
    path = (parsed.path or "").lower()
    return path.endswith((".mp4", ".webm", ".ogg", ".mov"))


def _confirm_token_from_cookie(cookies: httpx.Cookies) -> Optional[str]:
    for name in cookies:
        if name.startswith("download_warning"):
            return cookies[name]
    return None


async def resolve_google_drive_download_url(file_id: str) -> str:
    """Follow Drive redirects and virus-scan confirm to get a direct file URL."""
    base = "https://drive.google.com/uc"
    params: dict[str, str] = {"export": "download", "id": file_id}

    async with httpx.AsyncClient(follow_redirects=True, timeout=45.0) as client:
        resp = await client.get(base, params=params)
        resp.raise_for_status()

        token = _confirm_token_from_cookie(resp.cookies)
        if token:
            params["confirm"] = token
            resp = await client.get(base, params=params)
            resp.raise_for_status()

        content_type = (resp.headers.get("content-type") or "").lower()
        if "text/html" in content_type:
            body = resp.text
            m = re.search(r"confirm=([0-9A-Za-z_]+)", body)
            if m:
                params["confirm"] = m.group(1)
                resp = await client.get(base, params=params)
                resp.raise_for_status()

        return str(resp.url)


async def resolve_stream_target(url: str) -> str:
    """Map a user-supplied media URL to a fetchable direct stream URL."""
    if not is_allowed_video_url(url):
        raise ValueError("URL not allowed")

    file_id = extract_google_drive_file_id(url)
    if file_id:
        return await resolve_google_drive_download_url(file_id)

    parsed = urlparse(url)
    if parsed.hostname and parsed.hostname.endswith("dropbox.com"):
        qs = parse_qs(parsed.query)
        if "dl" not in qs:
            sep = "&" if parsed.query else "?"
            return f"{url}{sep}raw=1"
    return url
