"""4R-0c Task 5: no regime in any prompt, one priority rule, reversion from markouts. Hand-computed values."""
import json
import os
import re

import pytest

from agents import debate, synthesis
from agents import fee_optimizer, risk_auditor, liquidity_scout, alpha_architect
from agents.schemas import TradeContext
from agents.single_call import SINGLE_CALL_SYSTEM_PROMPT, build_single_user_prompt
from agents.metrics.liquidity_packet import build_liquidity_packet

GOLDEN = os.path.join(os.path.dirname(__file__), "..", "evals", "golden", "v2")   # packets rebuilt by the 4R-0c code (v1 predates reversion-from-markouts)
CASES = ["demo-disciplined", "demo-moderate", "demo-aggressive"]


class _Pkt:
    """Stands in for a metrics packet: only to_prompt_dict is read by the prompt builders."""
    def __init__(self, d):
        self.d = d

    def to_prompt_dict(self):
        return self.d


def _all_prompts(name):
    pk = json.load(open(os.path.join(GOLDEN, f"{name}.json")))["packet"]
    ctx = TradeContext(userId=name, symbol="BTCUSDT", trade_count=1)
    pf, pr, pl, pa = (_Pkt(pk[k]) for k in ("fee", "risk", "liquidity", "alpha"))
    out = [synthesis.SYNTHESIS_SYSTEM_PROMPT, SINGLE_CALL_SYSTEM_PROMPT,
           synthesis.build_user_prompt(ctx, {}, pf, pr, pl, pa, None, []),
           build_single_user_prompt(ctx, pf, pr, pl, pa, [])]
    for mod, key in ((fee_optimizer, "fee"), (risk_auditor, "risk"), (liquidity_scout, "liquidity"),
                     (alpha_architect, "alpha")):
        out.append(mod.SYSTEM_PROMPT)
        out.append(mod.build_user_prompt(ctx, None, {key: pk[key]}))
    args = (pk["liquidity"], pk["risk"], pk["fee"], pk["alpha"])
    out.append(debate._prosecution_prompt(*args, [], 1))
    out.append(debate._defense_prompt(*args, [], 1))
    return out


@pytest.mark.parametrize("name", CASES)
def test_no_regime_in_any_prompt(name):
    for text in _all_prompts(name):
        assert "regime" not in text.lower()
        assert "STABLE" not in text


def test_no_regime_in_schema_descriptions():
    from agents.schemas import ConflictEntry
    assert "regime" not in json.dumps(ConflictEntry.model_json_schema()).lower()
    assert "STABLE" not in json.dumps(ConflictEntry.model_json_schema())


def test_trade_context_regime_is_optional_and_unset():
    assert TradeContext(userId="u", symbol="BTCUSDT").regime is None


def test_single_priority_rule():
    p = synthesis.SYNTHESIS_SYSTEM_PROMPT
    assert len(re.findall(r"priority", p, re.I)) == 1
    assert p.count("Fee > Risk > Liquidity > Alpha") == 1


def _trade(i, price, post30, post60, notional, side="BUY"):
    return {"id": f"t{i}", "orderType": "MARKET", "isMaker": False, "arrivalSlippageBps": 1.0,
            "executedAt": "2024-01-15T08:30:00Z", "side": side, "executionPrice": price,
            "notionalValue": notional, "postPrices": {"30": post30, "60": post60}}


def test_reversion_from_markouts():
    # buy at 100.00, P30 = 99.99: markout30 = +1 * (99.99-100)/100 * 1e4 = -1.0 bps -> reversion30 = +1.0
    pkt = build_liquidity_packet([_trade(1, 100.0, 99.99, 100.02, 1000.0)], "u", "BTCUSDT")
    assert pkt.has_reversion_data is True
    assert pkt.reversion_30s_avg_bps == pytest.approx(1.0, abs=1e-6)
    # P60 = 100.02: markout60 = +2.0 bps -> reversion60 = -2.0
    assert pkt.reversion_60s_avg_bps == pytest.approx(-2.0, abs=1e-6)
    assert pkt.reversion_trade_count == 1


def test_reversion_is_notional_weighted_and_sell_signed():
    # t1 buy 100 -> P30 99.99: markout -1.0 (rev +1.0), notional 3000
    # t2 sell 200 -> P30 199.96: markout = -1 * (199.96-200)/200 * 1e4 = +2.0 (rev -2.0), notional 1000
    # weighted rev30 = (1.0*3000 + -2.0*1000) / 4000 = 0.25
    # t3 has no postPrices: ignored
    t3 = {"id": "t3", "orderType": "MARKET", "isMaker": False, "arrivalSlippageBps": 1.0,
          "executedAt": "2024-01-15T09:00:00Z", "side": "BUY", "executionPrice": 100.0, "notionalValue": 9999.0}
    pkt = build_liquidity_packet([_trade(1, 100.0, 99.99, None, 3000.0),
                                  _trade(2, 200.0, 199.96, None, 1000.0, side="SELL"), t3], "u", "BTCUSDT")
    assert pkt.reversion_30s_avg_bps == pytest.approx(0.25, abs=1e-6)
    assert pkt.reversion_trade_count == 2


def test_reversion_absent_without_postPrices():
    t = {"id": "t1", "orderType": "MARKET", "isMaker": False, "arrivalSlippageBps": 1.0,
         "executedAt": "2024-01-15T08:30:00Z", "side": "BUY", "executionPrice": 100.0, "notionalValue": 1000.0,
         "reversion_30s_bps": 5.0, "reversion_60s_bps": 5.0}   # the old per-trade fields are no longer read
    pkt = build_liquidity_packet([t], "u", "BTCUSDT")
    assert pkt.has_reversion_data is False
    assert pkt.reversion_30s_avg_bps == 0.0
