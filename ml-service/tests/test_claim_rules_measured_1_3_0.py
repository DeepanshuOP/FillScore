"""Orders item 27 (2026-11-20): the measured, NOT gated, invariant is extended to rules 1.3.0. The 1.2.0 column stays and
keeps its meaning (rules pinned at 1.2.0, flags not read), so the 1.2.0 results are reported as they were."""
from evals import run_offline
from evals.invariants import CHECKS, NAMES, claim_rules_1_2_0, claim_rules_1_3_0, claim_sentences_1_3_0
from tests.test_eval_invariants import GOLDEN, good


def with_flags(version, alpha_flags):
    r = good()
    r["alpha"] = dict(r.get("alpha") or {}, flags=alpha_flags)
    if version:
        r["claim_rules_version"] = version
    return r


def test_it_is_measured_not_gated():
    assert "claim_rules_1_3_0" not in NAMES and "claim_rules_1_3_0" not in CHECKS
    assert "claim_rules_1_3_0" in run_offline.MEASURED and "claim_rules_1_3_0" in run_offline.COLUMNS
    assert "claim_rules_1_2_0" in run_offline.MEASURED and "claim_rules_1_2_0" in run_offline.COLUMNS


def test_a_flag_with_a_counterfactual_word_fails_1_3_0_and_still_passes_1_2_0():
    res = with_flags("1.2.0", ["no_vwap_benchmark_available", "unfilled_opportunity_cost_assessed"])
    assert claim_rules_1_2_0(res, GOLDEN).ok is True            # 1.2.0 never read flags: reported as it was
    out = claim_rules_1_3_0(res, GOLDEN)
    assert out.ok is False and "alpha.flags.1:opportunity" in out.detail
    assert claim_sentences_1_3_0(res, GOLDEN) == ["alpha.flags.1:opportunity"]


def test_the_gated_check_reads_flags_only_for_a_result_made_under_1_3_0():
    flagged = ["missed_fills"]
    assert CHECKS["no_flagged_terms"](with_flags("1.2.0", flagged), GOLDEN).ok is True
    out = CHECKS["no_flagged_terms"](with_flags("1.3.0", flagged), GOLDEN)
    assert out.ok is False and "alpha.flags.0:missed" in out.detail


def test_a_clean_run_passes_1_3_0():
    assert claim_rules_1_3_0(with_flags(None, ["high_maker_participation", "low_fee_drag"]), GOLDEN).ok is True
    assert claim_sentences_1_3_0(with_flags(None, []), GOLDEN) == []
