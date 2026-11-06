"""4a Q1: price path per fill from Binance public 1s klines. Offline: a 7-row checked-in fixture day slice.

Fixture bars (offset seconds from 2025-10-01 00:00:00 UTC = 1759276800), close prices:
  0:100.0  1:100.1  2:100.2  5:100.5  6:100.6  10:100.7  40:101.1      (seconds 3-4, 7-9, 11-39 absent)
Rule: price(t+h) = close of the latest 1s bar that has ENDED by floor(t+h) (no look-ahead), provided
floor(t+h) - bar_end <= STALENESS_CAP_S (5); else None. Never guessed.
"""
import hashlib
import io
import zipfile
from pathlib import Path

import pytest

from marketdata import binance_vision as bv
from marketdata.price_path import STALENESS_CAP_S, aggregate_minutes, post_prices

FIX = Path(__file__).parent / "fixtures" / "TESTUSDT-1s-2025-10-01.csv"
BASE = 1759276800


@pytest.fixture
def bars():
    return bv.parse_klines(FIX.read_text())


def test_parse_microsecond_timestamps_to_seconds(bars):
    assert sorted(bars) == [BASE + s for s in (0, 1, 2, 5, 6, 10, 40)]
    assert bars[BASE + 40] == (101.2, 100.9, 101.1)          # (high, low, close)


def test_parse_millisecond_timestamps_pre_2025():
    row = "1700000000000,1,2,0.5,1.5,1,1700000000999,1,1,1,1,0\n"   # 13 digits = ms
    assert bv.parse_klines(row) == {1700000000: (2.0, 0.5, 1.5)}


def test_staleness_cap_constant():
    assert STALENESS_CAP_S == 5


def test_post_prices_fill_at_0_5s(bars):
    # t=0.5: h1 -> target 1 -> bar0 (ended 1, age 0) 100.0 ; h5 -> target 5 -> bar2 (ended 3, age 2) 100.2
    # h30 -> target 30 -> bar10 ended 11, age 19 > 5 -> None ; h60 -> bar40 ended 41, age 19 -> None ; h300 -> None
    p = post_prices(bars, (BASE + 0.5) * 1000)
    assert p == {"1": 100.0, "5": 100.2, "30": None, "60": None, "300": None}


def test_post_prices_fill_at_9_5s(bars):
    # h1 -> T=10.5 target 10 -> bar6 (ended 7, age 3) 100.6 ; h5 -> target 14 -> bar10 ended 11, age 3 -> 100.7
    p = post_prices(bars, (BASE + 9.5) * 1000)
    assert p["1"] == 100.6 and p["5"] == 100.7 and p["30"] is None


def test_post_prices_fill_at_39_2s(bars):
    # h1 -> target 40 -> latest ended bar is bar10 (ended 11), age 29 -> None ; h5 -> target 44 -> bar40 ended 41, age 3
    p = post_prices(bars, (BASE + 39.2) * 1000)
    assert p["1"] is None and p["5"] == 101.1


def test_aggregate_minutes(bars):
    # minute 0: open is not kept; high = max(highs)=101.2, low = min(lows)=99.9, close = close of last bar (40) = 101.1
    m = aggregate_minutes(bars)
    assert m == {BASE: (101.2, 99.9, 101.1)}


def _zip(csv_text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("TESTUSDT-1s-2025-10-01.csv", csv_text)
    return buf.getvalue()


def test_url_pattern():
    assert bv.kline_url("BTCUSDT", "1s", "2025-10-01") == \
        "https://data.binance.vision/data/spot/daily/klines/BTCUSDT/1s/BTCUSDT-1s-2025-10-01.zip"


def test_fetch_day_verifies_checksum_and_caches(tmp_path):
    data = _zip(FIX.read_text())
    digest = hashlib.sha256(data).hexdigest()
    calls = []

    def opener(url):
        calls.append(url)
        return f"{digest}  TESTUSDT-1s-2025-10-01.zip\n".encode() if url.endswith(".CHECKSUM") else data

    b1 = bv.fetch_day("TESTUSDT", "2025-10-01", tmp_path, opener=opener)
    assert len(b1) == 7 and len(calls) == 2
    b2 = bv.fetch_day("TESTUSDT", "2025-10-01", tmp_path, opener=opener)    # cache hit: no more requests
    assert b2 == b1 and len(calls) == 2
    assert bv.cache_size_bytes(tmp_path) == len(data)


def test_fetch_day_rejects_bad_checksum(tmp_path):
    data = _zip(FIX.read_text())

    def opener(url):
        return (b"0" * 64 + b"  x.zip\n") if url.endswith(".CHECKSUM") else data

    with pytest.raises(bv.ChecksumError):
        bv.fetch_day("TESTUSDT", "2025-10-01", tmp_path, opener=opener)
    assert not list(tmp_path.rglob("*.zip"))           # a corrupt file is never cached
