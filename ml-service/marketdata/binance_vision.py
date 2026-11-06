"""Binance public data (data.binance.vision), SPOT daily klines. No API key. Network only via `fetch_day`;
tests inject `opener`. Facts (README github.com/binance/binance-public-data + verified on a real file 2025-10-01):
  * URL  https://data.binance.vision/data/spot/daily/klines/<SYM>/<INT>/<SYM>-<INT>-<YYYY-MM-DD>.zip
  * <url>.CHECKSUM holds `<sha256 hex>  <filename>`
  * CSV has NO header; columns: open_time, open, high, low, close, volume, close_time, quote_vol, trades,
    taker_buy_base, taker_buy_quote, ignore. Spot timestamps are MICROseconds from 2025-01-01, ms before.
  * The 1s file for BTCUSDT is ~2.5 MB zipped (aggTrades 6-65 MB), one row per second with trades (dense for
    BTCUSDT, 86400 rows; thinly traded pairs may skip seconds, handled by the staleness cap).
"""
from __future__ import annotations

import csv
import hashlib
import io
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://data.binance.vision/data/spot/daily/klines"


class ChecksumError(Exception):
    pass


def kline_url(symbol: str, interval: str, day: str) -> str:
    return f"{BASE}/{symbol}/{interval}/{symbol}-{interval}-{day}.zip"


def parse_klines(text: str) -> dict[int, tuple[float, float, float]]:
    """{open_time_seconds: (high, low, close)}; handles ms (<=13 digits) and µs (16 digits) timestamps."""
    out = {}
    for row in csv.reader(io.StringIO(text)):
        if len(row) < 5 or not row[0].isdigit():
            continue
        ts = int(row[0])
        sec = ts // 1_000_000 if len(row[0]) >= 16 else ts // 1000
        out[sec] = (float(row[2]), float(row[3]), float(row[4]))
    return out


def _urlopen(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "fillscore-tca/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def fetch_day(symbol: str, day: str, cache_dir, interval: str = "1s", opener=None) -> dict:
    """Bars for one UTC day (YYYY-MM-DD), from the local cache or downloaded and SHA-256 verified.
    A zip is cached only after its checksum matches."""
    opener = opener or _urlopen
    zpath = Path(cache_dir) / symbol / interval / f"{symbol}-{interval}-{day}.zip"
    if not zpath.exists():
        url = kline_url(symbol, interval, day)
        data = opener(url)
        expected = opener(url + ".CHECKSUM").decode().split()[0].lower()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ChecksumError(f"{symbol} {day}: sha256 mismatch")
        zpath.parent.mkdir(parents=True, exist_ok=True)
        zpath.write_bytes(data)
    with zipfile.ZipFile(zpath) as z:
        return parse_klines(z.read(z.namelist()[0]).decode())


def cache_size_bytes(cache_dir) -> int:
    p = Path(cache_dir)
    return sum(f.stat().st_size for f in p.rglob("*.zip")) if p.exists() else 0
