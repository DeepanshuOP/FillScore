"""data.binance.vision spot daily aggTrades. No API key. Network only through `load_day`; tests inject `opener`.

Facts (github.com/binance/binance-public-data, and three real files verified 2026-11-11):
  * URL  https://data.binance.vision/data/spot/daily/aggTrades/<SYM>/<SYM>-aggTrades-<YYYY-MM-DD>.zip
  * <url>.CHECKSUM holds `<sha256 hex>  <filename>`
  * CSV, no header, 8 columns: aggregate trade id, price, quantity, first trade id, last trade id, timestamp,
    is-buyer-maker, best-match. Timestamps are ms before 2025-01-01 and microseconds from that date.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import re
import urllib.request
import zipfile
from pathlib import Path
from typing import Callable, Sequence

import pandas as pd

from .aggtrades import AggTradeWindow, MarketDataRef, TimestampUnitError, ts_unit

BASE = "https://data.binance.vision/data/spot/daily/aggTrades"
SOURCE = "data.binance.vision"
DATASET = "spot/daily/aggTrades"
_SYMBOL_RE = re.compile(r"^[A-Z0-9]{2,20}$")
_DATE_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
_COLS = ["agg_id", "price", "qty", "first_id", "last_id", "ts", "is_buyer_maker", "best_match"]


class ChecksumError(Exception):
    pass


def check_names(symbol: str, day: str) -> None:
    """Symbols and dates become URL and path segments, so only strict shapes are accepted."""
    if not _SYMBOL_RE.match(symbol or ""):
        raise ValueError(f"unsafe symbol: {symbol!r}")
    if not _DATE_RE.match(day or ""):
        raise ValueError(f"unsafe date: {day!r}")


def day_url(symbol: str, day: str) -> str:
    check_names(symbol, day)
    return f"{BASE}/{symbol}/{symbol}-aggTrades-{day}.zip"


def parse_csv(raw: bytes, symbol: str, refs: Sequence[MarketDataRef]) -> AggTradeWindow:
    """Parse one aggTrades CSV. The timestamp unit is detected per file; a file that mixes units is refused."""
    if not raw.strip():
        return AggTradeWindow.from_rows(symbol, [], refs)
    first = raw.lstrip()[:1]
    has_header = not first.isdigit()                 # some exports carry a header row
    df = pd.read_csv(io.BytesIO(raw), header=None, names=_COLS, skiprows=1 if has_header else 0,
                     dtype={"agg_id": "int64", "price": "float64", "qty": "float64", "ts": "int64"}, usecols=[0, 1, 2, 5, 6])
    ts = df["ts"].to_numpy()
    units = {ts_unit(int(ts.min())), ts_unit(int(ts.max()))}
    if len(units) != 1:
        raise TimestampUnitError(f"{symbol}: mixed timestamp units in one file")
    if units == {"us"}:
        ts = ts // 1000                              # floor to ms (see aggtrades.normalise_ts_to_ms)
    m = df["is_buyer_maker"]
    if m.dtype != bool:
        m = m.astype(str).str.strip().str.lower().map({"true": True, "false": False})
        if m.isna().any():
            raise ValueError(f"{symbol}: is-buyer-maker column is not boolean")
    return AggTradeWindow.from_arrays(symbol, df["agg_id"].to_numpy(), df["price"].to_numpy(), df["qty"].to_numpy(), ts, m.to_numpy(dtype=bool), refs)


def read_gz(path: Path, symbol: str, refs: Sequence[MarketDataRef]) -> AggTradeWindow:
    return parse_csv(gzip.decompress(Path(path).read_bytes()), symbol, refs)


def _urlopen(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "market-data-client/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def load_day(symbol: str, day: str, cache_dir, opener: Callable[[str], bytes] | None = None) -> AggTradeWindow:
    """All prints of one UTC day. The zip is downloaded, checked against its published SHA-256, and only then
    cached on disk. The returned window's ref carries that SHA-256."""
    url = day_url(symbol, day)                       # validates the names
    opener = opener or _urlopen
    zpath = Path(cache_dir) / symbol / f"{symbol}-aggTrades-{day}.zip"
    if zpath.exists():
        data = zpath.read_bytes()
    else:
        data = opener(url)
        expected = opener(url + ".CHECKSUM").decode().split()[0].lower()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ChecksumError(f"{symbol} {day}: sha256 mismatch")
        zpath.parent.mkdir(parents=True, exist_ok=True)
        zpath.write_bytes(data)
    sha = hashlib.sha256(data).hexdigest()
    ref = MarketDataRef(SOURCE, DATASET, symbol, day, None, sha)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return parse_csv(z.read(z.namelist()[0]), symbol, [ref])
