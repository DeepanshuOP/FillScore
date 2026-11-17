"""The worked examples written in the metrics' own documentation, computed by hand and run against the installed package."""
import pytest

import fillscore_metrics as fm


def test_effective_realized_and_impact_of_a_buy():
    # buy at 100.02, mid 100.01, mid 15 s later 100.04
    assert fm.effective_half_spread_bps(1, 100.02, 100.01) == pytest.approx(0.9999, abs=1e-4)       # (100.02 - 100.01) / 100.01 x 1e4
    assert fm.realized_half_spread_bps(1, 100.02, 100.01, 100.04) == pytest.approx(-1.9998, abs=1e-4)  # (100.02 - 100.04) / 100.01 x 1e4
    assert fm.price_impact_bps(1, 100.01, 100.04) == pytest.approx(2.9997, abs=1e-4)                # (100.04 - 100.01) / 100.01 x 1e4


def test_the_decomposition_effective_equals_realized_plus_impact():
    eff = fm.effective_half_spread_bps(1, 100.02, 100.01)
    fm.check_decomposition(eff, fm.realized_half_spread_bps(1, 100.02, 100.01, 100.04), fm.price_impact_bps(1, 100.01, 100.04))


def test_a_sell_has_the_opposite_sign():
    assert fm.effective_half_spread_bps(-1, 99.98, 100.00) == pytest.approx(2.0)                    # -(99.98 - 100.00) / 100.00 x 1e4


def test_bad_input_is_refused_not_guessed():
    for bad in (0, -1, float("nan"), float("inf")):
        with pytest.raises(ValueError):
            fm.effective_half_spread_bps(1, bad, 100.0)
    with pytest.raises(ValueError):
        fm.effective_half_spread_bps(0, 100.0, 100.0)


def test_implementation_shortfall_of_a_partly_filled_order():
    # buy 2.0, arrival 100.00, fills 1.0 at 100.02 and 0.5 at 100.04, end mid 100.10, fees 0.15; intended notional 200
    r = fm.order_is(1, 2.0, [(100.02, 1.0, None), (100.04, 0.5, None)], 100.0, 100.10, 0.15, "order")
    assert r["executionBps"] == pytest.approx(2.0)          # (0.02 x 1.0 + 0.04 x 0.5) / 200 x 1e4
    assert r["opportunityBps"] == pytest.approx(2.5)        # 0.10 x (2.0 - 1.5) / 200 x 1e4
    assert r["feesBps"] == pytest.approx(7.5)               # 0.15 / 200 x 1e4
    assert r["totalBps"] == pytest.approx(12.0)
    assert r["fillRatio"] == pytest.approx(0.75)
    assert r["delayBps"] is None                            # an exchange records no decision time, so delay cost is never invented


def test_fee_rate_example_from_the_binance_commission_faq():
    snap = {"standard": {"maker": 0.0000001, "taker": 0.0000002, "buyer": 0.0000003, "seller": 0.0000004},
            "tax": {"maker": 0.00000112, "taker": 0.00000114, "buyer": 0.00000115, "seller": 0.00000116},
            "special": {"maker": 0.01, "taker": 0.02, "buyer": 0.03, "seller": 0.04},
            "discount": {"enabledForAccount": True, "enabledForSymbol": True, "rate": 0.25}}
    # taker sell: (0.0000002 + 0.0000004) x 0.25 + (0.00000114 + 0.00000116) + (0.02 + 0.04) = 0.00000015 + 0.0000023 + 0.06 = 0.06000245
    assert fm.effective_rate(snap, "SELL", False, True) == pytest.approx(0.06000245, abs=1e-12)


def test_the_methodology_text_is_generated_from_the_registered_metrics():
    text = fm.methodology_markdown()
    assert f"version {fm.MEASURE_VERSION}" in text
    for mid in fm.REGISTRY:
        assert f"`{mid}`" in text
