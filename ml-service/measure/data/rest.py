"""Public REST aggTrades window. No API key.

Facts (Binance spot API docs, rest-api.md, "Compressed/Aggregate trades list", read 2026-11-11,
https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md):
  * GET /api/v3/aggTrades, request weight 4, `limit` default 500 and maximum 1000.
  * `fromId` is INCLUSIVE; `startTime`/`endTime` are in ms and INCLUSIVE.
  * Response fields: a (aggregate id), p (price), q (quantity), f, l, T (timestamp, ms unless the
    X-MBX-TIME-UNIT header asks for microseconds; we never send it), m (was the buyer the maker), M.
Paging: the first page is selected by time; later pages by `fromId = last id + 1`, never by both.
"""
from __future__ import annotations

import hashlib
import json
from typing import Callable

from .aggtrades import AggTradeWindow, MarketDataRef
from .vision import check_names

URL = "https://api.binance.com/api/v3/aggTrades"
SOURCE = "api.binance.com"
DATASET = "api/v3/aggTrades"
WEIGHT_PER_CALL = 4
PAGE_LIMIT = 1000


class DataGapError(Exception):
    pass


class WindowTooLargeError(Exception):
    pass


def http_get_json(params: dict) -> list[dict]:
    import requests

    r = requests.get(URL, params=params, timeout=10)
    r.raise_for_status()
    return r.json()


def rows_sha256(rows: list[dict]) -> str:
    """SHA-256 of the canonical JSON of the rows as returned (ids, the original price and quantity strings,
    timestamp, maker flag). A third party who fetches the same window gets the same hash."""
    canon = [[r["a"], r["p"], r["q"], r["T"], bool(r["m"])] for r in rows]
    return hashlib.sha256(json.dumps(canon, separators=(",", ":")).encode()).hexdigest()


def fetch_window(symbol: str, start_ms: int, end_ms: int, get_json: Callable[[dict], list[dict]] = http_get_json, max_pages: int = 50) -> AggTradeWindow:
    """Every aggregate trade with start_ms <= T <= end_ms. Raises DataGapError if the ids are not consecutive
    and WindowTooLargeError if the window needs more than `max_pages` requests."""
    check_names(symbol, "2000-01-01")
    if end_ms < start_ms:
        raise ValueError("end_ms is before start_ms")
    rows: list[dict] = []
    calls = 0
    page = get_json({"symbol": symbol, "startTime": start_ms, "endTime": end_ms, "limit": PAGE_LIMIT})
    calls += 1
    rows.extend(page)
    while len(page) == PAGE_LIMIT and page[-1]["T"] <= end_ms:
        if calls >= max_pages:
            raise WindowTooLargeError(f"{symbol}: window {start_ms}-{end_ms} needs more than {max_pages} requests")
        page = get_json({"symbol": symbol, "fromId": rows[-1]["a"] + 1, "limit": PAGE_LIMIT})
        calls += 1
        rows.extend(r for r in page if r["T"] <= end_ms)
    for prev, cur in zip(rows, rows[1:]):
        if cur["a"] != prev["a"] + 1:
            raise DataGapError(f"{symbol}: aggregate trade id {prev['a'] + 1} is missing between {prev['a']} and {cur['a']}")
    ref = MarketDataRef(SOURCE, DATASET, symbol, None, (start_ms, end_ms), rows_sha256(rows))
    return AggTradeWindow.from_rows(
        symbol, [(r["a"], float(r["p"]), float(r["q"]), int(r["T"]), bool(r["m"])) for r in rows], [ref], request_weight=calls * WEIGHT_PER_CALL)
