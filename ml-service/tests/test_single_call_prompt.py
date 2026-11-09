"""K2: the single-call arm has its own prompt: same packet/placeholders/schema/safety text as the Council
judge, no specialist/debate/ledger wording, so the only difference is the reasoning structure."""
import asyncio
import hashlib
import re

from agents import prompts, single_call, synthesis
from agents.schemas import TradeContext
from agents.single_call import SINGLE_CALL_SYSTEM_PROMPT, build_single_user_prompt, run_single_call
from tests.council_fakes import make_packets, make_router

FORBIDDEN = ("specialist", "judge", "council", "debate", "ledger", "conflict", "verdict", "prosecution", "defense",
             "trial", "untrusted", "agent", "risk auditor", "fee optimizer", "liquidity scout", "alpha architect",
             "other model", "signal")


def test_council_prompt_is_unchanged_by_the_refactor():
    # sha256 of SYNTHESIS_SYSTEM_PROMPT: if this changes, bump PROMPT_VERSION
    # 4R-0c: regime matrix replaced by one priority line (was 161856d4...)
    got = hashlib.sha256(synthesis.SYNTHESIS_SYSTEM_PROMPT.encode()).hexdigest()
    assert got == "10fd1ee8d67f0de34356b1719b4778aaee3bf18edd1dbd84e67c0c15dae1c4a2"


def test_single_prompt_has_no_specialist_or_ledger_terms():
    fee, risk, liq, alpha = make_packets()
    ctx = TradeContext(userId="u", symbol="BTCUSDT", regime="STABLE", trade_count=1)
    user = build_single_user_prompt(ctx, fee, risk, liq, alpha, [])
    for text in (SINGLE_CALL_SYSTEM_PROMPT, user):
        low = text.lower()
        for term in FORBIDDEN:
            assert term not in low, term


def test_shared_parts_are_the_same_objects_in_both_prompts():
    for part in (prompts.SYNTH_WRITING_RULES, prompts.SYNTH_COST_RULE, prompts.SYNTH_JSON_ONLY, prompts.AUDIT_PREAMBLE):
        assert part in SINGLE_CALL_SYSTEM_PROMPT and part in synthesis.SYNTHESIS_SYSTEM_PROMPT


def test_single_prompt_user_content_has_same_packet_actions_and_schema_fields():
    fee, risk, liq, alpha = make_packets()
    ctx = TradeContext(userId="u", symbol="BTCUSDT", regime="STABLE", trade_count=1)
    single = build_single_user_prompt(ctx, fee, risk, liq, alpha, [])
    council = synthesis.build_user_prompt(ctx, {}, fee, risk, liq, alpha, None, [])
    packet = lambda s: s[s.index("PACKET VALUES"):s.index("ACTIONS")]
    actions = lambda s: s[s.index("ACTIONS"):s.index("Produce the")]
    assert packet(single) == packet(council) and actions(single) == actions(council)
    for field in ("headline", "narrative", "recommendations", "overallRating"):
        assert field in single


def test_every_model_call_of_the_single_arm_uses_the_single_prompt():
    # the verifier's re-reason call must not fall back to the Council judge prompt
    router, provider = make_router()
    fee, risk, liq, alpha = make_packets(total_fee_paid_usd=328.0)
    asyncio.run(run_single_call("demo-moderate", "BTCUSDT", fee, risk, liq, alpha, router, []))
    assert provider.calls
    for c in provider.calls:
        system = c["messages"][0]["content"]
        assert system == SINGLE_CALL_SYSTEM_PROMPT
        assert not re.search(r"specialist|ledger", system, re.I)
