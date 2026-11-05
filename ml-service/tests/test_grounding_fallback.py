"""1d.4: a required explanation emptied by redaction is replaced by a code-built sentence.

Expected values are hand-computed: avg_slippage_bps 7.26 renders as "7.3 bps" (1 dp).
"""
import asyncio

import pytest

from agents.grounded_call import grounded_verdict
from agents.grounding import GroundingFailed, GroundingLedger
from agents.schemas import AlphaVerdict, FeeVerdict, LiquidityVerdict

LIQ_CTX = {"liquidity": {"avg_slippage_bps": 7.26, "worst_hour_utc": 8}}
FEE_CTX = {"fee": {"fee_drag_bps": 10.04, "maker_ratio": 0.2222}}
ALPHA_CTX = {"alpha": {"avg_vwap_deviation_bps": 3.14}}


def liq(text, rating="GOOD"):
    return {"agent": "liquidity_scout", "liquidityRating": rating, "slippageRoot": text,
            "cited_evidence": [], "severity": "LOW", "confidence": 0.8, "flags": []}


class Scripted:
    def __init__(self, payloads, schema):
        self.payloads, self.schema, self.n = list(payloads), schema, 0

    async def complete(self, role, system, user, schema, *, max_tokens, temperature=0.1, telemetry=None):
        self.n += 1
        return self.schema.model_validate(self.payloads.pop(0))


def run_liq(payloads, ctx=LIQ_CTX):
    ledger = GroundingLedger()
    llm = Scripted(payloads, LiquidityVerdict)
    v = asyncio.run(grounded_verdict(
        llm, "specialist", "s", "u", LiquidityVerdict, agent="liquidity_scout", text_field="slippageRoot",
        ctx=ctx, ledger=ledger, max_tokens=100, namespace="liquidity",
        fallback=("Liquidity", "liquidityRating", "liquidity.avg_slippage_bps")))
    return v, ledger, llm


def test_liquidity_fallback_text():
    v, ledger, llm = run_liq([liq("Slippage averaged 7.3 bps."), liq("Slippage averaged 7.3 bps.")])
    assert v.slippageRoot == "Liquidity verdict: GOOD; average slippage 7.3 bps."
    d = ledger.to_dict(False)
    assert d["fallbacks"] == [{"agent": "liquidity_scout", "field": "slippageRoot", "fallback_text": True}]
    assert len(d["redactions"]) == 1 and llm.n == 2
    assert d["per_agent"]["liquidity_scout"]["fallback_text"] is True


def test_regeneration_fixes_it_no_fallback():
    v, ledger, _ = run_liq([liq("Slippage averaged 7.3 bps."), liq("Slippage averaged {{liquidity.avg_slippage_bps}}.")])
    assert v.slippageRoot == "Slippage averaged 7.3 bps."
    d = ledger.to_dict(False)
    assert d["fallbacks"] == [] and d["per_agent"]["liquidity_scout"]["fallback_text"] is False


def test_partial_redaction_keeps_the_clean_sentence():
    t = "Fills were mostly limit orders. Slippage averaged 7.3 bps."
    v, ledger, _ = run_liq([liq(t), liq(t)])
    assert v.slippageRoot == "Fills were mostly limit orders."
    d = ledger.to_dict(False)
    assert d["fallbacks"] == [] and len(d["redactions"]) == 1


def test_metric_unavailable_uses_rating_only():
    ctx = {"liquidity": {"avg_slippage_bps": None, "worst_hour_utc": 8}}
    v, ledger, _ = run_liq([liq("Slippage averaged 7.3 bps."), liq("Slippage averaged 7.3 bps.")], ctx)
    assert v.slippageRoot == "Liquidity verdict: GOOD."
    assert len(ledger.to_dict(False)["fallbacks"]) == 1


