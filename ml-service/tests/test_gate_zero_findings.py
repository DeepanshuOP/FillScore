"""3a G1: pins WHY the demo accounts have zero verified findings, so a model change is deliberate.

The replay credits only the maker/taker FEE-RATE difference (FEE_RATES: binance 0.10%/0.10%, bybit 0.10%/0.10%,
okx maker 0.08% / taker 0.10%). It does not credit avoided spread or slippage. At a venue with equal maker and
taker rates, maker_instead_of_taker therefore saves exactly $0 and can never clear max($1, 0.5% of fees).
"""
from agents.verification import evaluate, materiality_threshold

REC = {"action_type": "maker_instead_of_taker", "params": {"target_ratio": 0.5}, "rationale_text": "t"}


def _trades(exchange, notionals, fee_each, slip=0.0):
    return [{"_id": f"t{i}", "exchange": exchange, "notionalValue": n, "feePaid": fee_each(n),
             "isMaker": False, "arrivalSlippageBps": slip} for i, n in enumerate(notionals)]


def test_threshold_is_max_of_one_dollar_and_half_percent_of_fees():
    assert materiality_threshold(10.0) == 1.0      # 0.5% * 10 = 0.05 < 1
    assert materiality_threshold(1000.0) == 5.0    # 0.5% * 1000 = 5 > 1


def test_equal_rates_save_zero_even_with_large_slippage():
    # 4 takers on binance, notional 1000..4000, target 0.5 -> k = ceil(0.5*4) = 2, makers 0 -> convert 2
    # smallest: (1000 + 2000) * (0.0010 - 0.0010) = 0.00. Slippage of 50 bps is NOT credited.
    g = evaluate(REC, _trades("binance", [1000, 2000, 3000, 4000], lambda n: n * 0.001, slip=50.0), "BTCUSDT")
    assert g.status == "rejected" and g.reason == "immaterial"
    assert g.cf.effect_usd == 0.0


def test_okx_small_saving_is_immaterial():
    # converted: 1000 + 2000 = 3000; 3000 * (0.0010 - 0.0008) = 0.60; fees = 10 * 0.001 * 1000 = 10.00
    # threshold = max(1, 0.05) = 1.00; 0.60 > 1.00 is false -> immaterial
    g = evaluate(REC, _trades("okx", [1000, 2000, 3000, 4000], lambda n: n * 0.001), "BTCUSDT")
    assert round(g.cf.effect_usd, 2) == 0.60
    assert g.status == "rejected" and g.reason == "immaterial"


def test_okx_large_saving_passes():
    # converted: 100000 + 200000 = 300000; 300000 * 0.0002 = 60.00; fees = 0.001 * 1,000,000 = 1000.00
    # threshold = max(1, 5.00) = 5.00; 60 > 5 -> passed
    g = evaluate(REC, _trades("okx", [100000, 200000, 300000, 400000], lambda n: n * 0.001), "BTCUSDT")
    assert round(g.cf.effect_usd, 2) == 60.00
    assert g.status == "passed"
