"""AggTradeWindow, timestamp units, the data.binance.vision loader and the price step.

Expected values for the real fixtures were read from the raw files with awk, independently of this code
(2026-11-11); they are also in tests/fixtures/market/SOURCE.md.
"""
import gzip
import hashlib
import io
import zipfile

import pytest

from measure.data import ticks, vision
from measure.data.aggtrades import AggTradeWindow, TimestampUnitError, normalise_ts_to_ms


# ---- timestamp units -------------------------------------------------------------------------------------------
def test_normalise_ms_kept():
    assert normalise_ts_to_ms(1705327200001) == 1705327200001          # 13 digits: already ms


def test_normalise_us_floored_to_ms():
    # 1741096800014630 us = 1741096800014.630 ms -> floor -> 1741096800014
    assert normalise_ts_to_ms(1741096800014630) == 1741096800014
    assert normalise_ts_to_ms(1741096800014999) == 1741096800014       # floor, never round up


@pytest.mark.parametrize("bad", [1705327200, 0, -5, 17053272000010000000])   # seconds, zero, negative, nanoseconds
def test_normalise_rejects_other_units(bad):
    with pytest.raises(TimestampUnitError):
        normalise_ts_to_ms(bad)


# ---- window invariants -----------------------------------------------------------------------------------------
def test_window_sorts_by_agg_id_and_rejects_duplicates():
    w = AggTradeWindow.from_rows("X", [(2, 10.0, 1.0, 1000, True), (1, 9.0, 1.0, 1000, False)])
    assert list(w.agg_id) == [1, 2] and list(w.price) == [9.0, 10.0]
    with pytest.raises(ValueError, match="duplicate"):
        AggTradeWindow.from_rows("X", [(1, 9.0, 1.0, 1000, False), (1, 9.0, 1.0, 1000, False)])


def test_window_rejects_time_going_backwards():
    with pytest.raises(ValueError, match="timestamp"):
        AggTradeWindow.from_rows("X", [(1, 9.0, 1.0, 2000, False), (2, 9.0, 1.0, 1000, False)])


def test_between_is_half_open():
    w = AggTradeWindow.from_rows("X", [(1, 9.0, 1.0, 1000, False), (2, 9.1, 1.0, 2000, True), (3, 9.2, 1.0, 3000, False)])
    sub = w.between(1000, 3000)                                        # [1000, 3000)
    assert list(sub.agg_id) == [1, 2]
    assert len(w.between(3001, 9000)) == 0


# ---- data.binance.vision ---------------------------------------------------------------------------------------
def test_vision_parses_columns(btc_2024):
    # First and last raw rows of the slice:
    # 2830845776,42852.55000000,0.00245000,3374054546,3374054546,1705327200001,False,True
    # 2830847875,42824.72000000,0.00253000,3374057167,3374057167,1705327319998,False,True
    assert len(btc_2024) == 2100
    assert (int(btc_2024.agg_id[0]), float(btc_2024.price[0]), float(btc_2024.qty[0]), int(btc_2024.ts_ms[0]), bool(btc_2024.is_buyer_maker[0])) == (
        2830845776, 42852.55, 0.00245, 1705327200001, False)
    assert (int(btc_2024.agg_id[-1]), float(btc_2024.price[-1]), int(btc_2024.ts_ms[-1])) == (2830847875, 42824.72, 1705327319998)
    assert int(btc_2024.is_buyer_maker.sum()) == 1047                  # seller-initiated prints (awk count)
    assert btc_2024.symbol == "BTCUSDT" and btc_2024.refs[0].sha256.startswith("4b4ee84e")


def test_vision_ids_consecutive_in_real_slices(btc_2024, bnb_2024, btc_2025):
    for w, n in ((btc_2024, 2100), (bnb_2024, 691), (btc_2025, 7407)):
        assert len(w) == n
        assert int(w.agg_id[-1]) - int(w.agg_id[0]) + 1 == n           # no gap, no duplicate


def test_vision_timestamp_units_detected(btc_2025):
    # Raw first/last rows carry microseconds: 1741096800014630 and 1741096919990096.
    assert int(btc_2025.ts_ms[0]) == 1741096800014
    assert int(btc_2025.ts_ms[-1]) == 1741096919990
    assert int(btc_2025.ts_ms.min()) >= 1741096800000 and int(btc_2025.ts_ms.max()) < 1741096920000   # inside the slice, in ms
    assert int(btc_2025.is_buyer_maker.sum()) == 3960


