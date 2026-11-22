"""Claim rules 1.4.0 (2026-11-22; PROGRESS item 23, option C): a bare "rather than" is a causal phrasing, beside
"inherent to" and "resulting in" (already in 1.2.0). "A rather than B" sets a stated cause against an unstated one;
no packet value supports either. Never excused by a passed finding.

Hand cases: every sentence below was written by hand. The guards are sentences that must NOT be flagged."""
import pytest

from agents.claims import CAUSAL_PHRASES_1_4_0, flag_sentences, new_rule_hits
from config.versions import CLAIM_RULES_VERSION

ALL_PASSED = frozenset({"maker_instead_of_taker", "exclude_hours", "venue_shift", "smaller_clips"})


def terms(text, rules="1.4.0", passed=frozenset()):
    return [t for f in flag_sentences(text, set(passed), "narrative", rules=rules) for t in f.terms]


def test_the_version_and_the_phrase_list():
    assert CLAIM_RULES_VERSION == "1.4.0"
    assert CAUSAL_PHRASES_1_4_0 == ["inherent to", "resulting in", "rather than"]


@pytest.mark.parametrize("text,expected", [
    ("Fills were 70% taker rather than 30% maker.", "rather than"),                 # bare: 1.2.0 let this pass
    ("The 3.0 bps cost reflects the order type rather than a routing error.", "rather than"),
    ("Rather than the venue, the 12 fills show a size effect.", "rather than"),     # sentence start, capital R
    ("The fee drag is inherent to the limit-order strategy.", "inherent to"),
    ("Fees were 4.0 bps, resulting in a fee drag of 3.0 bps.", "resulting in"),
    ("The cost was 5.0 bps rather\nthan 2.0 bps.", "rather than"),                  # a line break between the words
])
def test_phrasings_are_flagged_and_never_excused(text, expected):
    assert expected in terms(text)
    assert expected in terms(text, passed=ALL_PASSED)    # a passed finding excuses nothing here


def test_the_bare_rather_than_is_new_in_1_4_0():
    text = "Fills were 70% taker rather than 30% maker."
    assert "rather than" not in terms(text, rules="1.2.0")
    assert "rather than" not in terms(text, rules="1.3.0")
    assert "rather than" in terms(text, rules="1.4.0")


@pytest.mark.parametrize("text", [
    "The rather large fill of 3.0 BTC paid 2.0 bps.",          # "rather" alone
    "The 12 fills took longer than 5 seconds.",                # "than" alone
    "Gather than 12 fills for the hour.",                      # "gather than": "rather" is not a whole word
    "The resulting orders numbered 12.",                       # "resulting" alone
    "The result in column 3 was 4.0 bps.",                     # "result in", not "resulting in"
    "The inherent spread of the pair was 2.0 bps.",            # "inherent" without "to"
    "Fills were 70% taker and 30% maker.",                     # no contrast phrase at all
])
def test_guards_are_not_flagged(text):
    assert terms(text) == []


def test_serving_path_uses_the_current_rules():
    # new_rule_hits is what keeps an old recorded demo run from being served: "rather than" now refuses it.
    result = {"synthesis": {"headline": "Cost was 3.0 bps.", "narrative": "Fills were 70% taker rather than 30% maker.",
                            "observations": [], "findings": []}}
    assert new_rule_hits(result) == ["narrative:rather than"]
