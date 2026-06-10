"""
whale_score.py — T2.12 Whale Correlation feature.

Pure scoring function: operates on an already-fetched aggTrades DataFrame.
No network calls. No I/O side effects.

DIRECTION CONVENTION:
  is_buyer_maker == False  ->  taker BUY  ->  aggressive buy  ->  +notional
  is_buyer_maker == True   ->  taker SELL ->  aggressive sell ->  -notional
  notional = price * quantity (always positive; sign applied by direction)

ADVERSITY CONVENTION:
  For a user BUY trade:  a BUY whale pushes price up against the user -> adverse.
  For a user SELL trade: a SELL whale pushes price down against the user -> adverse.
  Therefore: adverse_score = whale_pressure  if trade_side == 'BUY'
                            = -whale_pressure if trade_side == 'SELL'
             adverse = adverse_score > 0
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd


def score_whale_window(
    aggtrades_df: pd.DataFrame,
    trade_ts_ms: int,
    trade_side: str,
    whale_notional_usd: float = 250_000.0,  # Calibrated 2026-06-09: yields ~37.3% detection rate on BTCUSDT demo trades
    burst_gap_ms: int = 1_000,
    tau_s: float = 10.0,
) -> dict[str, Any]:
    """
    Score whale pressure around a single user trade.

    Parameters
    ----------
    aggtrades_df : pd.DataFrame
        Columns: agg_trade_id, price, quantity, transact_time_ms, is_buyer_maker.
        Produced by fetch_aggtrades_window(); must cover the desired time window.
    trade_ts_ms : int
        The user trade's Unix timestamp in milliseconds.
    trade_side : str
        'BUY' or 'SELL' — the user's trade direction.
    whale_notional_usd : float
        Minimum cumulative burst notional to qualify as a whale event. Default $250 000.
    burst_gap_ms : int
        Maximum time gap (ms) between consecutive same-direction trades to be
        grouped into the same burst. Default 1 000 ms.
    tau_s : float
        Exponential decay time constant (seconds) for proximity weighting. Default 10 s.

    Returns
    -------
    dict with keys:
      net_pressure        float  [-1, 1]   signed flow / total volume
      whale_pressure      float            proximity-weighted whale flow / total volume
      adverse_score       float            >0 means whale pressure hurt this trade
      adverse             bool             adverse_score > 0
      whale_event_count   int              number of qualifying burst events
      nearest_whale_s     float | None     seconds to closest whale event (abs), None if no whales
      largest_whale_notional float         largest single event notional, 0 if no events
      whale_events        list[dict]       [{side, notional, ts_ms, seconds_from_trade}, ...]
    """
    _zero: dict[str, Any] = {
        "net_pressure": 0.0,
        "whale_pressure": 0.0,
        "adverse_score": 0.0,
        "adverse": False,
        "whale_event_count": 0,
        "nearest_whale_s": None,
        "largest_whale_notional": 0.0,
        "whale_events": [],
    }

    if aggtrades_df.empty:
        return _zero

    # ── Prepare ───────────────────────────────────────────────────────────────
    df = aggtrades_df[
        ["agg_trade_id", "price", "quantity", "transact_time_ms", "is_buyer_maker"]
    ].copy()
    df = df.sort_values("transact_time_ms").reset_index(drop=True)

    # WHY vectorised here: faster than row-wise apply for large DataFrames.
    df["notional"] = df["price"] * df["quantity"]          # always positive
    df["direction"] = df["is_buyer_maker"].map({False: "BUY", True: "SELL"})
    df["signed_notional"] = df["notional"].where(df["direction"] == "BUY", -df["notional"])

    total_abs_notional = df["notional"].sum()
    if total_abs_notional == 0.0:
        return _zero

    # ── net_pressure ──────────────────────────────────────────────────────────
    net_pressure: float = df["signed_notional"].sum() / total_abs_notional

    # ── Burst detection ───────────────────────────────────────────────────────
    # Walk the time-sorted rows; group consecutive same-direction rows whose
    # inter-row gap is <= burst_gap_ms into one burst.  Each completed burst
    # whose total notional >= whale_notional_usd becomes a whale event.
    # WHY midpoint timestamp: gives a single representative time without
    # biasing toward the start or end of a sustained burst.

    whale_events: list[dict[str, Any]] = []

    burst_dir: str | None = None
    burst_notional: float = 0.0
    burst_start_ts: int = 0
    burst_end_ts: int = 0
    prev_ts: int = 0

    def _finalise() -> None:
        if burst_dir is not None and burst_notional >= whale_notional_usd:
            ts_ms = (burst_start_ts + burst_end_ts) / 2.0
            whale_events.append({
                "side": burst_dir,
                "notional": burst_notional,
                "ts_ms": ts_ms,
                "seconds_from_trade": (ts_ms - trade_ts_ms) / 1_000.0,
            })

    for row in df.itertuples(index=False):
        cur_dir: str = row.direction
        cur_ts: int  = row.transact_time_ms
        cur_n: float = row.notional

        if burst_dir is None:
            # WHY: initialise with first row unconditionally.
            burst_dir = cur_dir
            burst_notional = cur_n
            burst_start_ts = burst_end_ts = prev_ts = cur_ts
        elif cur_dir == burst_dir and (cur_ts - prev_ts) <= burst_gap_ms:
            # Continue current burst.
            burst_notional += cur_n
            burst_end_ts = cur_ts
            prev_ts = cur_ts
        else:
            # Direction changed or gap exceeded — close the old burst, open a new one.
            _finalise()
            burst_dir = cur_dir
            burst_notional = cur_n
            burst_start_ts = burst_end_ts = prev_ts = cur_ts

    _finalise()  # close the final burst

    # ── whale_pressure ────────────────────────────────────────────────────────
    # Proximity-weighted: events far from the trade are down-weighted by exp decay.
    # WHY divide by total_abs_notional: normalises to the overall market volume so
    # the score is comparable across windows of different activity levels.
    whale_pressure: float = 0.0
    for evt in whale_events:
        sign = 1.0 if evt["side"] == "BUY" else -1.0
        decay = math.exp(-abs(evt["seconds_from_trade"]) / tau_s)
        whale_pressure += sign * evt["notional"] * decay
    whale_pressure /= total_abs_notional

    # ── adversity ─────────────────────────────────────────────────────────────
    # For a user BUY: a BUY whale (whale_pressure > 0) pushed the price up
    # before the user filled → adverse.
    # For a user SELL: a SELL whale (whale_pressure < 0) pushed price down → adverse.
    # Equivalently: flip sign for SELL so that >0 always means "hurt me".
    adverse_score: float = whale_pressure if trade_side == "BUY" else -whale_pressure
    adverse: bool = bool(adverse_score > 0)  # WHY: cast prevents np.bool_ leaking into return value

    # ── summary stats ─────────────────────────────────────────────────────────
    nearest_whale_s: float | None = None
    largest_whale_notional: float = 0.0
    if whale_events:
        nearest_whale_s = min(abs(e["seconds_from_trade"]) for e in whale_events)
        largest_whale_notional = max(e["notional"] for e in whale_events)

    return {
        "net_pressure": net_pressure,
        "whale_pressure": whale_pressure,
        "adverse_score": adverse_score,
        "adverse": adverse,
        "whale_event_count": len(whale_events),
        "nearest_whale_s": nearest_whale_s,
        "largest_whale_notional": largest_whale_notional,
        "whale_events": whale_events,
    }
