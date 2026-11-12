"""Public spot trade archives of Bybit and OKX into AggTradeWindow, for the M2 demo rebuild. Binance uses
measure.data.vision.load_day. Network only through the loaders; tests inject `opener`.

Facts (checked on real files 2026-11-11, docs/research/LOG.md §J):
  * Bybit: https://public.bybit.com/spot/<SYM>/<SYM>_<YYYY-MM-DD>.csv.gz, header `id,timestamp,price,volume,side`,
    timestamps in ms, ids restart at 1 in each daily file, rows in id order. `side` is the aggressor side (tested on
    the data: 89-91% of prints consistent). No checksum is published: the ref carries OUR SHA-256 of the file.
  * OKX: https://www.okx.com/cdn/okex/traderecords/trades/daily/<YYYYMMDD>/<INST>-trades-<YYYY-MM-DD>.zip, header
    `instrument_name,trade_id,side,price,size,created_time` (ms). A file covers a UTC+8 day, so a UTC day needs two
    files. Sizes can be in scientific notation. `side` is the aggressor (86% consistent). No published checksum.
Each archive row is one trade, not an aggregate: a taker order that hits several makers prints several rows in one
millisecond; scoring_v2.calibrate.taker_events groups them.
"""
from __future__ import annotations

import hashlib
import io
import re
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Callable, Sequence

import numpy as np
import pandas as pd

from measure.data.aggtrades import AggTradeWindow, MarketDataRef, TimestampUnitError, ts_unit

BYBIT_BASE = "https://public.bybit.com/spot"
OKX_BASE = "https://www.okx.com/cdn/okex/traderecords/trades/daily"
_SYM = re.compile(r"^[A-Z0-9]{2,20}$")
_INST = re.compile(r"^[A-Z0-9]{2,12}-[A-Z0-9]{2,12}$")
_DAY = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
DAY_MS = 86_400_000


def _check(pattern: re.Pattern, name: str, day: str) -> None:
    if not pattern.match(name or "") or not _DAY.match(day or ""):
        raise ValueError(f"unsafe symbol or date: {name!r} {day!r}")


def _side_to_buyer_maker(side: pd.Series, venue: str) -> np.ndarray:
    s = side.astype(str).str.strip().str.lower()
    if not s.isin(["buy", "sell"]).all():
        raise ValueError(f"{venue}: side column has values other than buy/sell")
    return (s == "sell").to_numpy()            # aggressor = seller -> the buyer was the maker


def _ms_column(ts: pd.Series, venue: str) -> np.ndarray:
    if ts.dtype.kind != "i":
        raise TimestampUnitError(f"{venue}: timestamps are not integer milliseconds")
    a = ts.to_numpy(np.int64)
    if len(a) and {ts_unit(int(a.min())), ts_unit(int(a.max()))} != {"ms"}:
        raise TimestampUnitError(f"{venue}: timestamps are not epoch milliseconds")
    return a


def _opener(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "market-data-client/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def _cached(path: Path | None, url: str, opener: Callable[[str], bytes]) -> bytes:
    if path is not None and path.exists():
        return path.read_bytes()
    data = opener(url)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    return data


# ---------------------------------------------------------------- Bybit

def bybit_url(symbol: str, day: str) -> str:
    _check(_SYM, symbol, day)
    return f"{BYBIT_BASE}/{symbol}/{symbol}_{day}.csv.gz"


def parse_bybit_csv(raw: bytes, symbol: str, day: str, refs: Sequence[MarketDataRef]) -> AggTradeWindow:
    """Ids restart in each daily file, so the window id is (days since 1970-01-01) x 10^9 + id: unique and increasing
    across days."""
    df = pd.read_csv(io.BytesIO(raw))
    if list(df.columns) != ["id", "timestamp", "price", "volume", "side"]:
        raise ValueError(f"bybit {symbol} {day}: unexpected columns {list(df.columns)}")
    day_index = (date.fromisoformat(day) - date(1970, 1, 1)).days
    ids = df["id"].to_numpy(np.int64)
    if len(ids) and (ids.min() < 0 or ids.max() >= 10**9):
        raise ValueError(f"bybit {symbol} {day}: trade id outside 0..10^9")
    return AggTradeWindow.from_arrays(symbol, day_index * 10**9 + ids, df["price"].to_numpy(float), df["volume"].to_numpy(float),
                                      _ms_column(df["timestamp"], "bybit"), _side_to_buyer_maker(df["side"], "bybit"), refs)


def load_bybit_day(symbol: str, day: str, cache_dir, opener: Callable[[str], bytes] | None = None) -> AggTradeWindow:
    url = bybit_url(symbol, day)
    path = Path(cache_dir) / "bybit" / symbol / f"{symbol}_{day}.csv.gz" if cache_dir is not None else None
    data = _cached(path, url, opener or _opener)
    ref = MarketDataRef("public.bybit.com", "spot/daily trades (no published checksum; sha256 is ours)", symbol, day, None,
                        hashlib.sha256(data).hexdigest())
    import gzip
    return parse_bybit_csv(gzip.decompress(data), symbol, day, [ref])


# ---------------------------------------------------------------- OKX

def okx_url(inst: str, day: str) -> str:
    _check(_INST, inst, day)
    return f"{OKX_BASE}/{day.replace('-', '')}/{inst}-trades-{day}.zip"


def parse_okx_zip(data: bytes, inst: str, refs: Sequence[MarketDataRef]) -> AggTradeWindow:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        raw = z.read(z.namelist()[0])
    df = pd.read_csv(io.BytesIO(raw), dtype={"instrument_name": str, "side": str})
    if list(df.columns) != ["instrument_name", "trade_id", "side", "price", "size", "created_time"]:
        raise ValueError(f"okx {inst}: unexpected columns {list(df.columns)}")
    if len(df) and not (df["instrument_name"] == inst).all():
        raise ValueError(f"okx {inst}: the file holds another instrument")
    return AggTradeWindow.from_arrays(inst, df["trade_id"].to_numpy(np.int64), df["price"].to_numpy(float),
                                      df["size"].astype(float).to_numpy(), _ms_column(df["created_time"], "okx"),
                                      _side_to_buyer_maker(df["side"], "okx"), refs)


def load_okx_utc_day(inst: str, day: str, cache_dir, opener: Callable[[str], bytes] | None = None) -> AggTradeWindow:
    """All trades of one UTC day: file `day` (its last 16 h are the UTC day's first 16 h) and file `day + 1`."""
    next_day = (date.fromisoformat(day) + timedelta(days=1)).isoformat()
    start = int(datetime.fromisoformat(day).replace(tzinfo=timezone.utc).timestamp() * 1000)
    parts, refs = [], []
    for d in (day, next_day):
        url = okx_url(inst, d)
        path = Path(cache_dir) / "okx" / inst / f"{inst}-trades-{d}.zip" if cache_dir is not None else None
        data = _cached(path, url, opener or _opener)
        ref = MarketDataRef("www.okx.com", "cdn trade records, daily UTC+8 (no published checksum; sha256 is ours)",
                            inst, d, None, hashlib.sha256(data).hexdigest())
        parts.append(parse_okx_zip(data, inst, [ref]))
        refs.append(ref)
    cols = [np.concatenate([getattr(p, c) for p in parts]) for c in ("agg_id", "price", "qty", "ts_ms", "is_buyer_maker")]
    keep = (cols[3] >= start) & (cols[3] < start + DAY_MS)
    return AggTradeWindow.from_arrays(inst, *(c[keep] for c in cols), refs=refs)
