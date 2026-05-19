from __future__ import annotations

import re


def normalize_phone_digits(raw: str | None) -> str:
    """Keep digits only; normalize BG mobiles to last 9 digits (without leading 0)."""
    if not raw:
        return ""
    digits = re.sub(r"\D+", "", str(raw).strip())
    if digits.startswith("359") and len(digits) >= 11:
        digits = digits[3:]
    if digits.startswith("0") and len(digits) >= 10:
        digits = digits[1:]
    return digits


def phones_match(stored: str | None, input_digits: str) -> bool:
    stored_digits = normalize_phone_digits(stored)
    if not stored_digits or not input_digits:
        return False
    if stored_digits == input_digits:
        return True
    # Compare last 9 digits (BG mobile)
    if len(stored_digits) >= 9 and len(input_digits) >= 9:
        return stored_digits[-9:] == input_digits[-9:]
    return False
