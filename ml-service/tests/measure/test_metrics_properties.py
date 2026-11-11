"""Property tests: the decomposition identity and the buy/sell symmetry hold for any valid prices."""
import pytest
from hypothesis import given, settings, strategies as st

from measure.metrics import (
    IdentityError, check_decomposition, effective_half_spread_bps, price_impact_bps, realized_half_spread_bps)

price = st.floats(min_value=1e-6, max_value=1e7, allow_nan=False, allow_infinity=False)
side = st.sampled_from([+1, -1])


@settings(max_examples=300, deadline=None)
@given(side, price, price, price)
def test_effective_equals_realized_plus_impact(d, fill, mid_t, mid_th):
    eff = effective_half_spread_bps(d, fill, mid_t)
    real = realized_half_spread_bps(d, fill, mid_t, mid_th)
    imp = price_impact_bps(d, mid_t, mid_th)
    # The tolerance scales with the largest term: when fill and the later mid differ by orders of magnitude,
    # realized and impact are huge and cancel, and float error is relative to them, not to their small sum.
    assert abs(eff - (real + imp)) <= 1e-9 * max(1.0, abs(eff), abs(real), abs(imp))
    check_decomposition(eff, real, imp)


@settings(max_examples=300, deadline=None)
@given(price, st.floats(min_value=0.0, max_value=0.5), st.floats(min_value=-0.5, max_value=0.5))
def test_buy_sell_symmetry(mid, off, drift):
    # A buy `off` above the mid and a sell `off` below it cost the same. Mirror the later mid around mid too.
    buy_fill, sell_fill = mid * (1 + off), mid * (1 - off)
    up, down = mid * (1 + drift), mid * (1 - drift)
    assert effective_half_spread_bps(+1, buy_fill, mid) == pytest.approx(effective_half_spread_bps(-1, sell_fill, mid), rel=1e-9, abs=1e-6)
    assert price_impact_bps(+1, mid, up) == pytest.approx(price_impact_bps(-1, mid, down), rel=1e-9, abs=1e-6)
    assert realized_half_spread_bps(+1, buy_fill, mid, up) == pytest.approx(realized_half_spread_bps(-1, sell_fill, mid, down), rel=1e-9, abs=1e-6)


@settings(max_examples=100, deadline=None)
@given(side, price, price, price)
def test_perturbed_term_is_caught(d, fill, mid_t, mid_th):
    eff = effective_half_spread_bps(d, fill, mid_t)
    real = realized_half_spread_bps(d, fill, mid_t, mid_th)
    imp = price_impact_bps(d, mid_t, mid_th)
    bump = 1e-6 * max(1.0, abs(eff), abs(real), abs(imp))
    with pytest.raises(IdentityError):
        check_decomposition(eff, real, imp + bump)
