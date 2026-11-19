"""Claim rules 1.3.0 (2026-11-20, orders item 27). One addition to 1.2.0: the specialists' flags, as the card shows
them (humanised), go through the counterfactual and advice word lists. Found on the recorded demo-moderate run, whose
alpha flag `unfilled_opportunity_cost_assessed` is displayed as "Unfilled Opportunity Cost Assessed" ("opportunity" is
a counterfactual word) while the rules up to 1.2.0 never read flags.

Humanising is the same as frontend/app/utils/councilStatus.ts `flagLabel`: a fixed map (three tags), else a snake_case
tag is split on "_" and each word capitalised, else (a sentence) the text is shown as it is.

A flag is never excused by a passed finding: no packet value backs a flag. Hand cases only; every string was written by
hand. The guards are flags that must NOT be flagged."""
import pytest

from agents.claims import flag_hits_1_3_0, flag_terms_1_3_0, humanise_flag, new_rule_hits
from config.versions import CLAIM_RULES_VERSION


def test_the_version_is_1_3_0():
    assert CLAIM_RULES_VERSION == "1.3.0"


@pytest.mark.parametrize("tag,shown", [
    ("unfilled_opportunity_cost_assessed", "Unfilled Opportunity Cost Assessed"),   # the recorded demo-moderate flag
    ("high_maker_participation", "High Maker Participation"),
    ("no_vwap_benchmark_available", "No Vwap Benchmark Available"),
    ("agent_failed", "Agent unavailable"),                                          # fixed map
    ("zero_market_orders", "No market orders"),
    ("single_symbol_concentration", "Single-symbol concentration"),
    ("Notional was concentrated, with the top symbol at 100.0% of the total.",
     "Notional was concentrated, with the top symbol at 100.0% of the total."),    # a sentence passes through
    ("Mixed_Case", "Mixed_Case"),                                                   # not a snake_case tag: as it is
])
def test_humanise_matches_the_card(tag, shown):
    assert humanise_flag(tag) == shown


@pytest.mark.parametrize("tag,expected", [
    ("unfilled_opportunity_cost_assessed", ["opportunity"]),
    ("missed_fills", ["missed"]),
    ("saved_fees", ["saved"]),
    ("avoidable_taker_fees", ["avoidable"]),
    ("recommend_maker_orders", ["recommend"]),
    ("should_use_limit_orders", ["should"]),
    ("consider_other_venue", ["consider"]),
    ("trader needs to widen limits", ["needs to"]),                # a sentence flag
    ("You should diversify across symbols.", ["should"]),
])
def test_counterfactual_and_advice_words_in_a_flag_are_found(tag, expected):
    assert flag_terms_1_3_0(tag) == expected


@pytest.mark.parametrize("tag", [
    "high_maker_participation",
    "low_fee_drag",
    "no_vwap_benchmark_available",
    "zero_market_orders",
    "single_symbol_concentration",
    "agent_failed",
    "consideration_pending",          # "consider" is only a prefix of the word "consideration"
    "mustang_symbol",                 # "must" inside a word
    "opportunist_fills",              # "opportunist" is not "opportunity"
    "needs_review",                   # "needs" without "to"
    "Notional was concentrated, with the top symbol at 100.0% of the total.",
    "Symbol HHI was 1.00, indicating complete concentration in a single instrument.",
    "",
])
def test_guards_are_not_flagged(tag):
    assert flag_terms_1_3_0(tag) == []


def result_with(**flags):
    return {k: {"flags": v} for k, v in flags.items()}


def test_hits_name_the_specialist_the_index_and_the_terms_only():
    res = result_with(alpha=["no_vwap_benchmark_available", "unfilled_opportunity_cost_assessed"],
                      fee=["high_maker_participation", "low_fee_drag"],
                      risk=["Adverse selection exposure was minimal, with an adverse rate of 0.0%.", "should_rebalance"])
    # hand count: alpha.flags.1 (opportunity) and risk.flags.1 (should); nothing else
    assert flag_hits_1_3_0(res) == ["alpha.flags.1:opportunity", "risk.flags.1:should"]


def test_a_result_with_no_flags_or_odd_shapes_has_no_hits():
    assert flag_hits_1_3_0({}) == []
    assert flag_hits_1_3_0({"alpha": None, "fee": {"flags": None}, "risk": {"flags": [None, 3]}}) == []


def test_flags_are_part_of_the_serving_check_but_the_ledgers_are_not():
    assert new_rule_hits(result_with(alpha=["unfilled_opportunity_cost_assessed"])) == ["alpha.flags.0:opportunity"]
    assert new_rule_hits({"claims": {"redactions": [{"terms": ["opportunity"]}]}}) == []
    # a passed verified finding excuses nothing about a flag
    res = {"alpha": {"flags": ["missed_fills"]},
           "synthesis": {"findings": [{"action_type": "maker_instead_of_taker", "verified": True, "text": "x"}]}}
    assert new_rule_hits(res) == ["alpha.flags.0:missed"]
