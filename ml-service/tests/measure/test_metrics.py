"""Fill metrics. Values from hand fixture W (see test_benchmarks.py): a buy at 100.02 at t=2500, horizon 15 s.

    mid_t      = (100.02 + 100.00)/2 = 100.01
    mid_t+15s  = (100.05 + 100.03)/2 = 100.04
    effective  = +1 * (100.02 - 100.01)/100.01 * 1e4 =  0.99990001 bps
    realized   = +1 * (100.02 - 100.04)/100.01 * 1e4 = -1.99980002 bps
    impact     = +1 * (100.04 - 100.01)/100.01 * 1e4 =  2.99970003 bps
    effective  = realized + impact
"""
import pytest

from measure.metrics import (
    IdentityError, check_decomposition, effective_half_spread_bps, eq_ratio, price_impact_bps, realized_half_spread_bps)

EFF, REAL, IMP = 0.99990001, -1.99980002, 2.99970003


def test_effective_buy():
    assert effective_half_spread_bps(+1, 100.02, 100.01) == pytest.approx(EFF, abs=5e-9)


def test_effective_sell_mirror():
    # sell at 100.00 against mid 100.01: -1 * (100.00 - 100.01)/100.01 * 1e4 = +0.99990001 (same cost as the buy)
    assert effective_half_spread_bps(-1, 100.00, 100.01) == pytest.approx(EFF, abs=5e-9)


def test_effective_negative_is_price_improvement():
    # a maker buy filled at the bid 100.00 against mid 100.01 earns the half-spread: -0.99990001
    assert effective_half_spread_bps(+1, 100.00, 100.01) == pytest.approx(-EFF, abs=5e-9)


def test_realized_and_impact():
    assert realized_half_spread_bps(+1, 100.02, 100.01, 100.04) == pytest.approx(REAL, abs=5e-9)
    assert price_impact_bps(+1, 100.01, 100.04) == pytest.approx(IMP, abs=5e-9)


def test_decomposition_holds_on_hand_values():
    eff = effective_half_spread_bps(+1, 100.02, 100.01)
    real = realized_half_spread_bps(+1, 100.02, 100.01, 100.04)
    imp = price_impact_bps(+1, 100.01, 100.04)
    assert eff == pytest.approx(real + imp, abs=1e-9)
    check_decomposition(eff, real, imp)                           # does not raise


def test_decomposition_raises_when_a_term_is_wrong():
    with pytest.raises(IdentityError):
        check_decomposition(EFF, REAL, IMP + 1e-6)


def test_eq_ratio():
    # quoted spread 0.02 at mid 100.01 -> quoted half-spread = 0.01/100.01*1e4 = 0.99990001 bps -> E/Q = 1.0
    assert eq_ratio(effective_half_spread_bps(+1, 100.02, 100.01), 0.02, 100.01) == pytest.approx(1.0, abs=1e-9)
    # paying half of the quoted half-spread -> 0.5
    assert eq_ratio(effective_half_spread_bps(+1, 100.015, 100.01), 0.02, 100.01) == pytest.approx(0.5, abs=1e-9)
    assert eq_ratio(1.0, None, 100.01) is None
    assert eq_ratio(1.0, 0.0, 100.01) is None


@pytest.mark.parametrize("args", [(0, 100.0, 100.0), (2, 100.0, 100.0), (+1, 100.0, 0.0), (+1, -1.0, 100.0), (+1, float("nan"), 100.0), (+1, 100.0, float("inf"))])
def test_bad_inputs_rejected(args):
    with pytest.raises(ValueError):
        effective_half_spread_bps(*args)


def test_metrics_are_registered():
    from measure.registry import REGISTRY

    for mid in ("fill.effective_half_spread_bps", "fill.realized_half_spread_bps", "fill.price_impact_bps", "fill.eq_ratio"):
        assert mid in REGISTRY and REGISTRY[mid].version == "1.0.0"
