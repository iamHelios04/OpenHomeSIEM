# === filename: backend/utils/time_utils.py ===
"""Timestamp parsing and UTC normalization helpers."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime


def ensure_utc(value: datetime) -> datetime:
    """Attach UTC to naive timestamps or convert aware timestamps to UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def parse_datetime(value: str | datetime | None) -> datetime | None:
    """Parse ISO or RFC date strings and return an aware UTC timestamp."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return ensure_utc(value)
    raw = value.strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        parsed = parsedate_to_datetime(raw)
    return ensure_utc(parsed)


def utc_now() -> datetime:
    """Return the current UTC time as an aware datetime."""
    return datetime.now(timezone.utc)
