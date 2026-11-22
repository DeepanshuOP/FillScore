"""Prints for the receipt: a capped window of real public prints per demo order, cut offline from the checksummed daily files.

Hand-computed fixture. One symbol-day, ten prints (agg id, ts ms, price, qty, is_buyer_maker):
  id  ts      price  qty  bm
  1   99_000  10.0   1    0
  2   100_000 10.1   2    0      <- arrival 105_000 - 5_000 = 100_000: the window's start is included
  3   103_000 10.2   1    1
  4   105_000 10.3   1    0
  5   106_000 10.4   3    1
  6   108_000 10.5   1    0
  7   110_000 10.6   1    1      <- last fill 105_500 + 5_000 = 110_500 ends the window: id 7 (110_000) is in, id 8 is out
  8   111_000 10.7   1    0
  9   120_000 10.8   1    0
  10  130_000 10.9   1    1
Order: arrival 105_000, fills at 105_000 and 105_500 -> window [100_000, 110_500] holds ids 2,3,4,5,6,7 (6 prints).
With cap 60 nothing is dropped. With cap 4: distance to the fill interval [105_000, 105_500] (0 inside):
  id2 5_000, id3 2_000, id4 0, id5 500, id6 2_500, id7 4_500 -> nearest four: id4 (0), id5 (500), id3 (2_000), id6 (2_500);
  kept ids sorted: 3,4,5,6; total in window 6; truncated True.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from measure.data.aggtrades import AggTradeWindow, MarketDataRef
from scripts.cut_demo_prints import CAP, PAD_MS, backend_ts_text, cut_demo, select_prints

ID = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
TS = [99_000, 100_000, 103_000, 105_000, 106_000, 108_000, 110_000, 111_000, 120_000, 130_000]
PX = [10.0, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9]
QTY = [1, 2, 1, 1, 3, 1, 1, 1, 1, 1]
BM = [0, 0, 1, 0, 1, 0, 1, 0, 0, 1]


def arrays():
    return (np.array(ID), np.array(TS), np.array(PX), np.array(QTY, dtype=float), np.array(BM, dtype=bool))


def test_the_window_is_five_seconds_before_arrival_to_five_seconds_after_the_last_fill():
    assert PAD_MS == 5_000 and CAP == 60
    w = select_prints(*arrays(), arrival_ms=105_000, first_fill_ms=105_000, last_fill_ms=105_500)
    assert (w["fromMs"], w["toMs"]) == (100_000, 110_500)
    assert [r[0] for r in w["prints"]] == [2, 3, 4, 5, 6, 7]
    assert w["total"] == 6 and w["truncated"] is False
    # a row is [agg id, ts ms, price, qty, is_buyer_maker as 0/1]
    assert w["prints"][0] == [2, 100_000, 10.1, 2.0, 0]
    assert w["prints"][1] == [3, 103_000, 10.2, 1.0, 1]


def test_over_the_cap_the_prints_nearest_the_fills_are_kept_in_id_order():
    w = select_prints(*arrays(), arrival_ms=105_000, first_fill_ms=105_000, last_fill_ms=105_500, cap=4)
    assert [r[0] for r in w["prints"]] == [3, 4, 5, 6]
    assert w["total"] == 6 and w["truncated"] is True


def test_an_empty_window_is_empty_not_invented():
    w = select_prints(*arrays(), arrival_ms=500_000, first_fill_ms=500_000, last_fill_ms=500_100)
    assert w["prints"] == [] and w["total"] == 0 and w["truncated"] is False


def _write_demo(tmp_path: Path):
    d = tmp_path / "demo-x"
    d.mkdir()
    (d / "orders.json").write_text(json.dumps([
        {"orderId": "o-fill", "symbol": "TESTUSDT", "status": "FILLED"},
        {"orderId": "o-cancel", "symbol": "TESTUSDT", "status": "CANCELED"},
        {"orderId": "o-nomeasure", "symbol": "TESTUSDT", "status": "FILLED"},
    ]))
    (d / "trades.json").write_text(json.dumps([
        {"orderId": "o-fill", "symbol": "TESTUSDT", "executedAt": "1970-01-01T00:01:45.000Z"},   # 105_000 ms
        {"orderId": "o-fill", "symbol": "TESTUSDT", "executedAt": "1970-01-01T00:01:45.500Z"},   # 105_500 ms
        {"orderId": "o-nomeasure", "symbol": "TESTUSDT", "executedAt": "1970-01-01T00:01:45.000Z"},
    ]))
    (d / "order_measurements.json").write_text(json.dumps([
        {"orderId": "o-fill", "symbol": "TESTUSDT", "arrivalMs": 105_000},
        {"orderId": "o-cancel", "symbol": "TESTUSDT", "arrivalMs": 105_000},
        {"orderId": "o-nomeasure", "symbol": "TESTUSDT", "arrivalMs": None},
    ]))
    return d


def test_cut_demo_keeps_filled_measured_orders_only_and_records_the_source_file_hash(tmp_path):
    sha = hashlib.sha256(b"fake daily file").hexdigest()
    ref = MarketDataRef("data.binance.vision", "spot/daily/aggTrades", "TESTUSDT", "1970-01-01", None, sha)
    day = AggTradeWindow.from_arrays("TESTUSDT", *arrays()[:1], arrays()[2], arrays()[3], arrays()[1], arrays()[4], refs=[ref])
    calls = []

    def load_day(symbol, d):
        calls.append((symbol, d))
        return day

    out = cut_demo(_write_demo(tmp_path), {("TESTUSDT", "1970-01-01"): sha}, load_day)
    assert list(out["windows"]) == ["o-fill"]
    w = out["windows"]["o-fill"]
    assert [r[0] for r in w["prints"]] == [2, 3, 4, 5, 6, 7]
    assert w["files"] == [{"symbol": "TESTUSDT", "date": "1970-01-01", "sha256": sha}]
    assert w["arrivalMs"] == 105_000 and w["fills"] == [105_000, 105_500]
    assert out["skipped"] == {"no_fill": 1, "no_arrival": 1}
    assert calls == [("TESTUSDT", "1970-01-01")]


def test_a_daily_file_whose_hash_is_not_the_committed_one_stops_the_cut(tmp_path):
    wrong = hashlib.sha256(b"another file").hexdigest()
    ref = MarketDataRef("data.binance.vision", "spot/daily/aggTrades", "TESTUSDT", "1970-01-01", None, wrong)
    day = AggTradeWindow.from_arrays("TESTUSDT", *arrays()[:1], arrays()[2], arrays()[3], arrays()[1], arrays()[4], refs=[ref])
    with pytest.raises(ValueError, match="sha256"):
        cut_demo(_write_demo(tmp_path), {("TESTUSDT", "1970-01-01"): hashlib.sha256(b"fake daily file").hexdigest()},
                 lambda s, d: day)


def test_an_order_id_repeated_across_symbols_stops_the_cut(tmp_path):
    d = _write_demo(tmp_path)
    (d / "orders.json").write_text(json.dumps([
        {"orderId": "dup", "symbol": "AAAUSDT", "status": "FILLED"}, {"orderId": "dup", "symbol": "BBBUSDT", "status": "FILLED"}]))
    with pytest.raises(ValueError, match="repeat"):
        cut_demo(d, {}, lambda s, day: None)


def test_the_backend_copy_is_one_json_string_per_demo_with_quotes_and_backslashes_escaped(tmp_path):
    for demo, text in (("demo-b", '{"k":"it\'s a \\ test"}'), ("demo-a", '{"k":1}')):
        (tmp_path / demo).mkdir()
        (tmp_path / demo / "prints.json").write_text(text)
    (tmp_path / "grades_v2.json").write_text("{}")                 # not a demo folder: ignored
    ts = backend_ts_text(tmp_path)
    assert "export const DEMO_PRINTS_JSON: Record<string, string> = {" in ts
    assert "    'demo-a': '{\"k\":1}',\n" in ts
    # demos in sorted order; ' and \ escaped so the literal parses back to the file's text
    assert ts.index("'demo-a'") < ts.index("'demo-b'")
    assert "it\\'s a \\\\ test" in ts


# ---- against the real daily files (only where the offline cache exists) -----------------------------------------
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache" / "market" / "zips"
OUT = ROOT / "demo_v2" / "out"


@pytest.mark.skipif(not CACHE.exists() or not (OUT / "demo-moderate" / "prints.json").exists(),
                    reason="needs the offline daily-file cache and the committed prints (local only)")
def test_two_real_windows_equal_the_rows_of_the_checksummed_daily_files():
    from measure.data import vision
    manifest = json.loads((OUT / "manifest.json").read_text())
    published = {(t["symbol"], t["day"]): t["sha256"] for t in manifest["tapes"]}
    committed = json.loads((OUT / "demo-moderate" / "prints.json").read_text())["windows"]
    for order_id in sorted(committed)[:2] + sorted(committed)[-1:]:
        w = committed[order_id]
        rows = []
        for f in w["files"]:
            assert f["sha256"] == published[(f["symbol"], f["date"])]       # the file the refs name
            day = vision.load_day(f["symbol"], f["date"], CACHE)
            assert day.refs[0].sha256 == f["sha256"]                         # and the cached file is that file
            m = (day.ts_ms >= w["fromMs"]) & (day.ts_ms <= w["toMs"])
            rows += [[int(a), int(t), float(p), float(q), int(b)] for a, t, p, q, b in
                     zip(day.agg_id[m], day.ts_ms[m], day.price[m], day.qty[m], day.is_buyer_maker[m])]
        assert w["total"] == len(rows)
        kept = {r[0] for r in w["prints"]}
        assert kept <= {r[0] for r in rows}
        assert [r for r in rows if r[0] in kept] == w["prints"]              # row for row, in id order
        if not w["truncated"]:
            assert len(w["prints"]) == len(rows)
        assert len(w["prints"]) <= 60
