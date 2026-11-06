"""K1: invariants that can actually fail (hand-computed on the small packet in test_eval_invariants)."""
import json
import os
import random

from evals.invariants import NAMES, agent_evidence, check_all
from tests.test_eval_invariants import GOLDEN, failing, good


def narrative(text):
    r = good()
    r["synthesis"]["narrative"] = text
    return r


# Rendered packet values (render.format_value): maker_ratio .5 -> "50.0%", adverse_rate .11 -> "11.0%",
# avg_slippage_bps 2.4 -> "2.4 bps", total_fee_paid_usd 40.0 -> "$40.00".
def test_numeral_must_use_the_render_formatter():
    assert failing(narrative("The maker ratio was 50.0%.")) == set()
    assert failing(narrative("The maker ratio was 50%.")) == {"numerals_grounded"}   # same value, other formatter
    assert failing(narrative("The maker ratio was 0.5.")) == {"numerals_grounded"}   # raw ratio never rendered
    assert failing(narrative("Fees were $40.00.")) == set()
    assert failing(narrative("Fees were 40 dollars.")) == {"numerals_grounded"}


def test_unrelated_integer_is_not_grounded_by_chance():
    assert failing(narrative("There were 7 fills.")) == {"numerals_grounded"}
    assert failing(narrative("There were 41 fills.")) == {"numerals_grounded"}   # the old tolerance passed 41 (~40)


def test_structural_tokens_pass():
    assert failing(narrative("The p90 of slippage was 2.4 bps.")) == set()
    assert failing(narrative("The 1st fill and the 2nd fill were both makers.")) == set()
    assert failing(narrative("Findings:\n1. Fees were $40.00.\n2. Slippage was 2.4 bps.")) == set()


def test_finding_text_may_use_its_method_numbers_only():
    r = good()
    f = r["synthesis"]["findings"][0]
    f["method"] = "Replayed 4 of 9 taker fills at $12.34 notional, 3.21 bps."
    f["text"] = "These fills cost $5.00 (3.2 bps) at $12.34 notional."
    assert failing(r) == set()
    f["text"] = "These fills cost $5.00 at $99.99 notional."
    assert failing(r) == {"numerals_grounded"}


def test_required_evidence_key_must_be_cited_not_just_something():
    r = good()
    r["fee"]["recommendedAction"] = "Slippage was 2.4 bps."   # a packet value, but not fee.maker_ratio
    out = agent_evidence(r, GOLDEN)
    assert not out.ok
    assert "fee_optimizer" in out.detail and "fee.maker_ratio" in out.detail


def test_required_evidence_may_be_cited_in_flags():
    r = good()
    r["risk"]["flags"] = []
    assert not agent_evidence(r, GOLDEN).ok
    assert failing(r) == set()                       # evidence_cited is synthesis-level now
    r["risk"]["flags"] = ["Adverse selection touched 11.0% of fills."]
    assert agent_evidence(r, GOLDEN).ok


def test_synthesis_evidence_rule_is_identical_for_both_arms():
    council = good()
    single = good()
    for k in ("liquidity", "alpha", "risk", "fee"):
        single.pop(k)
    single["grounding"]["per_agent"] = {"synthesis": {"values_cited": 3}}
    for r in (council, single):
        assert failing(r) == set()                                                   # headline shows 11.0%
        r["synthesis"].update(headline="Execution was solid.", narrative="Makers were 50.0%.")   # no longer does
        assert failing(r) == {"evidence_cited"}


def test_every_invariant_has_a_mutation_that_fails_only_it():
    bad = {
        "rating_allowed": lambda r: r["synthesis"].update(overallRating="CRITICAL"),
        "evidence_cited": lambda r: r["synthesis"].update(headline="Execution was solid.", narrative="Fine."),
        "no_flagged_terms": lambda r: r["synthesis"].update(narrative="The trader should use limit orders."),
        "numerals_grounded": lambda r: r["synthesis"].update(narrative="There were 7 fills."),
        "findings_gated": lambda r: r["synthesis"]["findings"][0].update(method=""),
        "packet_provenance": lambda r: r["tradeContext"].update(risk_packet_hash="zzz"),
    }
    assert set(bad) == set(NAMES)
    assert failing(good()) == set()
    for name, mutate in bad.items():
        r = good()
        mutate(r)
        assert failing(r) == {name}, name


def test_random_integer_probe_rarely_passes_on_a_real_packet():
    path = os.path.join(os.path.dirname(__file__), "..", "evals", "golden", "demo-moderate.json")
    g = json.load(open(path))
    ints = random.Random(7).sample(range(1, 201), 200)

    def ok(n):
        r = good()
        r["synthesis"]["narrative"] = f"There were {n} fills."
        r["liquidity"]["slippageRoot"] = r["fee"]["recommendedAction"] = ""   # hand-made texts are not in this packet
        out = check_all(r, g)["numerals_grounded"]
        return out.ok

    passed = sum(ok(n) for n in ints)
    assert passed <= 0.05 * len(ints), passed
    assert ok(109) and ok(72)   # the probe can pass: integers that are rendered packet counts do
