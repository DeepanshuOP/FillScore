"""Price at t+h after a fill from 1s bars, and 1-minute aggregation for the spread estimators. Pure."""
from __future__ import annotations

import bisect
import math

HORIZONS_S = (1, 5, 30, 60, 300)
STALENESS_CAP_S = 5   # a price older than this at the target second is None, never carried further


def post_prices(bars: dict, executed_ms: float, horizons=HORIZONS_S, cap_s: int = STALENESS_CAP_S) -> dict:
    """{str(h): price|None}. price(t+h) = close of the latest 1s bar that had ENDED by floor(t+h) (no look-ahead);
    None when that bar ended more than cap_s before floor(t+h) (or no bar exists)."""
    opens = sorted(bars)
    out = {}
    for h in horizons:
        target = math.floor(executed_ms / 1000 + h)
        i = bisect.bisect_right(opens, target - 1) - 1      # latest bar with open <= target-1, i.e. ended <= target
        if i < 0 or target - (opens[i] + 1) > cap_s:
            out[str(h)] = None
        else:
            out[str(h)] = bars[opens[i]][2]
    return out


def aggregate_minutes(bars: dict) -> dict:
    """{minute_start_seconds: (high, low, close)} from 1s bars; close = close of the last 1s bar in the minute."""
    mins: dict[int, list] = {}
    for sec in sorted(bars):
        mins.setdefault(sec - sec % 60, []).append(bars[sec])
    return {m: (max(b[0] for b in rows), min(b[1] for b in rows), rows[-1][2]) for m, rows in mins.items()}
