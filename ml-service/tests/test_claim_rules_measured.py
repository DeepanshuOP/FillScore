"""Item 2(b) of the orders of 2026-11-19: a measured, NOT gated, invariant that applies the claim rules 1.2.0 to every
recording, both arms alike, whatever version the recording carries. The gated check (`no_flagged_terms`) still judges
a recording by its own version; this one never does."""
from evals import run_offline
from evals.invariants import CHECKS, NAMES, claim_rules_1_2_0, claim_sentences_1_2_0
from tests.test_eval_invariants import GOLDEN, good

CAUSE = "The cost was inherent to the limit-order strategy."   # no numeral: nothing for numerals_grounded to trip on
JUDGEMENT = "The trader showed efficient routing."


def with_text(version, text):
    r = good()
    r["synthesis"].update(headline=text)
    if version:
        r["claim_rules_version"] = version
    return r


def test_it_is_not_one_of_the_gated_invariants():
    assert "claim_rules_1_2_0" not in NAMES and "claim_rules_1_2_0" not in CHECKS
    assert "claim_rules_1_2_0" in run_offline.MEASURED and "claim_rules_1_2_0" in run_offline.COLUMNS


def test_a_1_0_0_recording_passes_its_own_gate_but_fails_the_measured_rules():
    for version in (None, "1.0.0", "1.1.0"):
        res = with_text(version, CAUSE)
        assert CHECKS["no_flagged_terms"](res, GOLDEN).ok is True, version   # its own rules: nothing flagged
        out = claim_rules_1_2_0(res, GOLDEN)
        assert out.ok is False and "inherent to" in out.detail, version


def test_both_arms_are_scored_identically():
    council = with_text("1.1.0", JUDGEMENT)
    single = with_text("1.1.0", JUDGEMENT)
    for k in ("liquidity", "alpha", "risk", "fee"):
        single.pop(k)
    assert claim_rules_1_2_0(council, GOLDEN) == claim_rules_1_2_0(single, GOLDEN)
    assert claim_rules_1_2_0(council, GOLDEN).ok is False


def test_a_clean_run_passes_and_sentences_are_counted():
    assert claim_rules_1_2_0(with_text(None, "Fees were 4.0 bps."), GOLDEN).ok is True
    res = with_text(None, CAUSE + " " + JUDGEMENT)   # one sentence each; the headline holds two flagged sentences
    assert len(claim_sentences_1_2_0(res, GOLDEN)) == 2


def test_run_offline_reports_it_without_failing_the_gate(monkeypatch, capsys):
    monkeypatch.setattr(run_offline, "load_golden", lambda *a, **k: {"t": GOLDEN})
    monkeypatch.setattr(run_offline, "collect_runs", lambda *a, **k: [("rec:council-t-1", "t", with_text("1.1.0", CAUSE))])
    monkeypatch.setattr(run_offline, "orphan_recordings", lambda *a, **k: [])
    assert run_offline.main() == 0
    out = capsys.readouterr().out
    assert "claim_rules_1_2_0 violations 2 runs of 2" in out   # the stub run is listed under both recorded sets, v1 and v3
