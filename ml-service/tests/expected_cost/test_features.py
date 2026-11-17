"""Hour context (volatility and volume of the hour before an order) and event features, hand-computed.

Context definition (our own, stated in expected_cost/features.py; it is not taken from a source): over the `lookback`
whole minutes before the minute that holds t, sigma = sqrt(sum of squared 1-minute log returns of the minute closes) in
bps, volume = sum of base quantity. A minute without prints keeps the previous close and has volume 0.

Fixture, lookback 3, t in minute 14 (minute m = ts_ms // 60000):
  minute 10: one print, price 100, qty 1 (close 100)
  minute 11: prints 100.5 then 101, qty 1 each (close 101, volume 2)
  minute 12: no print (close carried: 101, volume 0)
  minute 13: one print at 13:59:59.000, price 99, qty 3, aggressor SELL (close 99, volume 3)
Window = minutes 11, 12, 13 and closes of minutes 10..13: 100, 101, 101, 99.
  returns: ln(101/100) = 0.00995033, ln(101/101) = 0, ln(99/101) = -0.02000667
  sum of squares = 0.0000990090 + 0 + 0.000400267 = 0.000499276; sqrt = 0.0223444; sigma = 223.44 bps
  volume = 2 + 0 + 3 = 5; minutes with prints in the window: 11 and 13 = 2.
Event: one print at 14:00:00.000, price 99.5, qty 2, aggressor BUY. The print before it is 1 s old and on the sell side
only, so the quote is the last trade, 99 (measure.benchmarks rules): effective half-spread = (99.5 - 99) / 99 x 1e4
= 50.505 bps; notional = 99.5 x 2 = 199."""
import numpy as np
import pytest

from expected_cost.features import event_features, hour_context
from measure.data.aggtrades import AggTradeWindow

MIN = 60_000


def _tape():
    # (agg_id, price, qty, ts_ms, is_buyer_maker): is_buyer_maker False = buyer-initiated (aggressor BUY)
    rows = [(1, 100.0, 1.0, 10 * MIN + 5_000, False),
            (2, 100.5, 1.0, 11 * MIN + 1_000, False), (3, 101.0, 1.0, 11 * MIN + 2_000, False),
            (4, 99.0, 3.0, 14 * MIN - 1_000, True),
            (5, 99.5, 2.0, 14 * MIN, False)]
    return AggTradeWindow.from_arrays("TESTUSDT", *[np.array([r[i] for r in rows]) for i in range(5)], ())


def test_context_is_hand_computed():
    sigma, vol = hour_context(_tape(), 14 * MIN, lookback=3, min_bars=2)
    assert sigma == pytest.approx(223.44, rel=1e-3)
    assert vol == pytest.approx(5.0)


def test_context_works_when_the_window_ends_before_t():
    """The demo build asks for the hour before an order and passes a window that stops at the order's time: the minute of
    t then has no print yet, and the answer must be the same as with the full tape."""
    cut = _tape().between(0, 14 * MIN)                      # drops the print at 14:00:00.000
    sigma, vol = hour_context(cut, 14 * MIN, lookback=3, min_bars=2)
    assert sigma == pytest.approx(223.44, rel=1e-3) and vol == pytest.approx(5.0)


def test_context_needs_enough_minutes_with_prints():
    assert hour_context(_tape(), 14 * MIN, lookback=3, min_bars=3) is None     # only 2 of 3 minutes have prints


def test_context_needs_a_close_before_the_window():
    assert hour_context(_tape(), 13 * MIN, lookback=3, min_bars=1) is None     # the close of minute 9 does not exist


def test_event_features_hand_computed():
    ev = event_features(_tape(), lookback=3, min_bars=2)
    assert len(ev.eff) == 1                                   # earlier events have no context; this one has
    assert ev.eff[0] == pytest.approx(50.505, rel=1e-4)
    assert ev.notional[0] == pytest.approx(199.0)
    assert ev.qty[0] == pytest.approx(2.0)
    assert ev.sigma[0] == pytest.approx(223.44, rel=1e-3)
    assert ev.vol[0] == pytest.approx(5.0)
