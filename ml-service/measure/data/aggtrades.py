"""Aggregate-trade windows: the one in-memory shape every loader produces and every benchmark reads.

Facts (verified on real files 2026-11-11, see tests/fixtures/market/SOURCE.md and docs/research/LOG.md section F):
  * `is_buyer_maker = True`  -> the buyer was resting, so the SELLER was the aggressor (a print at the bid side).
  * `is_buyer_maker = False` -> the BUYER was the aggressor (a print at the ask side).
  * Aggregate trade ids are consecutive per symbol.
  * Spot files on data.binance.vision use milliseconds before 2025-01-01 and microseconds from that date.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Iterable, NamedTuple, Sequence

import numpy as np


class TimestampUnitError(ValueError):
    pass


class AggTrade(NamedTuple):
    agg_id: int
    price: float
    qty: float
    ts_ms: int
    is_buyer_maker: bool


@dataclass(frozen=True)
class MarketDataRef:
    """Where a piece of market data came from, with a checksum, so a third party can fetch and re-verify it."""

    source: str                      # e.g. "data.binance.vision" or "api.binance.com"
    dataset: str                     # e.g. "spot/daily/aggTrades" or "api/v3/aggTrades"
    symbol: str
    date: str | None                 # YYYY-MM-DD for a daily file
    window: tuple[int, int] | None   # (start_ms, end_ms) for a REST window
    sha256: str

    def to_dict(self) -> dict:
        d = asdict(self)
        d["window"] = list(self.window) if self.window is not None else None
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "MarketDataRef":
        w = d.get("window")
        return cls(d["source"], d["dataset"], d["symbol"], d.get("date"), tuple(w) if w is not None else None, d["sha256"])


# Epoch milliseconds for 1973..5138 have 12-14 digits; microseconds for 2001..2286 have 16 digits.
_MS_MIN, _MS_MAX = 10**11, 10**14
_US_MIN, _US_MAX = 10**15, 10**17


def ts_unit(ts: int) -> str:
    if _MS_MIN <= ts < _MS_MAX:
        return "ms"
    if _US_MIN <= ts < _US_MAX:
        return "us"
    raise TimestampUnitError(f"timestamp {ts} is neither epoch milliseconds nor epoch microseconds")


def normalise_ts_to_ms(ts: int) -> int:
    """Epoch ms from ms or us input. Microseconds are floored, never rounded up: a print must not move later."""
    return ts if ts_unit(ts) == "ms" else ts // 1000


@dataclass(frozen=True, eq=False)
class AggTradeWindow:
    """Prints of one symbol, sorted by aggregate id (strictly increasing), timestamps non-decreasing, in ms."""

    symbol: str
    agg_id: np.ndarray
    price: np.ndarray
    qty: np.ndarray
    ts_ms: np.ndarray
    is_buyer_maker: np.ndarray
    refs: tuple[MarketDataRef, ...] = ()
    request_weight: int = 0          # REST request weight spent to build this window (0 for files)
    _cache: dict = field(default_factory=dict, repr=False, compare=False)

    @classmethod
    def from_arrays(cls, symbol: str, agg_id, price, qty, ts_ms, is_buyer_maker, refs: Sequence[MarketDataRef] = (), request_weight: int = 0) -> "AggTradeWindow":
        a = np.asarray(agg_id, dtype=np.int64)
        p = np.asarray(price, dtype=np.float64)
        q = np.asarray(qty, dtype=np.float64)
        t = np.asarray(ts_ms, dtype=np.int64)
        m = np.asarray(is_buyer_maker, dtype=bool)
        if not (len(a) == len(p) == len(q) == len(t) == len(m)):
            raise ValueError("aggTrade columns differ in length")
        if len(a) > 1:
            order = np.argsort(a, kind="stable")
            a, p, q, t, m = a[order], p[order], q[order], t[order], m[order]
            if np.any(np.diff(a) == 0):
                raise ValueError(f"{symbol}: duplicate aggregate trade id")
            if np.any(np.diff(t) < 0):
                raise ValueError(f"{symbol}: timestamp decreases while the aggregate id increases")
        if len(p) and (not np.all(np.isfinite(p)) or np.any(p <= 0) or not np.all(np.isfinite(q)) or np.any(q < 0)):
            raise ValueError(f"{symbol}: non-finite or non-positive price, or negative quantity")
        return cls(symbol, a, p, q, t, m, tuple(refs), request_weight)

    @classmethod
    def from_rows(cls, symbol: str, rows: Iterable[tuple], refs: Sequence[MarketDataRef] = (), request_weight: int = 0) -> "AggTradeWindow":
        rows = list(rows)
        cols = list(zip(*rows)) if rows else [[], [], [], [], []]
        return cls.from_arrays(symbol, *cols, refs=refs, request_weight=request_weight)

    def __len__(self) -> int:
        return int(len(self.agg_id))

    def row(self, i: int) -> AggTrade:
        return AggTrade(int(self.agg_id[i]), float(self.price[i]), float(self.qty[i]), int(self.ts_ms[i]), bool(self.is_buyer_maker[i]))

    def between(self, start_ms: int, end_ms: int) -> "AggTradeWindow":
        """Prints with start_ms <= ts < end_ms (half-open)."""
        lo = int(np.searchsorted(self.ts_ms, start_ms, side="left"))
        hi = int(np.searchsorted(self.ts_ms, end_ms, side="left"))
        return AggTradeWindow(self.symbol, self.agg_id[lo:hi], self.price[lo:hi], self.qty[lo:hi], self.ts_ms[lo:hi], self.is_buyer_maker[lo:hi], self.refs, self.request_weight)

    def side_index(self, buyer_initiated: bool) -> np.ndarray:
        """Positions of the prints on one aggressor side (cached). buyer_initiated=True -> is_buyer_maker == False."""
        key = "buy" if buyer_initiated else "sell"
        if key not in self._cache:
            self._cache[key] = np.flatnonzero(~self.is_buyer_maker if buyer_initiated else self.is_buyer_maker)
        return self._cache[key]