def test_no_fallback_param_still_raises():
    ledger = GroundingLedger()
    llm = Scripted([liq("Slippage averaged 7.3 bps.")] * 2, LiquidityVerdict)
    with pytest.raises(GroundingFailed):
        asyncio.run(grounded_verdict(
            llm, "specialist", "s", "u", LiquidityVerdict, agent="liquidity_scout", text_field="slippageRoot",
            ctx=LIQ_CTX, ledger=ledger, max_tokens=100, namespace="liquidity", fallback=None))


def test_fee_fallback():
    p = {"agent": "fee_optimizer", "feeRating": "WASTEFUL", "recommendedAction": "Fees were 10 bps of notional.",
         "cited_evidence": [], "severity": "LOW", "confidence": 0.8, "flags": []}
    ledger = GroundingLedger()
    v = asyncio.run(grounded_verdict(
        Scripted([p, p], FeeVerdict), "specialist", "s", "u", FeeVerdict, agent="fee_optimizer",
        text_field="recommendedAction", ctx=FEE_CTX, ledger=ledger, max_tokens=100, namespace="fee",
        fallback=("Fee", "feeRating", "fee.fee_drag_bps")))
    assert v.recommendedAction == "Fee verdict: WASTEFUL; fee drag 10.0 bps."   # 10.04 -> 1 dp
    assert ledger.to_dict(False)["fallbacks"] == [
        {"agent": "fee_optimizer", "field": "recommendedAction", "fallback_text": True}]


def test_alpha_fallback():
    p = {"agent": "alpha_architect", "alphaRating": "NEUTRAL", "bestAlternative": "It was 3 bps off.",
         "cited_evidence": [], "severity": "LOW", "confidence": 0.8, "flags": []}
    ledger = GroundingLedger()
    v = asyncio.run(grounded_verdict(
        Scripted([p, p], AlphaVerdict), "specialist", "s", "u", AlphaVerdict, agent="alpha_architect",
        text_field="bestAlternative", ctx=ALPHA_CTX, ledger=ledger, max_tokens=100, namespace="alpha",
        fallback=("Alpha", "alphaRating", "alpha.avg_vwap_deviation_bps")))
    assert v.bestAlternative == "Alpha verdict: NEUTRAL; average VWAP deviation 3.1 bps."
    assert ledger.to_dict(False)["fallbacks"][0]["agent"] == "alpha_architect"


# ── prompt examples use real, renderable keys and pass the number check ──
def test_specialist_prompt_examples_render_against_a_real_packet():
    import re

    from agents import alpha_architect, fee_optimizer, liquidity_scout, risk_auditor
    from agents.grounding import check
    from agents.synthesis import packet_ctx_of
    from tests.council_fakes import make_packets

    ctx = packet_ctx_of(*make_packets())
    ctx["liquidity"]["worst_hour_utc"] = 8     # the empty fixture packet has the -1 "unavailable" sentinel
    for mod in (liquidity_scout, alpha_architect, fee_optimizer, risk_auditor):
        line = next(ln for ln in mod.SYSTEM_PROMPT.splitlines() if ln.startswith("Example:"))
        good = line.split("  Wrong:")[0]
        phs = re.findall(r"\{\{([a-z_.0-9]+)\}\}", good)
        assert phs and all(p.startswith(mod.NAMESPACE + ".") for p in phs), mod.__name__
        c = check(good, ctx)
        assert c.violations == [] and c.n_rendered == len(phs), (mod.__name__, c.violations)


def test_prompt_version_bumped():
    from config.versions import PROMPT_VERSION
    assert PROMPT_VERSION == "1.5.0"


def test_pipeline_stray_numeral_in_both_scout_answers_does_not_degrade():
    from tests.council_fakes import LIQUIDITY
    from tests.test_council_grounded import _run

    stray = dict(LIQUIDITY, slippageRoot="Slippage averaged 7.3 bps.")
    result, *_ = _run({"liquidity_scout": stray})
    assert result.degraded is False
    assert result.n_calls_ok == result.n_calls_expected
    assert result.liquidity.slippageRoot == "Liquidity verdict: GOOD; average slippage 0.0 bps."
    assert [f["agent"] for f in result.grounding["fallbacks"]] == ["liquidity_scout"]
