"""measure_fill: one fill -> its measurement record, on the hand window W and on real slices.

Hand fixture W (ts ms, price, is_buyer_maker; True = seller-initiated = bid side):
    (1000, 100.00, T)  (2000, 100.02, F)  (2500, 100.10, F)  (16000, 100.03, T)  (16500, 100.05, F)
Pretend fill: buy 1.0 at 100.02, t = 2500.
  t        : ask 100.02 @2000, bid 100.00 @1000 -> mid 100.01, two-sided (the 100.10 print AT t is excluded)
  t + 1 s  : t'=3500: ask 100.10 @2500 (age 1000), bid 100.00 @1000 (age 2500) -> mid 100.05
  t + 15 s : t'=17500: ask 100.05 @16500, bid 100.03 @16000 -> mid 100.04
  t + 60 s : t'=62500: last print @16500 is 46000 ms old -> None
  t + 300 s: None
  effective  = (100.02 - 100.01)/100.01 x 1e4 =  0.99990001
  realized_1 = (100.02 - 100.05)/100.01 x 1e4 = -2.99970003 ; impact_1  = (100.05 - 100.01)/100.01 x 1e4 = 3.99960004
  realized_15= (100.02 - 100.04)/100.01 x 1e4 = -1.99980002 ; impact_15 = (100.04 - 100.01)/100.01 x 1e4 = 2.99970003
  quoted spread = 100.02 - 100.00 = 0.02 -> quoted half = 0.01/100.01 x 1e4 = 0.99990001 -> E/Q = 1.0
"""
import pytest

from measure.data.aggtrades import AggTradeWindow
from measure.data.ticks import tick_from_prints
from measure.enrich_fill import FillInput, measure_fill
from measure.metrics import IdentityError, check_decomposition

from .conftest import BNB_2024, BTC_2024


def W():
    return AggTradeWindow.from_rows("X", [
        (1, 100.00, 1.0, 1000, True), (2, 100.02, 1.0, 2000, False), (3, 100.10, 1.0, 2500, False),
        (4, 100.03, 1.0, 16000, True), (5, 100.05, 1.0, 16500, False)])


def test_measure_fill_hand_window():
    m = measure_fill(FillInput("t1", "X", 1, 100.02, 1.0, 2500), W(), tick=0.01)
    assert m["version"] == "1.0.0"
    assert m["tradeId"] == "t1"
    assert m["quoteQuality"] == "two_sided"
    assert m["mid"] == pytest.approx(100.01, abs=1e-12)
    assert m["effHalfBps"] == pytest.approx(0.99990001, abs=1e-8)
    assert m["eq"] == pytest.approx(1.0, abs=1e-12)
    assert m["realized"]["1"] == pytest.approx(-2.99970003, abs=1e-8)
    assert m["impact"]["1"] == pytest.approx(3.99960004, abs=1e-8)
    assert m["realized"]["15"] == pytest.approx(-1.99980002, abs=1e-8)
    assert m["impact"]["15"] == pytest.approx(2.99970003, abs=1e-8)
    assert m["realized"]["60"] is None and m["impact"]["60"] is None
    assert m["realized"]["300"] is None and m["impact"]["300"] is None
    assert m["tickSize"] == 0.01
    assert m["marketDataRefs"] == []


def test_measure_fill_sell_mirror():
    # Sell 1.0 at 100.00, t=2500, mid 100.01: effective = -1 x (100.00 - 100.01)/100.01 x 1e4 = 0.99990001.
    # +15 s mid 100.04: realized = -1 x (100.00 - 100.04)/100.01 x 1e4 = 3.99960004; impact = -2.99970003.
    m = measure_fill(FillInput("t2", "X", -1, 100.00, 1.0, 2500), W(), tick=0.01)
    assert m["effHalfBps"] == pytest.approx(0.99990001, abs=1e-8)
    assert m["realized"]["15"] == pytest.approx(3.99960004, abs=1e-8)
    assert m["impact"]["15"] == pytest.approx(-2.99970003, abs=1e-8)


def test_no_fresh_print_gives_unmeasured_record():
    # t = 15000: last print @2500 is 12500 ms old -> no mid. Every spread metric is None, nothing is imputed.
    m = measure_fill(FillInput("t3", "X", 1, 100.02, 1.0, 15000), W(), tick=0.01)
    assert m["mid"] is None and m["quoteQuality"] is None
    assert m["effHalfBps"] is None and m["eq"] is None
    assert all(v is None for v in m["realized"].values())
    assert all(v is None for v in m["impact"].values())
    assert m["unmeasuredReason"] == "no fresh print within 5000 ms before the fill"


def test_last_trade_quality_has_no_eq():
    # t = 7000: only the ask side is fresh -> last_trade, mid 100.10. Effective is measured; E/Q needs two sides.
    m = measure_fill(FillInput("t4", "X", 1, 100.12, 1.0, 7000), W(), tick=0.01)
    assert m["quoteQuality"] == "last_trade"
    assert m["effHalfBps"] == pytest.approx((100.12 - 100.10) / 100.10 * 1e4, abs=1e-9)
    assert m["eq"] is None


