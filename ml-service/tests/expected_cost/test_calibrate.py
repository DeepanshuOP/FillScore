"""Calibration of the expected-cost model on held-out days, hand-computed.

Day split (a fixed rule, never by hand): day of month d goes to (d - 1) % 4: 0 or 1 -> fit, 2 -> calibration, 3 -> test.
  days 1..8 -> fit [1, 2, 5, 6], calibration [3, 7], test [4, 8].

Fit fixture (one symbol, every event in bucket lt1k, notional 500): participation term x = sigma sqrt(Q/V) = 100 * sqrt(0.01) = 10
for two events and 100 * sqrt(0.04) = 20 for two events.
  eff = [2, 4] at x = 10 and [6, 12] at x = 20
  s/2 = median of the lt1k events = median(2, 4, 6, 12) = (4 + 6) / 2 = 5
  r = eff - s/2 = [-3, -1] and [1, 7]
  Y = sum(x r) / sum(x^2) = (10 (-3 - 1) + 20 (1 + 7)) / (2 * 100 + 2 * 400) = (-40 + 160) / 1000 = 0.12
  prediction at x = 10: 5 + 0.12 * 10 = 6.2; at x = 20: 5 + 0.12 * 20 = 7.4
Calibration fixture (x = 10, prediction 6.2): eff = [7.2, 4.2, 6.7, 6.2] -> scores [1.0, 2.0, 0.5, 0.0]
  alpha 0.2, n = 4: k = ceil(5 * 0.8) = 4 -> the 4th smallest score = 2.0
Test fixture (x = 10): eff = [6.2, 8.2, 3.0, 7.0] -> |eff - 6.2| = [0, 2.0, 3.2, 0.8]; inside q = 2.0: 3 of 4 -> coverage 0.75."""
import numpy as np
import pytest

from expected_cost.calibrate import calibrate_symbol, split_days
from expected_cost.features import Events


def _ev(eff, x_sigma, x_qty_over_v, notional=500.0):
    n = len(eff)
    sigma = np.full(n, 100.0)
    vol = np.full(n, 100.0)
    qty = vol * np.asarray(x_qty_over_v)
    return Events(np.asarray(eff, float), np.full(n, notional), qty, sigma, vol, np.arange(n))


def test_the_day_split_rule():
    days = [f"2024-01-{d:02d}" for d in range(1, 9)]
    s = split_days(days)
    assert s["fit"] == ["2024-01-01", "2024-01-02", "2024-01-05", "2024-01-06"]
    assert s["calibration"] == ["2024-01-03", "2024-01-07"]
    assert s["test"] == ["2024-01-04", "2024-01-08"]


def _fit_events():
    a, b = _ev([2, 4], 100, [0.01, 0.01]), _ev([6, 12], 100, [0.04, 0.04])
    return Events(*(np.r_[getattr(a, f), getattr(b, f)] for f in Events.__dataclass_fields__))


def test_fit_calibrate_and_test_coverage_hand_computed():
    cal = calibrate_symbol(_fit_events(), _ev([7.2, 4.2, 6.7, 6.2], 100, [0.01] * 4), _ev([6.2, 8.2, 3.0, 7.0], 100, [0.01] * 4),
                           alpha=0.2, min_sample=3)
    assert cal["halfSpreadBps"] == pytest.approx(5.0)
    assert cal["y"] == pytest.approx(0.12)
    b = cal["buckets"]["lt1k"]
    assert b["nCalibration"] == 4 and b["q"] == pytest.approx(2.0)
    assert b["nTest"] == 4 and b["coverage"] == pytest.approx(0.75)


def test_a_bucket_with_too_few_calibration_events_has_no_interval():
    cal = calibrate_symbol(_fit_events(), _ev([7.2, 4.2], 100, [0.01] * 2), _ev([6.2, 8.2], 100, [0.01] * 2), alpha=0.2, min_sample=3)
    b = cal["buckets"]["lt1k"]
    assert b["q"] is None and b["nCalibration"] == 2          # "insufficient data", never an invented width


def test_the_calibrated_range_is_the_range_of_the_fit_features():
    cal = calibrate_symbol(_fit_events(), _ev([7.2, 4.2, 6.7], 100, [0.01] * 3), _ev([6.2], 100, [0.01]), alpha=0.2, min_sample=3,
                           range_pct=(0.0, 100.0))
    assert cal["featureRange"] == [10.0, 20.0]


def test_a_symbol_with_no_small_events_is_not_calibrated():
    big = _ev([2, 4, 6], 100, [0.01] * 3, notional=50_000.0)    # no event under 1,000: the half-spread is not measurable
    with pytest.raises(ValueError):
        calibrate_symbol(big, big, big, alpha=0.2, min_sample=1)
