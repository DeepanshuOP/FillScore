"""Blocking-grounding core tests. Expected values are hand-computed (see inline arithmetic).

Replaces the old report-only tests (TestNumericExtraction, check_grounding / check_all_verdicts /
summarise_grounding / _packet_numeric_values tests), which asserted removed behaviour.
"""
import asyncio

import pytest
from pydantic import BaseModel

from agents.grounding import (
    Check, GroundingFailed, GroundingLedger, Redaction, Violation, check, extract_numerals,
    feedback, finalize, grounded_complete, redact, split_sentences, suggest_placeholder,
)

CTX = {
    "fee": {"maker_ratio": 0.2222, "total_fee_paid_usd": 1234.5678, "fee_drag_bps": 10.04,
            "trade_count": 1234, "content_hash": "ab12cd34", "evidence_counts": {"taker_trades": 14}},
    "liquidity": {"avg_slippage_bps": 7.26, "worst_hour_utc": 8, "best_hour_utc": -1,
                  "worst5_slippage_bps": [12.34, 10.0], "market_order_count": 14},
    "risk": {"symbol_hhi": 0.3751, "top_symbol_by_notional": "BTCUSDT",
             "symbol_notional_shares": {"BTCUSDT": 0.75}},
    "alpha": {"best_hour_avg_score": 70.0}, "cf": {"effect_usd": -2.95, "n_trades_affected": 2},
}


def toks(text):
    return [n.text for n in extract_numerals(text)]


@pytest.mark.parametrize("text,expected", [
    ("paid $1,234.56 in fees", ["$1,234.56"]),
    ("slippage of -12.5 bps", ["-12.5 bps"]),
    ("maker share was 22%", ["22%"]),
    ("a 3x jump", ["3x"]),
    ("between 10-20 trades", ["10-20"]),
    ("10–20", ["10–20"]),
    ("twelve trades and Two venues", ["twelve", "Two"]),
    ("0.5 and .75", ["0.5", ".75"]),
    ("at 08:00", ["08:00"]),
    ("the 1st fill", ["1st"]),
    ("10k notional", ["10k"]),
    ("twenty", ["twenty"]),
    ("within 24h of", []),
    ("a 24-hour window", []),
    # 1c.10 F2: digits an LLM wrote inside identifiers ARE numerals now (was: ignored when a letter precedes)
    ("claim D1 and BTC2USDT and savings_at_050_usd", ["1", "2USDT"]),   # was []
    ("1000PEPEUSDT", ["1000PEPEUSDT"]),                                  # was []
    ("thirty", ["thirty"]),                                              # was []
    ("someone alone done", []),
    ("48h", ["48h"]),
])
def test_extract(text, expected):
    assert toks(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("over 30d", ["30d"]), ("at 5pm", ["5pm"]), ("in 3days", ["3days"]), ("50bp", ["50bp"]),
    ("the p95 fill", ["95"]), ("top5 trades", ["5"]), ("v2", ["2"]),
    ("thirty trades", ["thirty"]), ("a dozen fills", ["dozen"]), ("one hundred", ["one", "hundred"]),
    ("Fifty THOUSAND million billion forty sixty seventy eighty ninety",
     ["Fifty", "THOUSAND", "million", "billion", "forty", "sixty", "seventy", "eighty", "ninety"]),
    ("within 24h of", []), ("a 24-hour window", []), ("savings_at_050_usd", []),
    ("half the fills", []), ("double-counted", []), ("twice as many", []),
])
def test_extract_glued_letters_and_number_words(text, expected):
    assert toks(text) == expected


def test_a_letter_glued_after_a_rendered_value_is_a_violation():
    ctx = {"fee": {"total_fee_paid_usd": 328.0, "maker_ratio": 0.5}, "liquidity": {"avg_slippage_bps": 4.0}}
    c = check("Fees were {{fee.total_fee_paid_usd}}k.", ctx)
    assert [(v.kind, v.token) for v in c.violations] == [("numeral", "$328.00k")]
    assert check("Fees were {{fee.total_fee_paid_usd}}.", ctx).violations == []
    assert check("Slip {{liquidity.avg_slippage_bps}} bps, ok", ctx).violations == []
    assert check("{{fee.maker_ratio}}%", ctx).violations == []


