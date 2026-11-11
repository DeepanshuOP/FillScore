"""Order-level implementation shortfall (Perold 1988), in bps of the intended notional at the arrival mid.

Hand case (buy): ordered 2.0, arrival mid 100.00; fills (100.02, 1.0, mid 100.01) and (100.04, 0.5, mid 100.03);
then cancelled; end mid 100.10; fees 0.15 (quote currency).
  intended    = 2.0 x 100.00                                   = 200.00
  execution   = ((100.02-100.00)x1.0 + (100.04-100.00)x0.5)/200 x 1e4 = (0.02 + 0.02)/200 x 1e4 = 2.0
  spread      = ((100.02-100.01)x1.0 + (100.04-100.03)x0.5)/200 x 1e4 = (0.01 + 0.005)/200 x 1e4 = 0.75
  impact/timing = ((100.01-100.00)x1.0 + (100.03-100.00)x0.5)/200 x 1e4 = (0.01 + 0.015)/200 x 1e4 = 1.25
  opportunity = (100.10-100.00) x (2.0-1.5)/200 x 1e4           = 0.05/200 x 1e4 = 2.5
  fees        = 0.15/200 x 1e4                                  = 7.5
  total       = 2.0 + 2.5 + 7.5                                 = 12.0
"""
import pytest

from measure.metrics import IdentityError
from measure.orders import order_is

FILLS = [(100.02, 1.0, 100.01), (100.04, 0.5, 100.03)]


def hand(**kw):
    args = dict(side=1, ordered_qty=2.0, fills=FILLS, arrival_mid=100.00, end_mid=100.10, fees_quote=0.15, basis="order")
    args.update(kw)
    return order_is(**args)


def test_order_is_hand_case():
    r = hand()
    assert r["basis"] == "order"
    assert r["intendedNotional"] == pytest.approx(200.0, abs=1e-12)
    assert r["filledQty"] == pytest.approx(1.5, abs=1e-12)
    assert r["executionBps"] == pytest.approx(2.0, abs=1e-9)
    assert r["spreadBps"] == pytest.approx(0.75, abs=1e-9)
    assert r["impactTimingBps"] == pytest.approx(1.25, abs=1e-9)
    assert r["opportunityBps"] == pytest.approx(2.5, abs=1e-9)
    assert r["feesBps"] == pytest.approx(7.5, abs=1e-9)
    assert r["totalBps"] == pytest.approx(12.0, abs=1e-9)
    assert r["delayBps"] is None and r["delayReason"] == "no decision timestamp"
    assert r["fillsWithoutMid"] == 0


def test_fully_filled_opportunity_zero():
    # ordered 1.5 = filled 1.5: intended = 150; execution = 0.04/150 x 1e4 = 2.6666...; opportunity 0 (not None),
    # even with no end mid; fees 0.15/150 x 1e4 = 10.0; total = 12.6666...
    r = hand(ordered_qty=1.5, end_mid=None)
    assert r["opportunityBps"] == 0.0
    assert r["executionBps"] == pytest.approx(0.04 / 150 * 1e4, abs=1e-9)
    assert r["totalBps"] == pytest.approx(0.04 / 150 * 1e4 + 10.0, abs=1e-9)


def test_first_fill_basis_opportunity_none():
    # No order record: ordered = filled = 1.5, so intended = 150 and opportunity cannot be known -> None, total None.
    r = hand(ordered_qty=None, basis="first_fill")
    assert r["basis"] == "first_fill"
    assert r["intendedNotional"] == pytest.approx(150.0, abs=1e-12)
    assert r["opportunityBps"] is None
    assert r["totalBps"] is None
    assert r["totalReason"] == "opportunity cost unknown without an order record"
    assert r["executionBps"] == pytest.approx(0.04 / 150 * 1e4, abs=1e-9)


def test_partial_fill_without_end_mid_has_no_total():
    r = hand(end_mid=None)
    assert r["opportunityBps"] is None and r["totalBps"] is None
    assert r["totalReason"] == "no mid at the order's end"


def test_sell_mirror():
    # Mirror every price around 100.00: sell fills (99.98, 1.0, 99.99), (99.96, 0.5, 99.97); end mid 99.90.
    r = hand(side=-1, fills=[(99.98, 1.0, 99.99), (99.96, 0.5, 99.97)], end_mid=99.90)
    for k, v in (("executionBps", 2.0), ("spreadBps", 0.75), ("impactTimingBps", 1.25), ("opportunityBps", 2.5),
                 ("feesBps", 7.5), ("totalBps", 12.0)):
        assert r[k] == pytest.approx(v, abs=1e-9), k


def test_fill_without_mid_leaves_split_unmeasured():
    # The second fill has no fresh mid: execution is still measured (2.0), but the spread / impact split is not.
    r = hand(fills=[(100.02, 1.0, 100.01), (100.04, 0.5, None)])
    assert r["executionBps"] == pytest.approx(2.0, abs=1e-9)
    assert r["spreadBps"] is None and r["impactTimingBps"] is None
    assert r["fillsWithoutMid"] == 1
    assert r["totalBps"] == pytest.approx(12.0, abs=1e-9)


@pytest.mark.parametrize("bad", [
    dict(side=0), dict(fills=[], basis="first_fill"), dict(arrival_mid=0.0), dict(ordered_qty=1.0),  # 1.5 > 1.0
    dict(fees_quote=-0.01), dict(basis="other"), dict(ordered_qty=None),          # basis order needs ordered qty
    dict(fills=[(100.0, 0.0, 100.0)]),
])
def test_invalid_input_rejected(bad):
    with pytest.raises(ValueError):
        hand(**bad)


def test_unfilled_order_is_pure_opportunity():
    # A buy limit for 2.0 that never filled, arrival 100.00, cancelled when the mid was 100.10:
    #   intended 200.00; execution 0; spread 0; impact/timing 0; opportunity = 0.10 x 2.0/200 x 1e4 = 10.0;
    #   fees 0; total 10.0.
    r = hand(fills=[], fees_quote=0.0)
    assert r["filledQty"] == 0.0 and r["fillRatio"] == 0.0
    assert r["executionBps"] == 0.0 and r["spreadBps"] == 0.0 and r["impactTimingBps"] == 0.0
    assert r["opportunityBps"] == pytest.approx(10.0, abs=1e-9)
    assert r["totalBps"] == pytest.approx(10.0, abs=1e-9)


def test_unknown_fees_leave_total_unmeasured():
    # Fees cannot be valued in the quote currency (for example a BTC-quoted pair with no USD conversion).
    r = hand(fees_quote=None)
    assert r["feesBps"] is None and r["totalBps"] is None
    assert r["totalReason"] == "fees in the quote currency unknown"
    assert r["executionBps"] == pytest.approx(2.0, abs=1e-9)
    assert r["opportunityBps"] == pytest.approx(2.5, abs=1e-9)


def test_identities_enforced(monkeypatch):
    import measure.orders as o
    real = o._bps
    monkeypatch.setattr(o, "_bps", lambda x, n: real(x, n) + (1e-6 if x == pytest.approx(0.05) else 0.0))
    with pytest.raises(IdentityError):
        hand()