def test_vision_rejects_mixed_units_in_one_file():
    raw = b"1,10.0,1.0,1,1,1705327200001,True,True\n2,10.0,1.0,2,2,1741096800014630,False,True\n"
    with pytest.raises(TimestampUnitError, match="mixed"):
        vision.parse_csv(raw, "X", [])


def test_vision_skips_header_row():
    raw = b"agg_trade_id,price,quantity,first_trade_id,last_trade_id,transact_time,is_buyer_maker,is_best_match\n1,10.0,1.0,1,1,1705327200001,True,True\n"
    w = vision.parse_csv(raw, "X", [])
    assert len(w) == 1 and bool(w.is_buyer_maker[0]) is True


def _zip_bytes(name: str, body: bytes) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(name, body)
    return buf.getvalue()


def test_load_day_verifies_checksum_and_caches(tmp_path):
    body = b"1,10.0,1.0,1,1,1705276800002,True,True\n2,10.5,2.0,2,2,1705276800003,False,True\n"
    z = _zip_bytes("TESTUSDT-aggTrades-2024-01-15.csv", body)
    sha = hashlib.sha256(z).hexdigest()
    calls = []

    def opener(url):
        calls.append(url)
        return f"{sha}  TESTUSDT-aggTrades-2024-01-15.zip\n".encode() if url.endswith(".CHECKSUM") else z

    w = vision.load_day("TESTUSDT", "2024-01-15", tmp_path, opener=opener)
    assert len(w) == 2 and w.refs[0].sha256 == sha and w.refs[0].date == "2024-01-15"
    assert w.refs[0].source == "data.binance.vision" and w.refs[0].dataset == "spot/daily/aggTrades"
    assert calls[0] == "https://data.binance.vision/data/spot/daily/aggTrades/TESTUSDT/TESTUSDT-aggTrades-2024-01-15.zip"
    n = len(calls)
    w2 = vision.load_day("TESTUSDT", "2024-01-15", tmp_path, opener=opener)      # second load: from disk, no network
    assert len(calls) == n and w2.refs[0].sha256 == sha


def test_checksum_mismatch_raises_and_caches_nothing(tmp_path):
    z = _zip_bytes("TESTUSDT-aggTrades-2024-01-15.csv", b"1,10.0,1.0,1,1,1705276800002,True,True\n")

    def opener(url):
        return (b"0" * 64 + b"  x.zip\n") if url.endswith(".CHECKSUM") else z

    with pytest.raises(vision.ChecksumError):
        vision.load_day("TESTUSDT", "2024-01-15", tmp_path, opener=opener)
    assert not list(tmp_path.rglob("*.zip"))


@pytest.mark.parametrize("symbol,day", [("../etc", "2024-01-15"), ("BTCUSDT", "2024-1-15"), ("btcusdt", "2024-01-15"), ("BTCUSDT", "../../x")])
def test_load_day_rejects_unsafe_names(tmp_path, symbol, day):
    with pytest.raises(ValueError):
        vision.load_day(symbol, day, tmp_path, opener=lambda u: b"")


def test_read_gz_matches_parse(tmp_path):
    raw = b"1,10.0,1.0,1,1,1705276800002,True,True\n"
    p = tmp_path / "f.csv.gz"
    p.write_bytes(gzip.compress(raw))
    assert len(vision.read_gz(p, "X", [])) == 1


# ---- price step ------------------------------------------------------------------------------------------------
def test_tick_from_prints_hand():
    # distinct prices 100.00, 100.01, 100.03 -> gaps 0.01 and 0.02 -> smallest 0.01
    assert ticks.tick_from_prints([100.03, 100.00, 100.01, 100.01]) == 0.01
    assert ticks.tick_from_prints([100.0, 100.0]) is None                        # one distinct price: unknown
    assert ticks.tick_from_prints([]) is None


def test_tick_from_real_slices(btc_2024, bnb_2024, btc_2025):
    # Smallest gap between distinct printed prices, computed with awk on the raw files: 0.01, 0.1, 0.01.
    assert ticks.tick_from_prints(btc_2024.price) == 0.01
    assert ticks.tick_from_prints(bnb_2024.price) == 0.1
    assert ticks.tick_from_prints(btc_2025.price) == 0.01


def test_compare_exchange_info():
    assert ticks.compare_exchange_info("BNBUSDT", 0.1, 0.1) is None
    msg = ticks.compare_exchange_info("BNBUSDT", 0.1, 0.01)                       # the exchange filter changed since
    assert "BNBUSDT" in msg and "0.1" in msg and "0.01" in msg
    assert ticks.compare_exchange_info("BNBUSDT", None, 0.01) is None             # nothing observed, nothing to compare
