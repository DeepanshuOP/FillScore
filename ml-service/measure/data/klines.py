"""Public 1-minute klines: the hour before an order, for the expected-cost model of real accounts. No API key.

Facts (Binance spot API docs, rest-api.md "Kline/Candlestick data", read 2026-11-18,
https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md):
  * GET /api/v3/klines, request weight 2, `limit` default 500 and maximum 1000, `startTime`/`endTime` in ms (UTC).
  * Row: [open time, open, high, low, close, volume (base asset), close time, quote volume, number of trades, ...].
  * The IP limit is 6000 request weight per minute; the response header `x-mbx-used-weight-1m` states the weight used.
Measured 2026-11-18 (ETHBTC, ADAUSDT, last 1000 minutes): a minute without trades is still returned, with 0 trades, volume 0
and the previous close. A minute that is absent from the answer is treated the same way.

The context definition is the one of expected_cost.features (the model was calibrated with it): sigma = root of the sum of
squared 1-minute log returns of the closes over the `lookback` whole minutes before the minute holding t, in bps; volume =
the base quantity traded in those minutes; a minute counts as having prints when it has trades. A kline close is the price of
the last trade of its minute, so the context equals the one computed from aggregate trades (checked on a real hour, LOG §U).

Fetching is by whole UTC hours (60 klines, one request, weight 2), cached per symbol and hour once the hour has ended. A job
has a request budget; a 418/429 answer or a high used weight stops every further request of the job. Every failure is
`KlineUnavailable`: the caller says "not available", it never guesses.
"""
from __future__ import annotations

import hashlib
import json
import math
import threading
from collections import OrderedDict
from dataclasses import dataclass
from typing import Callable

import numpy as np

from .aggtrades import MarketDataRef
from .vision import check_names

# Public market-data host (design v5 step 0, 2026-11-23): Binance lists GET /api/v3/klines on data-api.binance.vision
# (https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, read 2026-11-23).
URL = "https://data-api.binance.vision/api/v3/klines"
SOURCE = "data-api.binance.vision"
DATASET = "api/v3/klines"
WEIGHT_PER_CALL = 2
WEIGHT_LIMIT_1M = 6000
BACKOFF_WEIGHT = int(WEIGHT_LIMIT_1M * 0.8)
MS_MIN = 60_000
MS_HOUR = 3_600_000
LOOKBACK_MIN = 60
MIN_BARS = 30


class KlineUnavailable(Exception):
    pass


class RateLimited(Exception):
    def __init__(self, retry_after: float | None = None):
        super().__init__("rate limited")
        self.retry_after = retry_after


def http_get_klines(params: dict) -> tuple[list[list], int | None]:
    import requests

    r = requests.get(URL, params=params, timeout=10)
    if r.status_code in (418, 429):
        ra = r.headers.get("Retry-After")
        raise RateLimited(float(ra) if ra and ra.isdigit() else None)
    r.raise_for_status()
    used = r.headers.get("x-mbx-used-weight-1m")
    return r.json(), (int(used) if used and used.isdigit() else None)


def rows_sha256(rows: list[list]) -> str:
    """SHA-256 of the canonical JSON of the rows exactly as returned. A third party who fetches the same finished hour
    gets the same hash."""
    return hashlib.sha256(json.dumps(rows, separators=(",", ":")).encode()).hexdigest()


@dataclass(frozen=True)
class KlineWindow:
    symbol: str
    open_ms: np.ndarray       # minute open times, ascending
    close: np.ndarray
    volume: np.ndarray        # base asset
    trades: np.ndarray
    refs: tuple[MarketDataRef, ...]

    @classmethod
    def from_rows(cls, symbol: str, rows: list[list], refs) -> "KlineWindow":
        rows = sorted(rows, key=lambda r: r[0])
        return cls(symbol, np.array([int(r[0]) for r in rows], dtype=np.int64), np.array([float(r[4]) for r in rows]),
                   np.array([float(r[5]) for r in rows]), np.array([int(r[8]) for r in rows], dtype=np.int64), tuple(refs))

    def __len__(self) -> int:
        return int(len(self.open_ms))