def test_extract_positions():
    n = extract_numerals("ab 12 cd")[0]
    assert (n.text, n.start, n.end) == ("12", 3, 5)


def test_check():
    c = check("Maker share was {{fee.maker_ratio}} across 14 fills at {{liquidity.worst_hour_utc}}.", CTX)
    assert c.rendered == "Maker share was 22.2% across 14 fills at 08:00 UTC."
    assert [(v.kind, v.token) for v in c.violations] == [("numeral", "14")]
    assert c.n_rendered == 2


def test_check_two_rendered_values_in_range_ok():
    c = check("from {{fee.total_fee_paid_usd}} to {{cf.effect_usd}}", CTX)
    assert c.violations == []


def test_split_sentences():
    assert split_sentences("A is {{fee.maker_ratio}}. B was 0.5! C?") == [
        "A is {{fee.maker_ratio}}.", "B was 0.5!", "C?"]


def test_redact():
    tpl = ("Slippage averaged {{liquidity.avg_slippage_bps}}. "
           "Twelve fills clustered at {{liquidity.worst_hour_utc}}. Fees were {{fee.nope}}.")
    cleaned, reds = redact(tpl, CTX, "liquidity_scout", "slippageRoot")
    assert cleaned == "Slippage averaged {{liquidity.avg_slippage_bps}}."
    assert [(r.sentence_index, r.n_tokens, r.kinds) for r in reds] == [
        (1, 1, ["numeral"]), (2, 1, ["unknown_placeholder"])]
    assert reds[0].agent == "liquidity_scout" and reds[0].field == "slippageRoot"
    assert not hasattr(reds[0], "text")


@pytest.mark.parametrize("token,expected", [
    ("7.3 bps", "{{liquidity.avg_slippage_bps}}"),
    ("22.2%", "{{fee.maker_ratio}}"),
    ("$1,234.57", "{{fee.total_fee_paid_usd}}"),
    ("Twelve", None),
    ("14", "{{fee.evidence_counts.taker_trades}}"),
])
def test_suggest(token, expected):
    assert suggest_placeholder(token, CTX) == expected


def test_feedback():
    vs = [Violation("numeral", "7.3 bps"), Violation("numeral", "Twelve"),
          Violation("unknown_placeholder", "{{fee.nope}}")]
    assert feedback(vs, CTX) == (
        'Your previous answer contained numbers that were not written as placeholders: '
        '"7.3 bps" (use {{liquidity.avg_slippage_bps}}), "Twelve" (no packet value matches; remove it). '
        'Unknown placeholders: {{fee.nope}}. Rewrite the answer: never write digits or number words; '
        'refer to values only with placeholders from the list.')


@pytest.mark.parametrize("tpl", [
    "Slippage 7.3 bps. Fine {{fee.maker_ratio}}. Bad {{x.y}}. Stray {{foo}} here. Open {{ later",
    "Ten fills. {{fee.content_hash}} was odd. All good {{fee.trade_count}}.",
    "", "No numbers here.", "Between 10-20 and 3x and 08:00 happened.",
])
def test_finalize_guarantee(tpl):
    ledger = GroundingLedger()
    out = finalize(tpl, CTX, "a", "f", ledger)
    assert "{{" not in out and "}}" not in out
    # every numeral must sit inside renderer output: re-check the (already rendered) text has none
    # outside the values the renderer inserted; a clean template re-checks with zero violations
    cleaned, _ = redact(tpl, CTX, "a", "f")
    assert check(cleaned, CTX).violations == []


def test_finalize_values():
    ledger = GroundingLedger()
    out = finalize("Fine {{fee.maker_ratio}}. Bad 5 fills.", CTX, "a", "f", ledger)
    assert out == "Fine 22.2%."
    assert len(ledger.redactions) == 1


