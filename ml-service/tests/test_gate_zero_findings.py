"""3a G1, deliberately updated in 4a Q4.

Old model (still available as spread_aware=False, pinned below): the replay credited only the maker/taker FEE-RATE
difference (binance 0.10%/0.10%, bybit 0.10%/0.10%, okx maker 0.08% / taker 0.10%), so equal rates saved exactly $0.

New default model (spread_aware=True): effect = FILL_PROBABILITY_HAIRCUT (0.5) *
    (fee_component + spread_component - adverse_selection_component). Equal fee rates no longer mean $0 by
construction. Without enrichment (no halfSpreadBps, no markouts) the spread credit is cancelled by the 'unknown'
adverse-selection rule, so un-enriched accounts (the demo accounts today) get exactly 0.5 * the fee-only effect.
The materiality gate max($1, 0.5% of fees) is unchanged.
"""
from agents.counterfactual import maker_instead_of_taker
from agents.verification import evaluate, materiality_threshold

REC = {"action_type": "maker_instead_of_taker", "params": {"target_ratio": 0.5}, "rationale_text": "t"}
REC80 = {"action_type": "maker_instead_of_taker", "params": {"target_ratio": 0.8}, "rationale_text": "t"}


def _trades(exchange, notionals, fee_each, slip=0.0):
    return [{"_id": f"t{i}", "exchange": exchange, "notionalValue": n, "feePaid": fee_each(n),
             "isMaker": False, "arrivalSlippageBps": slip} for i, n in enumerate(notionals)]


def test_threshold_is_max_of_one_dollar_and_half_percent_of_fees():
    assert materiality_threshold(10.0) == 1.0      # 0.5% * 10 = 0.05 < 1
    assert materiality_threshold(1000.0) == 5.0    # 0.5% * 1000 = 5 > 1


# ── old fee-only behaviour, pinned under the flag ──────────────────────────────────────────────────────
def test_fee_only_flag_equal_rates_save_zero_even_with_large_slippage():
    # 4 takers on binance, 1000..4000, target 0.5 -> k = 2 converted (1000, 2000): 3000 * (0.0010 - 0.0010) = 0.00
    r = maker_instead_of_taker(_trades("binance", [1000, 2000, 3000, 4000], lambda n: n * 0.001, slip=50.0), 0.5,
                               spread_aware=False)
    assert r.effect_usd == 0.0


def test_fee_only_flag_okx_values_unchanged():
    r = maker_instead_of_taker(_trades("okx", [1000, 2000, 3000, 4000], lambda n: n * 0.001), 0.5, spread_aware=False)
    assert round(r.effect_usd, 2) == 0.60          # 3000 * 0.0002
    r = maker_instead_of_taker(_trades("okx", [100000, 200000, 300000, 400000], lambda n: n * 0.001), 0.5,
                               spread_aware=False)
    assert round(r.effect_usd, 2) == 60.00         # 300000 * 0.0002


# ── new default model, un-enriched trades ──────────────────────────────────────────────────────────────
def test_equal_rates_unenriched_still_zero_and_immaterial():
    g = evaluate(REC, _trades("binance", [1000, 2000, 3000, 4000], lambda n: n * 0.001, slip=50.0), "BTCUSDT")
    assert g.status == "rejected" and g.reason == "immaterial"
    assert g.cf.effect_usd == 0.0


def test_okx_small_saving_is_halved_and_immaterial():
    # fee component 3000 * 0.0002 = 0.60; spread 0, adverse 'unknown' = spread = 0; haircut 0.5 -> 0.30
    # threshold = max(1, 0.5% * 10.00) = 1.00; 0.30 > 1.00 is false -> immaterial
    g = evaluate(REC, _trades("okx", [1000, 2000, 3000, 4000], lambda n: n * 0.001), "BTCUSDT")
    assert round(g.cf.effect_usd, 2) == 0.30
    assert g.cf.details["fee_component"] == 0.6 and g.cf.details["fill_haircut"] == 0.5
    assert g.status == "rejected" and g.reason == "immaterial"


def test_okx_large_saving_passes_after_haircut():
    # fee component 300000 * 0.0002 = 60.00; haircut 0.5 -> 30.00; fees = 1000.00, threshold = max(1, 5.00) = 5.00
    g = evaluate(REC, _trades("okx", [100000, 200000, 300000, 400000], lambda n: n * 0.001), "BTCUSDT")
    assert round(g.cf.effect_usd, 2) == 30.00
    assert g.status == "passed"


# ── new: spread and adverse selection, hand computed ───────────────────────────────────────────────────
def _enriched(maker_p60, n_makers=10, taker_p60=None, half_spread=2.0, scale=1000):
    """n_makers own maker BUY fills at 100 (notional 1000*scale/1000... = `scale`), P(t+60)=maker_p60, plus four
    binance takers 1000*scale..4000*scale/1000 with halfSpreadBps. Equal fee rates (0.10% / 0.10%)."""
    out = [{"_id": f"m{i}", "exchange": "binance", "isMaker": True, "side": "BUY", "executionPrice": 100.0,
            "notionalValue": 1000.0, "feePaid": 1.0, "postPrices": {"60": maker_p60}} for i in range(n_makers)]
    for i, n in enumerate([1000, 2000, 3000, 4000]):
        t = {"_id": f"t{i}", "exchange": "binance", "isMaker": False, "side": "BUY", "executionPrice": 100.0,
             "notionalValue": n * scale, "feePaid": n * scale * 0.001, "halfSpreadBps": half_spread}
        if taker_p60 is not None:
            t["postPrices"] = {"60": taker_p60}
        out.append(t)
    return out


