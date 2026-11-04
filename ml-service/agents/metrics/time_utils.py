"""Shared UTC-hour parsing for the metrics packets (1c.1).
pymongo returns naive datetimes that are UTC; older fixtures use ISO-8601 strings."""
from __future__ import annotations
from datetime import datetime, timezone


def utc_hour(ts) -> int | None:
    """UTC hour 0-23 of a datetime (naive = UTC) or ISO-8601 string; None if unusable."""
    if isinstance(ts, str):
        s = ts.strip()
        if not s:
            return None
        if s.endswith(("Z", "z")):
            s = s[:-1] + "+00:00"
        try:
            ts = datetime.fromisoformat(s)
        except ValueError:
            return None
    if not isinstance(ts, datetime):
        return None
    if ts.tzinfo is not None:
        ts = ts.astimezone(timezone.utc)
    return ts.hour


def utc_hour_key(ts) -> str | None:
    h = utc_hour(ts)
    return None if h is None else f"{h:02d}"
