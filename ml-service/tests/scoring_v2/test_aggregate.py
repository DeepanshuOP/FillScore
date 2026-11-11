"""C3 aggregation and C4 bootstrap intervals.

Hand values (M1 plan C3):
  * two fills, notionals 100 and 300, spread scores 100 and 60 -> (100x100 + 300x60)/400 = 70
  * composite of (slippage 80, fees 50, timing 60, spread 70) -> 0.35x80 + 0.25x50 + 0.25x60 + 0.15x70
    = 28 + 12.5 + 15 + 10.5 = 66.0 -> C (60 <= 66 < 75)
"""
import pytest

from scoring_v2.aggregate import MIN_FILLS, band_letter, composite, weighted_mean, score_account
from scoring_v2.bootstrap import bootstrap_ci


def test_weighted_mean_hand_case():
    assert weighted_mean([(100.0, 100.0), (60.0, 300.0)]) == pytest.approx(70.0, abs=1e-12)


def test_weighted_mean_skips_unmeasured_and_empty_is_none():
    assert weighted_mean([(None, 100.0), (60.0, 300.0)]) == pytest.approx(60.0)
    assert weighted_mean([(None, 100.0)]) is None
    assert weighted_mean([]) is None


def test_composite_hand_case():
    assert composite({"slippage": 80, "fees": 50, "timing": 60, "spread": 70}) == pytest.approx(66.0, abs=1e-12)


def test_composite_is_none_when_a_component_is_missing():
    assert composite({"slippage": None, "fees": 50, "timing": 60, "spread": 70}) is None


@pytest.mark.parametrize("s,g", [(95, "A"), (90, "A"), (89.99, "B"), (75, "B"), (66.0, "C"), (60, "C"), (40, "D"), (39.9, "F")])
def test_bands_as_v1(s, g):
    assert band_letter(s) == g


def _units(n, scores=(80, 50, 60, 70)):
    """n orders of one fill each, notional 100, with fixed component scores."""
    return [{"orderId": str(i), "notional": 100.0,
             "slippage": scores[0], "fills": [{"notional": 100.0, "fees": scores[1], "timing": scores[2], "spread": scores[3]}]}
            for i in range(n)]


def test_letter_needs_20_measured_fills_in_every_component():
    assert MIN_FILLS == 20
    r = score_account(_units(20))
    assert r["composite"] == pytest.approx(66.0) and r["grade"] == "C" and r["reason"] is None
    small = score_account(_units(19))
    assert small["grade"] is None
    assert small["reason"] == "fewer than 20 measured fills"
    assert small["composite"] == pytest.approx(66.0)
    assert small["band"] == [pytest.approx(66.0), pytest.approx(66.0)]   # identical units: zero-width interval


def test_unmeasured_component_makes_composite_none_and_says_so():
    u = _units(25)
    for o in u:
        o["slippage"] = None
    r = score_account(u)
    assert r["components"]["slippage"]["score"] is None
    assert r["components"]["slippage"]["reason"] == "insufficient data"
    assert r["components"]["slippage"]["unmeasured"] == 25
    assert r["composite"] is None and r["grade"] is None


def test_counts_per_component():
    u = _units(21)
    u[0]["fills"][0]["spread"] = None
    r = score_account(u)
    assert r["components"]["spread"]["measured"] == 20 and r["components"]["spread"]["unmeasured"] == 1
    assert r["grade"] == "C"


# --- C4 bootstrap -------------------------------------------------------------------------------------------

def _mean(units):
    return sum(units) / len(units)


def test_bootstrap_deterministic():
    data = [float(i) for i in range(40)]
    assert bootstrap_ci(data, _mean) == bootstrap_ci(data, _mean)


def test_bootstrap_identical_units_zero_width():
    assert bootstrap_ci([5.0] * 30, _mean) == (5.0, 5.0)


def test_bootstrap_contains_point_estimate():
    data = [float((i * 37) % 41) for i in range(40)]
    lo, hi = bootstrap_ci(data, _mean)
    assert lo <= _mean(data) <= hi
    assert lo < hi


def test_bootstrap_one_unit_is_none():
    assert bootstrap_ci([1.0], _mean) is None


def test_bootstrap_statistic_none_draws_are_skipped():
    # A statistic that is undefined on some resamples (None) is computed on the rest.
    data = [1.0, 2.0, 3.0]
    lo, hi = bootstrap_ci(data, lambda u: None if len(set(u)) == 1 else _mean(u))
    assert 1.0 <= lo <= hi <= 3.0
