"""C6: calibration from real prints. Runs offline on the committed 2-minute fixtures."""
import numpy as np
import pytest

from measure.benchmarks import quote_at
from measure.data.aggtrades import AggTradeWindow
from scoring_v2.calibrate import (
    DURATION_SAMPLE_MS, MIN_SAMPLES, anchors_from, drift_samples, hour_samples, print_effective_half_bps, print_mids,
)

from tests.measure.conftest import BNB_2024, BTC_2024, BTC_2025, load_fixture


@pytest.mark.parametrize("spec", [BTC_2024, BNB_2024, BTC_2025])
def test_vectorised_mids_equal_quote_at_on_every_real_print(spec):
    w = load_fixture(spec)
    mids = print_mids(w)
    for i in range(len(w)):
        q = quote_at(w, int(w.ts_ms[i])).mid
        if q is None:
            assert np.isnan(mids[i])
        else:
            assert mids[i] == q


def test_print_effective_half_spread_signs():
    # W: (1000,100.00,T) (2000,100.02,F) (2500,100.10,F). At 2500 the mid is 100.01 and the print is buyer-initiated:
    # eff = (100.10 - 100.01)/100.01 x 1e4 = 8.99910009. At 2000 only the bid side (100.00 @1000) exists -> last trade
    # 100.00, buyer-initiated: (100.02 - 100.00)/100.00 x 1e4 = 2.0. The first print has no earlier print -> NaN.
    w = AggTradeWindow.from_rows("X", [(1, 100.00, 1.0, 1000, True), (2, 100.02, 1.0, 2000, False), (3, 100.10, 2.0, 2500, False)])
    eff, notional = print_effective_half_bps(w)
    assert np.isnan(eff[0])
    assert eff[1] == pytest.approx(2.0, abs=1e-9)
    assert eff[2] == pytest.approx(8.99910009, abs=1e-8)
    assert notional.tolist() == pytest.approx([100.0, 100.02, 200.2])


def test_drift_samples_are_symmetric_and_hand_checked():
    # Mid path: prints every 1000 ms alternating sides at 100 then 101 after t=10000.
    rows = []
    for k in range(1, 30):
        p = 100.0 if k * 1000 < 10_000 else 101.0
        rows.append((k, p, 1.0, k * 1000, k % 2 == 0))
    w = AggTradeWindow.from_rows("X", rows)
    d = drift_samples(w, duration_ms=5000, step_ms=1000)
    assert len(d) % 2 == 0
    assert sorted(d) == sorted(-x for x in d)                 # both sides
    assert max(d) == pytest.approx(100.0, abs=1e-9)          # (101 - 100)/100 x 1e4


def test_anchors_need_enough_samples_and_strict_increase():
    assert anchors_from(np.arange(MIN_SAMPLES - 1, dtype=float)) is None
    a = anchors_from(np.arange(1000, dtype=float))
    assert a == pytest.approx([99.9, 499.5, 899.1, 989.01])
    assert anchors_from(np.zeros(1000)) is None


def test_hour_samples_on_real_slice(btc_2024):
    # The slice is 14:00-14:02 UTC: every sample falls in hour 14. The quoted half-spread proxy is never below half a
    # tick (0.005 / ~42,860 x 1e4 = 0.0001167 bps).
    spreads, rets = hour_samples(btc_2024, tick=0.01, step_ms=10_000)
    assert set(spreads) == {14} and set(rets) <= {14}
    assert min(spreads[14]) >= 0.005 / 42900 * 1e4
    assert len(rets.get(14, [])) >= 1


def test_duration_sample_points_cover_every_bucket():
    from scoring_v2.components import DURATION_BUCKETS, duration_bucket
    names = {n for _, n in DURATION_BUCKETS} | {"ge1h"}
    assert set(DURATION_SAMPLE_MS) == names
    for name, ms in DURATION_SAMPLE_MS.items():
        assert duration_bucket(ms) == name
