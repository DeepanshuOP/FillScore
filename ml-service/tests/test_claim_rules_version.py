"""Claim rules have their own version (as prompt and metrics do), so a rule added later never re-judges old sets.

1.0.0: the causal connectives up to M3 ("due to", "because of", ...). 1.1.0 (2026-11-17): a bare "because" and the
other causal words that the demo serving path already refused ("therefore", "thereby", "hence", "consequently").
Measured before the change (scan of golden v1-v3, evals/recordings, demo_runs, 48 files): 4 sentences, all "because":
demo_runs/demo-aggressive (fee.recommendedAction) and three recordings (debate key_dispute of council-demo-aggressive-3,
council-demo-moderate-2 and -3). The golden sets and the two accepted demo runs hold none."""
import asyncio
import glob
import json
import os

import pytest

from agents.claims import CONNECTIVE_TERMS, CONNECTIVE_TERMS_1_0_0, flag_sentences
from config.versions import CLAIM_RULES_VERSION
from evals.invariants import no_flagged_terms
from tests.council_fakes import make_packets, make_router

ROOT = os.path.join(os.path.dirname(__file__), "..")
BECAUSE = "The trader paid $21.10 in fees because 30.9% of executions were maker orders."


def test_a_bare_because_is_flagged_under_the_current_rules_and_not_under_1_0_0():
    flags = flag_sentences(BECAUSE, set(), "narrative")
    assert [f.terms for f in flags] == [["because"]]
    assert flag_sentences(BECAUSE, set(), "narrative", rules="1.0.0") == []


def test_because_of_is_flagged_under_both_versions():
    s = "Slippage rose because of the venue."
    assert [f.terms for f in flag_sentences(s, set(), "narrative", rules="1.0.0")] == [["because of"]]
    assert [f.terms for f in flag_sentences(s, set(), "narrative")] == [["because of"]]


@pytest.mark.parametrize("word", ["therefore", "thereby", "hence", "consequently"])
def test_the_other_causal_words_are_flagged_from_1_1_0(word):
    s = f"Fees were 4.0 bps; {word} the score fell."
    assert flag_sentences(s, set(), "narrative", rules="1.0.0") == []
    assert [f.terms for f in flag_sentences(s, set(), "narrative")] == [[word]]


def test_a_lookalike_is_not_flagged():
    assert flag_sentences("The becausal chain is not claimed. Henceforth the thereabouts text.", set(), "narrative") == []


def test_an_unknown_rules_version_is_an_error_not_a_silent_default():
    with pytest.raises(ValueError):
        flag_sentences(BECAUSE, set(), "narrative", rules="9.9.9")


def test_the_current_version_names_the_current_list():
    assert CLAIM_RULES_VERSION == "1.4.0"   # 1.2.0, 1.3.0 and 1.4.0 keep the 1.1.0 connective list: see test_claim_rules_1_2_0.py, _1_3_0.py
    assert set(CONNECTIVE_TERMS_1_0_0) < set(CONNECTIVE_TERMS)
    assert CONNECTIVE_TERMS_1_0_0 == ["due to", "because of", "resulting from", "caused by", "driven by", "led to",
                                      "as a result of"]


def _result(version):
    r = {"synthesis": {"headline": "Costs were 4.0 bps.", "narrative": "Costs were 4.0 bps.", "findings": [],
                       "observations": []},
         "debate_transcript": {"key_dispute": "Prosecution argues: The fee drag was 10.0 bps because only 22.7% were maker trades."}}
    if version:
        r["claim_rules_version"] = version
    return r


def test_the_offline_check_judges_a_result_by_the_rules_it_carries():
    golden = {"packet": {"risk": {}}}
    assert no_flagged_terms(_result(None), golden).ok is True        # unstamped = recorded before 1.1.0
    assert no_flagged_terms(_result("1.0.0"), golden).ok is True
    out = no_flagged_terms(_result("1.1.0"), golden)
    assert out.ok is False and "because" in out.detail


def test_every_stored_recording_still_passes_under_its_own_rules():
    """The three recordings with a bare "because" were made under 1.0.0 and carry no stamp."""
    for f in sorted(glob.glob(os.path.join(ROOT, "evals", "recordings", "*.json"))):
        doc = json.load(open(f))
        res = doc.get("council_result") or doc.get("result") or {}
        golden = {"packet": {"risk": res.get("risk") or {}}}
        assert no_flagged_terms(res, golden).ok, f


def test_the_demo_runs_under_the_current_rules():
    """The re-check the architect asked for. Before the re-record of 2026-11-17 disciplined and moderate passed the
    claim check under 1.1.0 and aggressive did not (its fee.recommendedAction held a bare "because"; the sentence is
    the BECAUSE constant above). Aggressive was re-recorded under 1.1.0, so all three passed then.
    2026-11-19, rules 1.2.0 ("resulting in" is a causal phrasing): demo-aggressive (liquidity.slippageRoot) and
    demo-disciplined (fee.recommendedAction) fail and are no longer served; demo-moderate passes. They wait for a
    re-record (docs/PROGRESS.md).
    2026-11-20, rules 1.3.0 (specialist flags as displayed): demo-moderate's alpha flag "Unfilled Opportunity Cost
    Assessed" holds a counterfactual word, so it fails too until the re-record (item 26)."""
    outcome = {}
    for f in sorted(glob.glob(os.path.join(ROOT, "demo_runs", "*.json"))):
        doc = json.load(open(f))
        res = doc["council_result"]
        golden = {"packet": {"risk": res.get("risk") or {}}}
        outcome[doc["account_id"]] = no_flagged_terms(dict(res, claim_rules_version=CLAIM_RULES_VERSION), golden).ok
    # 2026-11-20: all three re-recorded under rules 1.3.0 (item 26) and each passes its own rules
    assert outcome == {"demo-aggressive": True, "demo-disciplined": True, "demo-moderate": True}


def test_new_runs_are_stamped_with_the_claim_rules_version():
    from agents.single_call import run_single_call
    router, _ = make_router()
    fee, risk, liq, alpha = make_packets(total_fee_paid_usd=328.0)
    out = asyncio.run(run_single_call("demo-moderate", "BTCUSDT", fee, risk, liq, alpha, router, []))
    assert out["claim_rules_version"] == CLAIM_RULES_VERSION


def test_the_council_result_model_carries_the_stamp():
    from agents.schemas import CouncilResult
    assert "claim_rules_version" in CouncilResult.model_fields