def test_equal_fees_positive_spread_minus_adverse_selection_exact_dollars():
    # halfSpread 1.0 bp (= HALF_SPREAD_CAP_BPS). 10 maker fills, P60 = 99.995 -> markout -0.5 bps each
    # -> adverse = max(0, 0.5) = 0.5 bps (own_maker_fills).
    # n = 14, target 0.8 -> k = ceil(11.2) = 12; makers 10 -> convert 2 smallest takers: 1000k + 2000k, k = 1000 -> 3,000,000
    # fee 3e6 * 0 = 0 ; spread 3e6 * 1e-4 = 300 ; adverse 3e6 * 0.5e-4 = 150 ; net 150 ; haircut 0.5 -> 75.00
    # fees (all trades) = 10*1 + 0.001*10e6 = 10010 ; threshold = max(1, 50.05) = 50.05 ; 75 > 50.05 -> passed
    g = evaluate(REC80, _enriched(99.995, half_spread=1.0), "BTCUSDT")
    d = g.cf.details
    assert round(d["fee_component"], 6) == 0.0 and round(d["spread_component"], 6) == 300.0
    assert round(d["adverse_selection_component"], 6) == 150.0 and d["fill_haircut"] == 0.5
    assert d["adverse_basis"] == "own_maker_fills" and d["adverse_n_fills"] == 10
    assert round(g.cf.effect_usd, 6) == 75.0
    assert g.status == "passed"


def test_half_spread_credit_is_capped():
    # estimator says 5 bps; credit is min(5, 1.0 cap) = 1 bp, so the result equals the 1.0 bp case above: 75.00
    g = evaluate(REC80, _enriched(99.995, half_spread=5.0), "BTCUSDT")
    assert round(g.cf.details["spread_component"], 6) == 300.0 and round(g.cf.effect_usd, 6) == 75.0


def test_heavy_adverse_selection_is_non_positive_and_immaterial():
    # P60 = 99.95 -> -5 bps -> adverse 5 bps: 3e6*5e-4 = 1500 ; net = 0 + 300 - 1500 = -1200 ; * 0.5 = -600
    g = evaluate(REC80, _enriched(99.95, half_spread=1.0), "BTCUSDT")
    assert round(g.cf.effect_usd, 6) == -600.0
    assert g.status == "rejected" and g.reason == "immaterial"


def test_favourable_maker_markout_earns_no_credit():
    # P60 = 100.05 -> +5 bps for makers: adverse floored at 0 (never negative): net = 300 -> 150.00
    g = evaluate(REC80, _enriched(100.05, half_spread=1.0), "BTCUSDT")
    assert g.cf.details["adverse_bps"] == 0.0 and round(g.cf.effect_usd, 6) == 150.0


def test_fewer_than_ten_makers_taker_fallback_never_leaves_a_net_spread_credit():
    # 2 makers (< 10), 4 takers: n = 6, target 0.8 -> k = 5 ; convert 3 smallest: (1+2+3)*1000 = 6000 (scale=1)
    # halfSpread 1 bp: spread 6000*1e-4 = 0.60.
    # taker P60 = 99.98 -> -2 bps -> adverse 2 bps = 1.20 > 0.60 : net = 0.60 - 1.20 = -0.60 ; * 0.5 = -0.30
    r = maker_instead_of_taker(_enriched(99.0, n_makers=2, taker_p60=99.98, half_spread=1.0, scale=1), 0.8)
    assert r.details["adverse_basis"] == "own_taker_fills" and abs(r.details["adverse_bps"] - 2.0) < 1e-9
    assert abs(r.effect_usd - (-0.30)) < 1e-6
    # taker P60 = 99.995 -> -0.5 bps -> adverse 0.30 < spread 0.60, floored UP to the spread: net 0 -> effect 0
    r = maker_instead_of_taker(_enriched(99.0, n_makers=2, taker_p60=99.995, half_spread=1.0, scale=1), 0.8)
    assert abs(r.effect_usd) < 1e-9
    # favourable taker markouts (adverse 0) also give no credit
    r = maker_instead_of_taker(_enriched(99.0, n_makers=2, taker_p60=100.05, half_spread=1.0, scale=1), 0.8)
    assert abs(r.effect_usd) < 1e-9


def test_unknown_adverse_selection_cancels_the_spread_credit():
    # no markouts anywhere: adverse = spread credit -> net = fee component only (0 on binance) -> 0
    trades = [{**t, "halfSpreadBps": 5.0} for t in _trades("binance", [1000, 2000, 3000, 4000], lambda n: n * 0.001)]
    r = maker_instead_of_taker(trades, 0.5)
    assert r.details["adverse_basis"] == "unknown" and r.effect_usd == 0.0
