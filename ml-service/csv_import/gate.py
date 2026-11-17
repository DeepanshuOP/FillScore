"""Process-wide limits of the CSV check, so that no number of accounts can load Binance's public API beyond a fixed amount (review 2026-11-18):
at most 2 checks run at once, and after the market-data source answers 418 or 429 no check fetches anything until the pause is over."""
from __future__ import annotations

import threading
import time

MAX_CONCURRENT = 2
DEFAULT_COOLDOWN_S = 60
_lock = threading.Lock()
_running = 0
_cooldown_until = 0.0


def reset() -> None:
    global _running, _cooldown_until
    with _lock:
        _running, _cooldown_until = 0, 0.0


def try_enter() -> bool:
    global _running
    with _lock:
        if _running >= MAX_CONCURRENT:
            return False
        _running += 1
        return True


def leave() -> None:
    global _running
    with _lock:
        _running = max(0, _running - 1)


def set_cooldown(seconds: float | None, now: float | None = None) -> int:
    """Pause every check for `seconds` (the source's Retry-After when it gave one, else a minute). Returns the seconds set."""
    global _cooldown_until
    s = int(seconds) if seconds and seconds > 0 else DEFAULT_COOLDOWN_S
    with _lock:
        _cooldown_until = max(_cooldown_until, (time.time() if now is None else now) + s)
    return s


def cooling(now: float | None = None) -> int | None:
    """Seconds left of the pause, or None."""
    left = _cooldown_until - (time.time() if now is None else now)
    return max(1, int(left) + 1) if left > 0 else None
