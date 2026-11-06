"""4a Q3: Corwin-Schultz (2012) and Abdi-Ranaldo (2017) from 1-minute (high, low, close) bars.
Neither paper has a numeric worked example (checked by docs-researcher), so the cases are hand-computed."""
import math

import pytest

from agents.metrics.spread_estimators import (
    abdi_ranaldo_pair, conservative_spread_bps, corwin_schultz_pair, estimate_spread_window,
)


def test_cs_identical_ranges_hand_computed():
    # two bars, H=101, L=100 each. x = ln(1.01). beta = 2x^2, gamma = x^2 (same two-bar range).
    # sqrt(beta)=x*sqrt2, sqrt(2beta)=2x. k=3-2sqrt2=0.171573.
    # alpha = x(2-sqrt2)/k - x/sqrt(k) = 3.414214x - 2.414214x = x.  S = 2(e^x-1)/(1+e^x) = 2*0.01/2.01
    s = corwin_schultz_pair((101.0, 100.0, 100.5), (101.0, 100.0, 100.5))
    assert s == pytest.approx(0.02 / 2.01, rel=1e-9)          # 0.00995025


def test_cs_negative_estimate_is_set_to_zero():
    # bar2 jumps 10%: gamma huge -> alpha ~ -0.22 -> S < 0 -> reported as 0 (Corwin-Schultz section 2.3)
    assert corwin_schultz_pair((101.0, 100.0, 100.5), (111.0, 110.0, 110.5)) == 0.0


def test_ar_constant_spread_hand_computed():
    # both bars H=100.5 L=99.5 C=100.5 (closes at the ask). eta equal in both bars, c - eta = (h-l)/2 = d.
    # s^2 = 4*d*d -> s = 2d = ln(100.5/99.5) = 0.0100001
    s = abdi_ranaldo_pair((100.5, 99.5, 100.5), (100.5, 99.5, 100.5))
    assert s == pytest.approx(0.0100001, abs=2e-6)
    assert s == pytest.approx(math.log(100.5 / 99.5), rel=1e-12)


def test_ar_negative_product_is_set_to_zero():
    # bar1 close 100.5 is above eta1 (~99.995) but also ABOVE eta2? eta2 = ln sqrt(102*100) ~ 100.995: c-eta2 < 0.
    assert abdi_ranaldo_pair((101.0, 99.0, 100.5), (102.0, 100.0, 101.0)) == 0.0


def _flat_bars(n, start=0, h=101.0, l=100.0, c=100.5):
    return {start + 60 * i: (h, l, c) for i in range(n)}


def test_window_averages_overlapping_pairs_and_converts_to_bps():
    bars = _flat_bars(12)                                     # 11 identical pairs, each S = 0.00995025
    e = estimate_spread_window(bars, centre_s=60 * 6, half_window_min=30, min_pairs=10)
    assert e["n_pairs"] == 11
    assert e["cs_bps"] == pytest.approx(0.02 / 2.01 * 1e4, rel=1e-9)     # 99.5025
    assert e["ar_bps"] is not None


def test_window_needs_enough_consecutive_pairs():
    assert estimate_spread_window(_flat_bars(5), 120, 30, min_pairs=10) == {
        "cs_bps": None, "ar_bps": None, "n_pairs": 4, "conservative_bps": None, "half_spread_bps": None}


def test_missing_minute_breaks_the_pair():
    bars = _flat_bars(12)
    del bars[60 * 5]                                         # pairs (4,5) and (5,6) vanish: 11 - 2 = 9
    assert estimate_spread_window(bars, 60 * 6, 30, min_pairs=1)["n_pairs"] == 9


def test_conservative_is_the_smaller_and_none_if_either_missing():
    assert conservative_spread_bps(12.0, 8.0) == 8.0
    assert conservative_spread_bps(None, 8.0) is None
    assert conservative_spread_bps(12.0, None) is None