# ── ledger ──
def test_ledger_to_dict_numbers():
    L = GroundingLedger()
    first = [Check("x", [Violation("numeral", "1")], 1)]
    final = [Check("y", [], 3)]
    L.record("a", 1, first, final, True)
    d = L.to_dict(degraded=False)
    assert d["violations_first_pass"] == 1
    assert d["faithfulness_first_pass"] == 0.5          # 1/(1+1)
    assert d["faithfulness_after"] == 1.0               # 3/(3+0)
    assert d["numbers_checked"] == 3
    assert d["per_agent"]["a"] == {"violations_first_pass": 1, "regenerated": True, "faithfulness_after": 1.0,
                                    "fallback_text": False}
    assert L.to_dict(degraded=True)["faithfulness_after"] is None
    # 1c.10 F4: a degraded run reports no per-agent faithfulness either
    dd = L.to_dict(degraded=True)
    assert dd["per_agent"]["a"] == {"violations_first_pass": 1, "regenerated": True, "faithfulness_after": None,
                                     "fallback_text": False}
    assert dd["faithfulness_first_pass"] == 0.5 and dd["violations_first_pass"] == 1


def test_ledger_number_free_is_none():
    L = GroundingLedger()
    c = [Check("Most fills were taker orders.", [], 0)]
    L.record("a", 1, c, c, False)
    d = L.to_dict(degraded=False)
    assert d["faithfulness_after"] is None and d["faithfulness_first_pass"] is None
    assert d["numbers_checked"] == 0


def test_grounding_failed():
    e = GroundingFailed("risk_auditor", "x")
    assert (e.agent, e.field) == ("risk_auditor", "x") and isinstance(e, Exception)


# ── grounded_complete ──
class V(BaseModel):
    slippageRoot: str
    flags: list[str] = []


class FakeLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.users = []

    async def complete(self, role, system, user, schema, *, max_tokens, temperature=0.1, telemetry=None):
        self.users.append(user)
        r = self.replies.pop(0)
        if isinstance(r, Exception):
            raise r
        return V(slippageRoot=r)


def run_gc(replies, allow_regen=True):
    llm, ledger = FakeLLM(replies), GroundingLedger()
    out = asyncio.run(grounded_complete(
        llm, "specialist", "sys", "usr", V, agent="liquidity_scout",
        fields=lambda m: {"slippageRoot": m.slippageRoot},
        apply=lambda m, d: m.model_copy(update={"slippageRoot": d["slippageRoot"]}),
        ctx_for=lambda p: CTX, ledger=ledger, max_tokens=100, allow_regen=allow_regen))
    return out, llm, ledger


def test_gc_regenerate_then_redact():
    out, llm, L = run_gc([
        "Slippage averaged 7.3 bps across {{liquidity.market_order_count}} fills.",
        "Slippage averaged {{liquidity.avg_slippage_bps}}. Twelve fills were worst at {{liquidity.worst_hour_utc}}."])
    assert out.slippageRoot == "Slippage averaged {{liquidity.avg_slippage_bps}}."
    assert finalize(out.slippageRoot, CTX, "a", "f", GroundingLedger()) == "Slippage averaged 7.3 bps."
    assert len(llm.users) == 2
    assert '"7.3 bps"' in llm.users[1] and "{{liquidity.avg_slippage_bps}}" in llm.users[1]
    d = L.to_dict(degraded=False)
    assert d["violations_first_pass"] == 1 and d["regenerations"] == 1
    assert d["redactions"] == [{"agent": "liquidity_scout", "field": "slippageRoot",
                                "sentence_index": 1, "n_tokens": 1, "kinds": ["numeral"]}]
    assert d["faithfulness_after"] == 0.6667            # 2/(2+1)
    assert d["faithfulness_first_pass"] == 0.5          # 1/(1+1)


def test_gc_regen_fixes():
    out, llm, L = run_gc(["It was 7.3 bps.", "It was {{liquidity.avg_slippage_bps}}."])
    assert out.slippageRoot == "It was {{liquidity.avg_slippage_bps}}."
    d = L.to_dict(degraded=False)
    assert d["redactions"] == [] and d["regenerations"] == 1
    assert d["faithfulness_after"] == 1.0 and d["faithfulness_first_pass"] == 0.0


def test_gc_clean_first_time():
    out, llm, L = run_gc(["It was {{liquidity.avg_slippage_bps}}."])
    assert len(llm.users) == 1 and L.regenerations == 0


def test_gc_regen_raises_redacts_first():
    out, llm, L = run_gc(["It was 7.3 bps. Worst at {{liquidity.worst_hour_utc}}.", RuntimeError("boom")])
    assert out.slippageRoot == "Worst at {{liquidity.worst_hour_utc}}."
    d = L.to_dict(degraded=False)
    assert d["regenerations"] == 1 and len(d["redactions"]) == 1


