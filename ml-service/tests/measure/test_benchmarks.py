"""Benchmarks from aggressor-side prints: quote proxies, mid, quoted spread, interval VWAP, TWAP.

Hand fixture W (ts ms, price, is_buyer_maker). is_buyer_maker=True is a SELLER-initiated print (bid side);
False is a BUYER-initiated print (ask side):
    (1000, 100.00, T)  (2000, 100.02, F)  (2500, 100.10, F)  (16000, 100.03, T)  (16500, 100.05, F)
"""
import pytest

from measure.benchmarks import Quote, interval_vwap, quote_at, quoted_spread, twap
from measure.data.aggtrades import AggTradeWindow


def W():
    return AggTradeWindow.from_rows("X", [
        (1, 100.00, 1.0, 1000, True), (2, 100.02, 1.0, 2000, False), (3, 100.10, 1.0, 2500, False),
        (4, 100.03, 1.0, 16000, True), (5, 100.05, 1.0, 16500, False)])


def test_two_sided_mid():
    # prints before 2500: bid side 100.00 @1000 (age 1500), ask side 100.02 @2000 (age 500) -> mid (100.02+100.00)/2
    q = quote_at(W(), 2500)
    assert (q.ask, q.bid, q.quality) == (100.02, 100.00, "two_sided")
    assert q.mid == pytest.approx(100.01, abs=1e-12)
    assert (q.ask_age_ms, q.bid_age_ms) == (500, 1500)


def test_quote_excludes_print_at_t():
    # The 100.10 print is AT t=2500. A fill's own print can sit at its own millisecond, so it is never used.
    assert quote_at(W(), 2500).ask == 100.02
    assert quote_at(W(), 2501).ask == 100.10          # one ms later it is strictly before t


def test_stale_side_falls_back_to_last_trade():
    # t=7000: ask side 100.10 @2500 is 4500 ms old (fresh); bid side 100.00 @1000 is 6000 ms old (stale).
    # Not two-sided. Last print before t is 100.10, 4500 ms old -> last_trade.
    q = quote_at(W(), 7000)
    assert (q.quality, q.mid, q.ask, q.bid) == ("last_trade", 100.10, None, None)


def test_age_limit_is_inclusive_at_5000_ms():
    assert quote_at(W(), 7500).quality == "last_trade"           # last print exactly 5000 ms old: still fresh
    assert quote_at(W(), 7501).quality is None                   # 5001 ms: stale


def test_nothing_fresh_is_none():
    q = quote_at(W(), 15000)                                     # last print 12,500 ms old
    assert q == Quote(None, None, None, None, None, None)


def test_nothing_before_t_is_none():
    assert quote_at(W(), 1000).mid is None                       # the first print is at t, not before it
    assert quote_at(AggTradeWindow.from_rows("X", []), 5000).mid is None


def test_crossed_not_two_sided():
    # bid side 100.05 @1000, then ask side 100.00 @1200: ask < bid, so the older proxy is stale. Use the last print.
    w = AggTradeWindow.from_rows("X", [(1, 100.05, 1.0, 1000, True), (2, 100.00, 1.0, 1200, False)])
    q = quote_at(w, 1300)
    assert (q.quality, q.mid) == ("last_trade", 100.00)


def test_locked_is_two_sided():
    # ask == bid is allowed (both sides printed at one price); the quoted spread is then floored at one tick.
    w = AggTradeWindow.from_rows("X", [(1, 100.00, 1.0, 1000, True), (2, 100.00, 1.0, 1200, False)])
    q = quote_at(w, 1300)
    assert (q.quality, q.mid) == ("two_sided", 100.00)
    assert quoted_spread(q, 0.01) == 0.01


def test_mid_at_horizon():
    # t=17500: ask side 100.05 @16500, bid side 100.03 @16000 -> mid 100.04
    assert quote_at(W(), 17500).mid == pytest.approx(100.04, abs=1e-12)


def test_quoted_spread():
    assert quoted_spread(quote_at(W(), 2500), 0.01) == pytest.approx(0.02, abs=1e-12)     # 100.02 - 100.00
    assert quoted_spread(quote_at(W(), 7000), 0.01) is None                                # last_trade: no spread
    assert quoted_spread(quote_at(W(), 15000), 0.01) is None


def test_same_millisecond_uses_latest_id():
    # Two ask-side prints in one ms: the higher aggregate id is the later one.
    w = AggTradeWindow.from_rows("X", [(1, 99.0, 1.0, 1000, True), (2, 100.0, 1.0, 1000, False), (3, 101.0, 1.0, 1000, False)])
    assert quote_at(w, 1001).ask == 101.0


def test_interval_vwap():
    # [1000, 2600): prints 100.00, 100.02, 100.10, each qty 1 -> (100.00+100.02+100.10)/3 = 100.04
    assert interval_vwap(W(), 1000, 2600) == pytest.approx(100.04, abs=1e-12)
    # qty weights: 100 x 3 and 110 x 1 -> (300+110)/4 = 102.5
    w = AggTradeWindow.from_rows("X", [(1, 100.0, 3.0, 1000, True), (2, 110.0, 1.0, 1500, False)])
    assert interval_vwap(w, 1000, 2000) == 102.5
    assert interval_vwap(w, 1000, 1500) == 100.0                 # end is exclusive
    assert interval_vwap(w, 5000, 6000) is None


def test_twap():
    # samples at 1000, 2000, 3000 (end 4000 exclusive); last print at or before each: 100.00, 100.02, 100.10
    assert twap(W(), 1000, 4000, 1000) == pytest.approx((100.00 + 100.02 + 100.10) / 3, abs=1e-12)
    # samples at 0 and 500 have no earlier print and are skipped; sample at 1000 -> 100.00
    assert twap(W(), 0, 1500, 500) == 100.00
    assert twap(W(), 0, 900, 100) is None


def test_real_slice_spread_is_one_tick_mostly(btc_2024):
    # Audit 2026-11 (Q3) measured the BTCUSDT trade-sign spread at one tick at the median. Check it here on the
    # real slice: sample a quote every second; the median two-sided quoted spread is exactly one tick (0.01).
    import statistics

    spreads = []
    for t in range(1705327205000, 1705327320000, 1000):
        q = quote_at(btc_2024, t)
        if q.quality == "two_sided":
            spreads.append(round(quoted_spread(q, 0.01), 8))
    assert len(spreads) >= 100                                    # the 2-minute slice is dense
    assert statistics.median(spreads) == 0.01