@pytest.mark.parametrize("bad", [
    dict(side=0), dict(price=0.0), dict(price=float("nan")), dict(qty=0.0), dict(symbol="Y"),
    dict(ts_ms=1705327260000000),   # microseconds: a fill time must be epoch ms
])
def test_invalid_input_rejected(bad):
    args = dict(trade_id="t", symbol="X", side=1, price=100.02, qty=1.0, ts_ms=2500)
    args.update(bad)
    if "ts_ms" in bad:
        w = AggTradeWindow.from_rows("X", [(1, 100.0, 1.0, 1705327259000, True)])
    else:
        w = W()
    with pytest.raises(ValueError):
        measure_fill(FillInput(**args), w, tick=0.01)


def test_non_positive_tick_rejected():
    with pytest.raises(ValueError):
        measure_fill(FillInput("t", "X", 1, 100.02, 1.0, 2500), W(), tick=0.0)


def test_measure_fill_real_btc_slice(btc_2024):
    # Pretend buy = the first buyer-initiated print at or after 14:01:00: aggregate id 2830846703, price 42864.25,
    # t = 1705327260000 (raw rows read with awk, see docs/PROGRESS.md). Strictly before t:
    #   ask proxy 42864.25 (id 2830846701, ts ...259998), bid proxy 42864.24 (id 2830846700, ts ...259998)
    #   mid = 42864.245; effective = 0.005/42864.245 x 1e4 = 0.0011665 bps (half a tick)
    #   +1 s : ask 42864.25 @...260966, bid 42864.24 @...260934 -> mid 42864.245
    #   +15 s: ask 42841.38 @...274620, bid 42841.37 @...273741 -> mid 42841.375
    #   +60 s: ask 42824.72 @...319998, bid 42824.71 @...319996 -> mid 42824.715
    #   +300 s: beyond the 2-minute slice -> None
    i = int((btc_2024.agg_id == 2830846703).nonzero()[0][0])
    row = btc_2024.row(i)
    assert (row.price, row.ts_ms, row.is_buyer_maker) == (42864.25, 1705327260000, False)
    tick = tick_from_prints(btc_2024.price)
    m = measure_fill(FillInput("real-btc", "BTCUSDT", 1, row.price, 0.00148, row.ts_ms), btc_2024, tick=tick)

    mid = 42864.245
    assert m["quoteQuality"] == "two_sided"
    assert m["tickSize"] == 0.01
    assert m["mid"] == pytest.approx(mid, abs=1e-9)
    assert m["effHalfBps"] == pytest.approx(0.005 / mid * 1e4, rel=1e-6)
    assert 0 <= m["effHalfBps"] <= 0.01 / mid * 1e4           # at most one tick
    assert m["eq"] == pytest.approx(1.0, rel=1e-6)            # quoted spread = one tick, paid half of it
    mids = {"1": 42864.245, "15": 42841.375, "60": 42824.715}
    for h, mh in mids.items():
        assert m["realized"][h] == pytest.approx((42864.25 - mh) / mid * 1e4, rel=1e-6, abs=1e-9)
        assert m["impact"][h] == pytest.approx((mh - mid) / mid * 1e4, rel=1e-6, abs=1e-9)
        check_decomposition(m["effHalfBps"], m["realized"][h], m["impact"][h])
    assert m["realized"]["300"] is None
    assert m["marketDataRefs"][0]["sha256"] == BTC_2024[2]
    assert m["marketDataRefs"][0]["date"] == "2024-01-15"
    assert m["quoteAgesMs"] == {"ask": 2, "bid": 2}


def test_measure_fill_bnb_tick(bnb_2024):
    # Pretend buy = first buyer-initiated print at or after 14:01:00: id 518231524, 318.90, t = 1705327260232.
    #   ask 318.90 @...259898 (age 334), bid 318.80 @...259399 (age 833) -> mid 318.85
    #   effective = 0.05/318.85 x 1e4 = 1.5681354869 bps (half of the 0.1 tick)
    #   +1 s (t'=...261232): ask 318.90 @...261188, bid 318.80 @...261180 -> mid 318.85 -> impact_1 = 0
    tick = tick_from_prints(bnb_2024.price)
    m = measure_fill(FillInput("real-bnb", "BNBUSDT", 1, 318.90, 0.104, 1705327260232), bnb_2024, tick=tick)
    assert m["tickSize"] == 0.1
    assert m["mid"] == pytest.approx(318.85, abs=1e-9)
    assert m["effHalfBps"] == pytest.approx(0.05 / 318.85 * 1e4, rel=1e-9)
    assert m["eq"] == pytest.approx(1.0, rel=1e-9)
    assert m["impact"]["1"] == pytest.approx(0.0, abs=1e-9)
    assert m["quoteAgesMs"] == {"ask": 334, "bid": 833}
    assert m["marketDataRefs"][0]["sha256"] == BNB_2024[2]


def test_identity_is_checked(monkeypatch):
    # A broken impact function must be caught by the runtime identity, not stored.
    import measure.enrich_fill as ef
    monkeypatch.setattr(ef, "price_impact_bps", lambda side, a, b: 999.0)
    with pytest.raises(IdentityError):
        measure_fill(FillInput("t1", "X", 1, 100.02, 1.0, 2500), W(), tick=0.01)