def test_gc_emptied_field():
    out, llm, L = run_gc(["It was 7 bps.", "Still 7 bps."])
    assert out.slippageRoot == ""


def test_gc_no_regen():
    out, llm, L = run_gc(["It was 7.3 bps. Worst at {{liquidity.worst_hour_utc}}."], allow_regen=False)
    assert len(llm.users) == 1 and L.regenerations == 0
    assert out.slippageRoot == "Worst at {{liquidity.worst_hour_utc}}."
    assert len(L.redactions) == 1


def test_gc_number_free():
    out, llm, L = run_gc(["Most fills were taker orders."])
    d = L.to_dict(degraded=False)
    assert d["faithfulness_after"] is None
    L2 = GroundingLedger()
    c = [Check("a", [], 2)]
    L2.record("x", 1, c, c, False)
    assert L2.to_dict(degraded=True)["faithfulness_after"] is None


# ── 1d.4 closed glossary allowlist ──
import dataclasses

from agents.grounding import GLOSSARY
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket

_PACKETS = {"liquidity": LiquidityMetricsPacket, "alpha": AlphaMetricsPacket, "risk": RiskMetricsPacket}
_EXPECTED_GLOSSARY = {
    "5-minute VWAP": "alpha.avg_vwap_deviation_bps", "five-minute VWAP": "alpha.avg_vwap_deviation_bps",
    "30s reversion": "liquidity.reversion_30s_avg_bps", "30-second reversion": "liquidity.reversion_30s_avg_bps",
    "60s reversion": "liquidity.reversion_60s_avg_bps", "60-second reversion": "liquidity.reversion_60s_avg_bps",
    "30s and 60s reversion": "liquidity.reversion_30s_avg_bps", "30s/60s reversion": "liquidity.reversion_30s_avg_bps",
    "top 5 worst trades": "liquidity.worst5_slippage_bps", "five worst trades": "liquidity.worst5_slippage_bps",
    "p90 slippage": "liquidity.p90_slippage_bps", "p90 trade size": "risk.p90_trade_usd",
}


def test_glossary_is_the_closed_table():
    assert GLOSSARY == _EXPECTED_GLOSSARY


@pytest.mark.parametrize("phrase", list(_EXPECTED_GLOSSARY))
def test_glossary_phrase_alone_is_clean(phrase):
    assert extract_numerals(phrase) == []
    assert extract_numerals(phrase.upper()) == []        # case-insensitive
    assert check(phrase, {}).violations == []
    assert check(f"The {phrase}.", {}).violations == []


@pytest.mark.parametrize("phrase,metric", list(_EXPECTED_GLOSSARY.items()))
def test_glossary_metric_is_a_real_packet_field(phrase, metric):
    ns, name = metric.split(".")
    assert name in {f.name for f in dataclasses.fields(_PACKETS[ns])}


@pytest.mark.parametrize("text,expected", [
    ("5", ["5"]), ("30", ["30"]), ("the 30s window", ["30s"]), ("5-minute", ["5"]), ("five", ["five"]),
    ("30s reversion of 12 bps", ["12 bps"]), ("top 5 trades", ["5"]), ("p90", ["90"]),
    ("5-minute VWAPs", ["5"]),                      # plural: not word-bounded, still flagged
    ("a 30s reversion and a 30s window", ["30s"]),  # only the glossary span is exempt
])
def test_non_glossary_numerals_still_flagged(text, expected):
    assert [v.token for v in check(text, {}).violations] == expected


def test_glossary_phrase_next_to_placeholder():
    c = check("Slippage on the 5-minute VWAP was {{liquidity.avg_slippage_bps}}.", CTX)
    assert c.violations == [] and c.rendered == "Slippage on the 5-minute VWAP was 7.3 bps."


def test_redaction_removes_only_the_offending_sentence():
    tpl = "Fills were clean. Slippage hit 7.3 bps at {{liquidity.worst_hour_utc}}. Most fills were limit orders."
    cleaned, reds = redact(tpl, CTX, "liquidity_scout", "slippageRoot")
    assert cleaned == "Fills were clean. Most fills were limit orders."
    assert reds == [Redaction("liquidity_scout", "slippageRoot", 1, 1, ["numeral"])]
