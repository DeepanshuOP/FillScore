"""run_offline gates Council outputs; single-call ablation recordings are reported but never fail the gate."""
from evals import run_offline
from tests.test_eval_invariants import GOLDEN, good


def bad():
    r = good()
    r["synthesis"]["overallRating"] = "CRITICAL"   # outside the allowed GOOD/FAIR
    return r


def run_with(monkeypatch, runs):
    monkeypatch.setattr(run_offline, "load_golden", lambda *a, **k: {"t": GOLDEN})
    monkeypatch.setattr(run_offline, "collect_runs", lambda golden, recordings=True, *a, **k: runs)
    monkeypatch.setattr(run_offline, "orphan_recordings", lambda *a, **k: [])
    return run_offline.main()


def test_failing_council_recording_fails_the_gate(monkeypatch):
    assert run_with(monkeypatch, [("rec:council-t-1", "t", bad())]) == 1


def test_evidence_miss_is_measured_identically_for_both_arms(monkeypatch, capsys):
    council = good()
    council["synthesis"].update(headline="Execution was solid.", narrative="Fine.")   # misses the synthesis key
    single = good()
    for k in ("liquidity", "alpha", "risk", "fee"):
        single.pop(k)
    single["grounding"]["per_agent"] = {"synthesis": {"values_cited": 3}}
    single["synthesis"].update(headline="Execution was solid.", narrative="Fine.")    # same miss, same treatment
    assert run_with(monkeypatch, [("rec:council-t-1", "t", council), ("rec:single-t-1", "t", single)]) == 0
    assert "evidence_cited misses 2" in capsys.readouterr().out   # one per arm, no arm exempted


def test_single_recording_safety_failure_still_gates(monkeypatch):
    assert run_with(monkeypatch, [("rec:single-t-1", "t", bad())]) == 1
