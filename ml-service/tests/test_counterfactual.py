"""Counterfactual replay functions. Expected values hand-computed (arithmetic in comments)."""
from datetime import datetime
import pytest
from agents.counterfactual import (
    CounterfactualError, maker_instead_of_taker, exclude_hours, venue_shift,
    smaller_clips, percentile,
)


def T(id_, ex, maker, sym, notional, fee, slip, ts):
    return {"id": id_, "exchange": ex, "isMaker": maker, "symbol": sym,
            "notionalValue": notional, "feePaid": fee, "arrivalSlippageBps": slip,
            "executedAt": ts}


D = datetime
OKX = [
    T("o1", "okx", False, "BTCUSDT", 1000, 1.00, 5, D(2024, 1, 15, 8, 0)),
    T("o2", "okx", False, "BTCUSDT", 2000, 2.00, 10, "2024-01-15T08:30:00Z"),
    T("o3", "okx", False, "BTCUSDT", 500, 0.50, 2, D(2024, 1, 15, 14, 0)),
    T("o4", "okx", True, "BTCUSDT", 4000, 3.20, 0, "2024-01-15T14:30:00"),
    T("o5", "okx", False, "BTCUSDT", 3000, 3.00, -4, D(2024, 1, 15, 21, 0)),
]
# o4 is the only maker (m=1); four takers.
BIN = [
    T("b1", "binance", False, "BTCUSDT", 2000, 2.00, 3, D(2024, 1, 15, 9)),
    T("b2", "binance", True, "BTCUSDT", 2000, 2.00, 1, D(2024, 1, 15, 10)),
    T("b3", "binance", False, "ETHUSDT", 1000, 1.00, 8, D(2024, 1, 15, 11)),
]
S = [
    T("s1", "binance", False, "BTCUSDT", 1000, 1.00, 2, D(2024, 1, 15, 1)),
    T("s2", "binance", False, "BTCUSDT", 1000, 1.00, 4, D(2024, 1, 15, 2)),
    T("s3", "binance", False, "BTCUSDT", 5000, 5.00, 20, D(2024, 1, 15, 3)),
    T("s4", "binance", False, "BTCUSDT", 4000, 4.00, 15, D(2024, 1, 15, 4)),
]
A = 1e-6


def test_percentile():
    assert percentile([1000, 1000, 4000, 5000], 50) == 2500
    assert percentile([], 50) == 0.0


def no_advice(s):
    low = s.lower()
    for w in ("should", "could", "consider", "route"):
        assert w not in low


def test_maker_05():
    r = maker_instead_of_taker(OKX, 0.5, spread_aware=False)  # legacy fee-only model, pinned. k=3, m=1 -> 2 smallest: o3,o1 -> 1500*0.0002=0.30
    assert r.effect_usd == pytest.approx(0.30, abs=A)
    assert r.effect_bps == pytest.approx(0.285714, abs=A)
    assert r.n_trades_affected == 2 and r.affected_ids == ["o3", "o1"]
    assert r.details["target_ratio"] == 0.5
    no_advice(r.method)


def test_maker_08():
    r = maker_instead_of_taker(OKX, 0.8, spread_aware=False)  # legacy fee-only. k=4 -> 3: o3,o1,o2 = 3500*0.0002=0.70
    assert r.effect_usd == pytest.approx(0.70, abs=A)
    assert r.effect_bps == pytest.approx(0.666667, abs=A)
    assert r.n_trades_affected == 3


def test_maker_flat_fee():
    flat = [{**t, "exchange": "binance"} for t in OKX]
    r = maker_instead_of_taker(flat, 0.5, spread_aware=False)
    assert r.effect_usd == 0.0 and r.effect_bps == 0.0 and r.n_trades_affected == 2


def test_maker_already_above():
    ts = [T(f"m{i}", "okx", True, "BTCUSDT", 100 * (i + 1), 0.1, 0, D(2024, 1, 15, i)) for i in range(4)]
    ts.append(T("t1", "okx", False, "BTCUSDT", 100, 0.1, 0, D(2024, 1, 15, 5)))
    r = maker_instead_of_taker(ts, 0.5, spread_aware=False)  # k=3 <= 4
    assert r.effect_usd == 0 and r.n_trades_affected == 0


@pytest.mark.parametrize("hours,eff,bps,n", [
    ([8], 3.10, 2.952381, 2),      # 5.50 - 3000*8/1e4(2.40)
    ([14], -2.95, -2.809524, 2),   # 3.80 - 4500*15/1e4(6.75)
    ([8, 14], 4.80, 4.571429, 4),  # 9.30 - 7500*6/1e4(4.50)
    ([21], -2.25, -2.142857, 1),   # 1.80 - 3000*13.5/1e4(4.05)
])
def test_exclude_hours(hours, eff, bps, n):
    r = exclude_hours(OKX, hours)
    assert r.effect_usd == pytest.approx(eff, abs=A)
    assert r.effect_bps == pytest.approx(bps, abs=A)
    assert r.n_trades_affected == n
    assert "median_out_bps" in r.details and r.details["hours"] == hours
    no_advice(r.method)


def test_exclude_hours_errors():
    with pytest.raises(CounterfactualError) as e:
        exclude_hours(OKX, [8, 14, 21])
    assert e.value.code == "no_trades_outside_hours"
    with pytest.raises(CounterfactualError) as e:
        exclude_hours(OKX, [3])
    assert e.value.code == "no_trades_in_hours"


def test_venue_shift():
    ts = OKX + BIN
    r = venue_shift(ts, "binance", "okx", "BTCUSDT")
    assert r.effect_usd == pytest.approx(0.571429, abs=A)
    assert r.effect_bps == pytest.approx(0.368664, abs=A)
    assert r.n_trades_affected == 2
    assert r.details["shifted_notional_usd"] == 4000
    assert r.details["from_bps"] == pytest.approx(12.0, abs=A)
    assert r.details["to_bps"] == pytest.approx(10.571429, abs=A)
    no_advice(r.method)
    r = venue_shift(ts, "okx", "binance", "BTCUSDT")
    assert r.effect_usd == pytest.approx(-1.50, abs=A)
    assert r.effect_bps == pytest.approx(-0.967742, abs=A)
    assert r.n_trades_affected == 5
    with pytest.raises(CounterfactualError) as e:
        venue_shift(ts, "okx", "binance", "ETHUSDT")
    assert e.value.code == "not_on_both_venues"
    with pytest.raises(CounterfactualError) as e:
        venue_shift(ts, "okx", "okx", "BTCUSDT")
    assert e.value.code == "same_venue"


def test_smaller_clips():
    r = smaller_clips(S, "BTCUSDT", 2500)
    assert r.effect_usd == pytest.approx(13.30, abs=A)
    assert r.effect_bps == pytest.approx(12.090909, abs=A)
    assert r.n_trades_affected == 2
    assert r.details["diff_bps"] == pytest.approx(14.777778, abs=A)
    assert "association" in r.method
    no_advice(r.method)
    r = smaller_clips(OKX, "BTCUSDT", 2000)
    assert r.effect_usd == pytest.approx(-7.20, abs=A) and r.n_trades_affected == 2
    with pytest.raises(CounterfactualError) as e:
        smaller_clips(S, "BTCUSDT", 5000)
    assert e.value.code == "nothing_above_threshold"
    with pytest.raises(CounterfactualError) as e:
        smaller_clips(S, "BTCUSDT", 500)
    assert e.value.code == "nothing_below_threshold"
