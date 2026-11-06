"""4a Q2: signed markouts. Convention: markout_bps = side_sign * (P(t+h) - fill) / fill * 1e4,
buy = +1, sell = -1, so POSITIVE = the price moved in the trader's favour after the fill."""
import pytest

from agents.metrics.markout_packet import HORIZONS_S, build_markout_summary, fill_markout_bps


def test_horizons_are_the_five_specified():
    assert HORIZONS_S == (1, 5, 30, 60, 300)


def test_buy_price_up_is_favourable():
    # (100.1 - 100) / 100 * 1e4 = +10 bps
    assert fill_markout_bps("BUY", 100.0, 100.1) == pytest.approx(10.0)


def test_buy_price_down_is_adverse():
    # (99.9 - 100) / 100 * 1e4 = -10 bps
    assert fill_markout_bps("BUY", 100.0, 99.9) == pytest.approx(-10.0)


def test_sell_price_down_is_favourable():
    # -1 * (199 - 200) / 200 * 1e4 = +50 bps
    assert fill_markout_bps("SELL", 200.0, 199.0) == pytest.approx(50.0)


def test_missing_price_gives_none():
    assert fill_markout_bps("BUY", 100.0, None) is None
    assert fill_markout_bps("BUY", 0.0, 100.0) is None


TRADES = [
    {"id": "b", "side": "BUY", "isMaker": True, "executionPrice": 100.0, "notionalValue": 1000.0,
     "postPrices": {"1": 100.1, "5": None, "30": 100.0, "60": 99.9, "300": 100.2}},
    {"id": "s", "side": "SELL", "isMaker": False, "executionPrice": 200.0, "notionalValue": 3000.0,
     "postPrices": {"1": 199.0, "5": 200.0, "30": 201.0, "60": None, "300": 198.0}},
]


def test_aggregates_horizon_1_hand_computed():
    h = build_markout_summary(TRADES)["1"]
    # fills +10 (notional 1000, maker) and +50 (notional 3000, taker)
    assert h["n"] == 2
    assert h["mean_bps"] == pytest.approx(30.0)                      # (10+50)/2
    assert h["weighted_mean_bps"] == pytest.approx(40.0)             # (1000*10+3000*50)/4000
    assert h["median_bps"] == pytest.approx(30.0)
    assert h["p10_bps"] == pytest.approx(14.0)                       # 10 + 0.1*(50-10)
    assert h["p90_bps"] == pytest.approx(46.0)                       # 10 + 0.9*(50-10)
    assert h["adverse_share"] == 0.0
    assert h["maker"]["mean_bps"] == pytest.approx(10.0) and h["maker"]["n"] == 1
    assert h["taker"]["mean_bps"] == pytest.approx(50.0) and h["taker"]["n"] == 1


def test_missing_horizon_is_excluded_not_zero():
    s = build_markout_summary(TRADES)
    # h=5: buy missing -> only sell: (200-200) = 0 bps
    assert s["5"]["n"] == 1 and s["5"]["mean_bps"] == pytest.approx(0.0)
    assert s["5"]["maker"]["n"] == 0 and s["5"]["maker"]["mean_bps"] is None
    # h=60: sell missing -> only buy: -10 bps, adverse share 1.0
    assert s["60"]["n"] == 1 and s["60"]["mean_bps"] == pytest.approx(-10.0)
    assert s["60"]["adverse_share"] == 1.0
    assert s["60"]["taker"]["n"] == 0


def test_no_enrichment_gives_empty_summary():
    s = build_markout_summary([{"id": "x", "side": "BUY", "executionPrice": 1.0, "notionalValue": 1.0}])
    assert all(s[str(h)]["n"] == 0 and s[str(h)]["mean_bps"] is None for h in HORIZONS_S)
