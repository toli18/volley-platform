#!/usr/bin/env python3
"""Appendix 12 blank is the official municipality DOCX — do not regenerate it.

Source of truth:
  backend/app/static/troyan-hall/prilozhenie-12.docx

That file is the filled official blank (Приложение № 12). Runtime code only
writes dates/hours into the schedule table; all other content stays untouched.

This script refuses to overwrite the blank so a rebuild cannot destroy it.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "app" / "static" / "troyan-hall" / "prilozhenie-12.docx"


def main() -> int:
    if OUT.is_file():
        print(
            f"Refusing to overwrite official blank:\n  {OUT}\n"
            f"({OUT.stat().st_size} bytes). Replace it only by copying the "
            "municipality DOCX into that path.",
            file=sys.stderr,
        )
        return 1
    print(f"Missing blank at {OUT}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
