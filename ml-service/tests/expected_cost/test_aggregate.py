"""cost_vs_expected: what an account paid on its market orders against what taker events of the same size cost.

Hand-computed fixture (two orders):
  order 1: intended notional 1,000, paid 4.0 bps, expected 3.0 bps
  order 2: intended notional 3,000, paid 2.0 bps, expected 3.0 bps
  paid     = (4.0 * 1000 + 2.0 * 3000) / 4000 = (4000 + 6000) / 4000 = 2.5 bps
  expected = (3.0 * 1000 + 3.0 * 3000) / 4000 = 3.0 bps
  excess   = 2.5 - 3.0 = -0.5 bps
  paid USD = 4.0 * 1000 / 1e4 + 2.0 * 3000 / 1e4 = 0.4 + 0.6 = 1.0;  expected USD = 0.3 + 0.9 = 1.2"""
import pytest

from expected_cost.aggregate import cost_vs_expected


def _row(paid, exp, notional, applies=True):
    return {"shortfall": {"executionBps": paid, "intendedNotional": notional},
            "expectedCost": {"applies": applies, "expectedBps": exp, "version": "ec1.0.0", "calibrationSha256": "abc"}}


def test_the_point_values_are_hand_computed():
    r = cost_vs_expected([_row(4.0, 3.0, 1000), _row(2.0, 3.0, 3000)], min_orders=2)
    assert r["n"] == 2
    assert r["paidBps"] == pytest.approx(2.5) and r["expectedBps"] == pytest.approx(3.0) and r["excessBps"] == pytest.approx(-0.5)
    assert r["paidUsd"] == pytest.approx(1.0) and r["expectedUsd"] == pytest.approx(1.2)
    assert r["level"] == 0.9 and r["version"] == "ec1.0.0"


def test_when_every_order_has_the_same_excess_the_interval_is_that_excess():
    r = cost_vs_expected([_row(4.0, 3.0, 1000), _row(5.0, 4.0, 3000), _row(2.5, 1.5, 500)], min_orders=3)
    assert r["lowBps"] == pytest.approx(1.0) and r["highBps"] == pytest.approx(1.0)


def test_the_interval_is_deterministic_and_contains_the_point_value():
    rows = [_row(p, 3.0, 1000 + 100 * i) for i, p in enumerate([1.0, 2.0, 6.0, 4.0, 3.5, 2.5, 5.0, 0.5])]
    a, b = cost_vs_expected(rows, min_orders=8), cost_vs_expected(rows, min_orders=8)
    assert a == b
    assert a["lowBps"] <= a["excessBps"] <= a["highBps"] and a["lowBps"] < a["highBps"]


def test_too_few_orders_is_insufficient_data():
    r = cost_vs_expected([_row(4.0, 3.0, 1000), _row(2.0, 3.0, 3000)], min_orders=20)
    assert r["insufficient"] is True and "20" in r["reason"] and r["n"] == 2 and "excessBps" not in r


def test_orders_the_model_does_not_cover_are_counted_not_used():
    rows = [_row(4.0, 3.0, 1000), _row(2.0, 3.0, 3000), _row(9.0, None, 1000), _row(9.0, None, 1000, applies=False)]
    r = cost_vs_expected(rows, min_orders=2)
    assert r["n"] == 2 and r["excluded"] == {"outsideModel": 1, "noExpectedCost": 1, "partlyFilled": 0}


def test_a_partly_filled_market_order_is_counted_apart_not_averaged_in():
    """Review finding 6: executionBps divides by the intended notional, which includes the unfilled part, so a partly filled
    order would read cheaper than the per-fill cost the benchmark describes. Such orders are left out and counted."""
    part = _row(9.0, 3.0, 1000)
    part["shortfall"]["fillRatio"] = 0.5
    full = _row(4.0, 3.0, 1000)
    full["shortfall"]["fillRatio"] = 1.0
    r = cost_vs_expected([full, _row(2.0, 3.0, 3000), part], min_orders=2)
    assert r["n"] == 2 and r["excluded"] == {"outsideModel": 0, "noExpectedCost": 0, "partlyFilled": 1}
    assert r["paidBps"] == pytest.approx(2.5)                               # the partly filled 9.0 bps order is not in it


def test_no_expected_cost_at_all_is_insufficient_data():
    assert cost_vs_expected([{"shortfall": {"executionBps": 1.0, "intendedNotional": 10}}], min_orders=1)["insufficient"] is True