def hour_context_from_klines(w: KlineWindow, t_ms: int, lookback: int = LOOKBACK_MIN, min_bars: int = MIN_BARS) -> tuple[float, float] | None:
    """(sigma in bps, volume) of the `lookback` minutes before the minute holding t_ms, or None (insufficient data):
    fewer than `min_bars` of those minutes have trades, or no close exists at or before the reference minute."""
    if len(w) == 0:
        return None
    i = int(t_ms // MS_MIN)
    minutes = w.open_ms // MS_MIN
    first, last = i - lookback, i - 1
    ref_pos = int(np.searchsorted(minutes, first - 1, side="right")) - 1                 # last row at or before minute first - 1
    if ref_pos < 0:
        return None
    grid = np.arange(first, last + 1)
    pos = np.searchsorted(minutes, grid, side="right") - 1                               # close carried forward
    close = np.r_[w.close[ref_pos], w.close[pos]]
    present = np.zeros(len(grid), dtype=bool)
    exact = np.isin(grid, minutes)
    idx = np.searchsorted(minutes, grid)
    present[exact] = w.trades[idx[exact]] > 0
    if int(present.sum()) < min_bars:
        return None
    vol = np.zeros(len(grid))
    vol[exact] = w.volume[idx[exact]]
    if not (np.all(close > 0) and np.all(np.isfinite(close))):
        return None
    sigma = math.sqrt(float(np.sum(np.log(close[1:] / close[:-1]) ** 2))) * 1e4
    return sigma, float(vol.sum())


def _check_rows(rows, lo: int, hi: int) -> list[list]:
    if not isinstance(rows, list):
        raise KlineUnavailable("unexpected answer")
    last = None
    for r in rows:
        if not isinstance(r, list) or len(r) < 9 or not isinstance(r[0], int) or r[0] % MS_MIN != 0 or not (lo <= r[0] <= hi):
            raise KlineUnavailable("unexpected kline row")
        if last is not None and r[0] <= last:
            raise KlineUnavailable("klines are not strictly ascending")
        last = r[0]
    return rows


class KlineStore:
    """Whole-hour kline blocks, an in-memory LRU cache of finished hours, and the request budget of the running job.
    Thread-safe. Create one per process; call start_job() at the start of each measurement job."""

    def __init__(self, get_json: Callable[[dict], tuple[list, int | None]] = http_get_klines, max_requests: int = 40, max_blocks: int = 2000):
        self._get, self.max_requests, self.max_blocks = get_json, max_requests, max_blocks
        self._cache: OrderedDict[tuple[str, int], tuple[list, MarketDataRef]] = OrderedDict()
        self._lock = threading.Lock()
        self.start_job()

    def start_job(self) -> None:
        with self._lock:
            self.requests, self.weight, self.used_weight_1m, self.blocked = 0, 0, None, False

    def _block(self, symbol: str, hs: int, now_ms: int) -> tuple[list, MarketDataRef]:
        key = (symbol, hs)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        if self.blocked:
            raise KlineUnavailable("market data requests stopped for this job (rate limit)")
        if self.requests >= self.max_requests:
            raise KlineUnavailable("request budget of the job used")
        if self.used_weight_1m is not None and self.used_weight_1m >= BACKOFF_WEIGHT:
            raise KlineUnavailable("used request weight is high: backing off")
        he = hs + MS_HOUR
        self.requests += 1
        self.weight += WEIGHT_PER_CALL
        try:
            rows, used = self._get({"symbol": symbol, "interval": "1m", "startTime": hs, "endTime": he - 1, "limit": 60})
        except RateLimited:
            self.blocked = True
            raise KlineUnavailable("rate limited by the exchange") from None
        except Exception as e:
            raise KlineUnavailable(f"request failed: {type(e).__name__}") from None
        if used is not None:
            self.used_weight_1m = used
        rows = _check_rows(rows, hs, he - 1)
        ref = MarketDataRef(SOURCE, DATASET, symbol, None, (hs, he - 1), rows_sha256(rows))
        if he <= now_ms:                                   # an hour that has not ended is never cached
            self._cache[key] = (rows, ref)
            while len(self._cache) > self.max_blocks:
                self._cache.popitem(last=False)
        return rows, ref

    def window(self, symbol: str, start_ms: int, end_ms: int, now_ms: int) -> KlineWindow:
        """The klines of every whole UTC hour that overlaps [start_ms, end_ms]."""
        check_names(symbol, "2000-01-01")
        if end_ms < start_ms:
            raise ValueError("end_ms is before start_ms")
        rows: list[list] = []
        refs: list[MarketDataRef] = []
        with self._lock:
            hs = start_ms // MS_HOUR * MS_HOUR
            while hs <= end_ms:
                r, ref = self._block(symbol, hs, now_ms)
                rows.extend(r)
                refs.append(ref)
                hs += MS_HOUR
        return KlineWindow.from_rows(symbol, rows, refs)
