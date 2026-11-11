"""Fill simulation on real prints. Hand values from plan §3 (docs/superpowers/plans/2026-11-11-m2-real-demos.md).

Tape T (ts ms, price, qty, aggressor):
  (1000, 100.00, 1.0, sell) (2000, 100.02, 0.5, buy) (2500, 100.03, 0.4, buy) (3000, 99.99, 2.0, sell)
  (4000, 100.04, 1.0, buy) (6000, 99.98, 1.0, sell)
"""
import pytest

from demo_v2.simulate import simulate_limit, simulate_market
from measure.data.aggtrades import AggTradeWindow

T = AggTradeWindow.from_rows("X", [
    (1, 100.00, 1.0, 1000, True), (2, 100.02, 0.5, 2000, False), (3, 100.03, 0.4, 2500, False),
    (4, 99.99, 2.0, 3000, True), (5, 100.04, 1.0, 4000, False), (6, 99.98, 1.0, 6000, True)])


def test_taker_buy_walks_buyer_initiated_prints():
    o = simulate_market(T, "BUY", 1.0, 1500, horizon_ms=300_000)
    assert [(f.price, f.qty, f.ts_ms) for f in o.fills] == [(100.02, 0.5, 2000), (100.03, 0.4, 2500), (100.04, pytest.approx(0.1), 4000)]
    avg = sum(f.price * f.qty for f in o.fills) / sum(f.qty for f in o.fills)
    assert avg == pytest.approx(100.026, abs=1e-12)           # (50.01 + 40.012 + 10.004) / 1.0
    assert o.status == "FILLED" and o.updated_ms == 4000 and o.created_ms == 1500
    assert o.executed_qty == pytest.approx(1.0) and o.limit_price is None


def test_taker_sell_walks_seller_initiated_prints():
    o = simulate_market(T, "SELL", 2.5, 2600, horizon_ms=300_000)
    assert [(f.price, f.qty, f.ts_ms) for f in o.fills] == [(99.99, 2.0, 3000), (99.98, pytest.approx(0.5), 6000)]
    assert o.status == "FILLED"


def test_taker_larger_than_the_prints_is_left_partly_unfilled():
    # Only 1.9 buyer-initiated quantity exists in the horizon: no fill is invented for the rest.
    o = simulate_market(T, "BUY", 3.0, 1500, horizon_ms=300_000)
    assert o.executed_qty == pytest.approx(1.9)
    assert o.status == "CANCELED" and o.updated_ms == 1500 + 300_000


def test_maker_buy_fills_at_its_limit_when_a_print_trades_through():
    # limit = last sell print before 1500 = 100.00; first sell print below it after 1500 = 99.99 @3000 (qty 2.0)
    o = simulate_limit(T, "BUY", 1.5, 1500, ttl_ms=1_800_000)
    assert o.limit_price == 100.00
    assert [(f.price, f.qty, f.ts_ms) for f in o.fills] == [(100.00, 1.5, 3000)]
    assert o.status == "FILLED" and o.resting_ms == 1500


def test_maker_sell_fills_at_its_limit():
    # limit = last buy print before 2600 = 100.03; first buy print above it after 2600 = 100.04 @4000
    o = simulate_limit(T, "SELL", 1.0, 2600, ttl_ms=1_800_000)
    assert o.limit_price == 100.03
    assert [(f.price, f.qty, f.ts_ms) for f in o.fills] == [(100.03, 1.0, 4000)]


def test_maker_expires_unfilled():
    # limit 99.99 (sell print @3000); the 99.98 print @6000 comes after the TTL end (5500)
    o = simulate_limit(T, "BUY", 1.0, 4500, ttl_ms=1000)
    assert o.limit_price == 99.99 and o.fills == []
    assert o.status == "CANCELED" and o.executed_qty == 0 and o.updated_ms == 5500 and o.resting_ms is None


def test_touching_the_limit_is_not_a_fill():
    tape = AggTradeWindow.from_rows("X", [(1, 99.99, 1.0, 1000, True), (2, 99.99, 5.0, 2000, True)])
    o = simulate_limit(tape, "BUY", 1.0, 1500, ttl_ms=10_000)
    assert o.limit_price == 99.99 and o.fills == []


def test_maker_without_a_fresh_same_side_print_has_no_limit():
    # the last sell print before 20000 is @6000: 14 s old, older than the 5 s staleness limit
    assert simulate_limit(T, "BUY", 1.0, 20_000, ttl_ms=1000) is None


def test_maker_partial_fill_then_cancel():
    # buy 3.0 at 1500, limit 100.00: 99.99 @3000 gives 2.0, 99.98 @6000 would give 1.0, but with TTL 4000 the order
    # ends at 5500 -> 2.0 filled, cancelled at 5500. (With TTL 5000 it would end at 6500 and fill completely.)
    o = simulate_limit(T, "BUY", 3.0, 1500, ttl_ms=4000)
    assert o.executed_qty == pytest.approx(2.0) and o.status == "CANCELED" and o.updated_ms == 5500
    assert simulate_limit(T, "BUY", 3.0, 1500, ttl_ms=5000).status == "FILLED"
