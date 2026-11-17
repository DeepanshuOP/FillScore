"""expected_for_order: the expectedCost field of one order, hand-computed from a small calibration.

Calibration fixture: TESTUSDT s/2 = 5.0 bps, Y = 0.12, calibrated participation range [1, 50] bps,
interval half-width q = 2.0 in bucket lt1k and none in bucket 1k-10k.
Order: MARKET, notional 500 (bucket lt1k), quantity 1, context sigma 100 bps, volume 100:
  x = sigma sqrt(Q / V) = 100 * sqrt(1 / 100) = 10;  expected = 5.0 + 0.12 * 10 = 6.2;  interval = 6.2 -/+ 2.0 = [4.2, 8.2]."""
import pytest

from expected_cost.model import Calibration, expected_for_order

CAL = Calibration({"id": "ec1.0.0", "alpha": 0.1,
                   "symbols": {"TESTUSDT": {"halfSpreadBps": 5.0, "y": 0.12, "featureRange": [1.0, 50.0],
                                            "buckets": {"lt1k": {"q": 2.0}, "1k-10k": {"q": None}, "10k-100k": {"q": 3.0}, "ge100k": {"q": None}}}}},
                  sha256="abc123")


def _go(**over):
    a = dict(symbol="TESTUSDT", order_type="MARKET", notional=500.0, quantity=1.0, context=(100.0, 100.0))
    a.update(over)
    return expected_for_order(CAL, **a)


def test_a_market_order_gets_expected_cost_and_interval():
    r = _go()
    assert r["applies"] is True and r["reason"] is None
    assert r["expectedBps"] == pytest.approx(6.2)
    assert (r["lowBps"], r["highBps"]) == (pytest.approx(4.2), pytest.approx(8.2))
    assert r["bucket"] == "lt1k" and r["level"] == 0.9
    assert r["version"] == "ec1.0.0" and r["calibrationSha256"] == "abc123"
    assert r["context"] == {"sigmaBps": 100.0, "volume": 100.0}


def test_a_limit_order_is_outside_the_model():
    r = _go(order_type="LIMIT")
    assert r["applies"] is False and r["expectedBps"] is None and "taker" in r["reason"]


def test_an_unknown_order_type_is_not_assumed_to_be_a_market_order():
    r = _go(order_type=None)
    assert r["applies"] is False and r["expectedBps"] is None
    assert "unknown" in r["reason"] and "resting" not in r["reason"]        # review finding 5: never say "resting" when we do not know


def test_no_context_is_insufficient_data_not_a_guess():
    r = _go(context=None)
    assert r["applies"] is True and r["expectedBps"] is None and "hour before" in r["reason"]


def test_a_symbol_that_was_not_calibrated():
    r = _go(symbol="XYZUSDT")
    assert r["expectedBps"] is None and "not calibrated" in r["reason"]


def test_participation_outside_the_calibrated_range_is_not_extrapolated():
    r = _go(quantity=100.0)          # x = 100 * sqrt(100 / 100) = 100 > 50
    assert r["expectedBps"] is None and "range" in r["reason"]
    assert _go(context=(100.0, 1e9))["expectedBps"] is None      # x = 100 * sqrt(1 / 1e9) = 0.0032 < 1: below the range too


def test_a_bucket_without_an_interval_gives_the_expected_cost_and_says_why():
    r = _go(notional=5000.0)         # bucket 1k-10k: q is None
    assert r["expectedBps"] == pytest.approx(6.2) and r["lowBps"] is None and r["highBps"] is None
    assert "interval" in r["reason"]
