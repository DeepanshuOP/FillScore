"""Claim rules 1.2.0 (2026-11-19). Two additions to 1.1.0, both decided from the 18 ablation recordings (item 1 of
the orders of 2026-11-19: council-demo-disciplined-5 says "inherent to the limit-order strategy rather than a routing
error", single-demo-disciplined-5 and -6 say "resulting in a fee drag", and several runs carry judgements with no
number behind them: "efficient routing", "low fee drag", "within acceptable range").

(a) causal phrasings: "inherent to", "resulting in", "led to", "drove", and "rather than ... error". Never excused by
    a passed finding (no packet value supports a cause), like the strict causal terms.
(b) unbacked judgements: an evaluative phrase about the trader's execution or the venue in a sentence that carries
    no numeral and no {{placeholder}}. The number must be in the same sentence; this is a stated limit (a number in
    another sentence does not back the judgement).

Hand cases: every sentence below was written by hand. The guards are sentences that must NOT be flagged."""
import pytest

from agents.claims import CAUSAL_PHRASES_1_2_0, flag_sentences, redact_claims
from config.versions import CLAIM_RULES_VERSION


def terms(text, rules="1.2.0", passed=frozenset()):
    return [t for f in flag_sentences(text, set(passed), "narrative", rules=rules) for t in f.terms]


def test_the_phrase_list_is_the_1_2_0_list():
    assert CLAIM_RULES_VERSION in ("1.2.0", "1.3.0")   # 1.3.0 (2026-11-20) keeps every 1.2.0 rule
    assert CAUSAL_PHRASES_1_2_0 == ["inherent to", "resulting in", "led to", "drove"]


# ---- (a) causal phrasings ------------------------------------------------------------------------------------------
@pytest.mark.parametrize("text,expected", [
    ("The fee drag is inherent to the limit-order strategy.", "inherent to"),
    ("Fees were 4.0 bps, resulting in a fee drag of 3.0 bps.", "resulting in"),
    ("Slippage of 2.0 bps led to a lower score.", "led to"),
    ("Taker fills drove the cost of 5.0 bps.", "drove"),
    ("The 3.0 bps cost reflects the order type rather than a routing error.", "rather than ... error"),
    ("The cost was market impact rather than an execution error.", "rather than ... error"),
])
def test_causal_phrasings_are_flagged_and_never_excused(text, expected):
    assert expected in terms(text)
    assert terms(text, rules="1.1.0") in ([], ["led to"])   # 1.1.0 knew only "led to" of these
    # a passed finding for every action area excuses nothing here
    assert expected in terms(text, passed={"maker_instead_of_taker", "exclude_hours", "venue_shift", "smaller_clips"})


@pytest.mark.parametrize("text", [
    "The resulting orders numbered 12.",                       # "resulting" alone
    "The result in column 3 was 4.0 bps.",                     # "result in", not "resulting in"
    "Fills were 70% taker rather than 30% maker.",             # "rather than" without "error"
    "The inherent spread of the pair was 2.0 bps.",            # "inherent" without "to"
    "The 12 fills were driven through one venue.",             # no causal claim: not in the list (driven by only)
    "The hard drive log lists 9 fills.",                       # look-alike
])
def test_causal_phrasing_guards_are_not_flagged(text):
    assert terms(text) == []


# ---- (b) unbacked judgements ---------------------------------------------------------------------------------------
@pytest.mark.parametrize("text", [
    "The trader showed efficient routing.",
    "Fee drag was low.",
    "The trader kept a low fee drag.",
    "Execution stayed within acceptable range.",
    "Spreads were high.",
    "Slippage remained acceptable.",
    "The venue offered excellent execution.",
    "Fill quality was poor.",
])
def test_unbacked_judgements_are_flagged(text):
    out = terms(text)
    assert out and out[0].startswith("unbacked: "), (text, out)
    assert terms(text, rules="1.1.0") == []


@pytest.mark.parametrize("text", [
    "Fee drag was low at 0.5 bps.",                                       # judgement with its value
    "Low fee drag of {{fee.total_fee_pct}} was measured.",                # placeholder is the value
    "Slippage was 2.0 bps, within the expected range of 1.0 to 3.0 bps.",  # measured sentence
    "The low of the day was reached before the fill.",                    # "low" is a price, not a judgement
    "The daily high and low were recorded.",
    "Maker orders paid lower fees than taker orders.",                    # comparative, not in the list
    "The trader placed orders on one venue.",
    "No claim is made about routing.",
])
def test_unbacked_judgement_guards_are_not_flagged(text):
    assert terms(text) == []


def test_a_flagged_sentence_is_redacted_under_the_current_rules():
    text = "Fees were 4.0 bps. The trader showed efficient routing."
    cleaned, flags = redact_claims(text, set(), "narrative")
    assert cleaned == "Fees were 4.0 bps."
    assert [f.sentence_index for f in flags] == [1]


def test_old_versions_are_judged_by_their_own_rules():
    s = "The fee drag is inherent to the strategy."
    assert terms(s, rules="1.0.0") == [] and terms(s, rules="1.1.0") == [] and terms(s, rules="1.2.0")
