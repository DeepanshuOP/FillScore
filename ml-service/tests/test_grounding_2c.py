"""Phase 2c A1 (duplicate-value strip) and A5 (percentile labels). Values are hand-computed."""
import pytest

from agents.grounding import GroundingLedger, check, strip_duplicates

# format_value: pct_negative_slippage 0.426 -> 0.426*100 = 42.6 -> "42.6%"; fee_drag_bps 10.0 -> "10.0 bps";
# p90_slippage_bps 17.6 -> "17.6 bps"
CTX = {
    "liquidity": {"pct_negative_slippage": 0.426, "p90_slippage_bps": 17.6},
    "fee": {"fee_drag_bps": 10.0},
}
CTX_41 = {"liquidity": {"pct_negative_slippage": 0.41}}


def test_matching_numeral_next_to_placeholder_is_stripped_and_passes():
    t = "Negative slippage in 42.6% of trades, {{liquidity.pct_negative_slippage}} of fills."
    out, n = strip_duplicates(t, CTX)
    assert n == 1
    assert "42.6%" not in out.replace("{{liquidity.pct_negative_slippage}}", "")
    assert not check(out, CTX).violations
    assert check(out, CTX).rendered.count("42.6%") == 1


def test_same_sentence_with_a_different_rendered_value_is_flagged():
    # 0.41*100 = 41.0 -> "41.0%" != "42.6%": nothing stripped, grounding flags the raw 42.6%
    t = "Negative slippage in 42.6% of trades, {{liquidity.pct_negative_slippage}} of fills."
    out, n = strip_duplicates(t, CTX_41)
    assert n == 0 and out == t
    assert [v.token for v in check(out, CTX_41).violations] == ["42.6%"]


def test_bps_value_with_space_unit_is_stripped():
    out, n = strip_duplicates("Fee drag was 10.0 bps {{fee.fee_drag_bps}} overall.", CTX)
    assert n == 1
    assert check(out, CTX).rendered == "Fee drag was 10.0 bps overall."


def test_numeral_two_clauses_away_is_not_stripped():
    t = "It was 42.6%, in short, then {{liquidity.pct_negative_slippage}}."
    out, n = strip_duplicates(t, CTX)
    assert n == 0 and out == t


def test_non_matching_numeral_never_stripped():
    t = "Across 17 trades, {{liquidity.pct_negative_slippage}} were negative."
    out, n = strip_duplicates(t, CTX)
    assert n == 0 and out == t
    assert [v.token for v in check(out, CTX).violations] == ["17"]


def test_ledger_counts_strips_in_grounded_complete():
    import asyncio
    from pydantic import BaseModel

    class M(BaseModel):
        text: str

    class LLM:
        async def complete(self, *a, **k):
            return M(text="Negative in 42.6% of trades, {{liquidity.pct_negative_slippage}}.")

    from agents.grounding import grounded_complete
    led = GroundingLedger()
    out = asyncio.run(grounded_complete(
        LLM(), "debate", "s", "u", M, agent="defense",
        fields=lambda o: {"text": o.text}, apply=lambda o, t: M(text=t["text"]),
        ctx_for=lambda _p: CTX, ledger=led, max_tokens=10))
    assert led.duplicates_stripped == 1 and led.regenerations == 0
    assert led.to_dict(False)["duplicates_stripped"] == 1
    assert not check(out.text, CTX).violations


def test_percentile_labels_allowed_bare_but_counts_still_flag():
    assert not check("a p90 of {{liquidity.p90_slippage_bps}}", CTX).violations
    for lab in ("p50", "p75", "p95", "p99"):
        assert not check(f"the {lab} fill", CTX).violations
    assert [v.token for v in check("90 trades", CTX).violations] == ["90"]
    assert [v.token for v in check("p90 of 90 trades", CTX).violations] == ["90"]
