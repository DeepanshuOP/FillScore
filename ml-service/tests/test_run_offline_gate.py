"""run_offline gates Council outputs; single-call ablation recordings are reported but never fail the gate."""
from evals import run_offline
from tests.test_eval_invariants import GOLDEN, good


def bad():
    r = good()
    r["synthesis"]["overallRating"] = "CRITICAL"   # outside the allowed GOOD/FAIR
    return r


def run_with(monkeypatch, runs):
    monkeypatch.setattr(run_offline, "load_golden", lambda: {"t": GOLDEN})
    monkeypatch.setattr(run_offline, "collect_runs", lambda golden, recordings=True: runs)
    return run_offline.main()


def test_failing_council_recording_fails_the_gate(monkeypatch):
    assert run_with(monkeypatch, [("rec:council-t-1", "t", bad())]) == 1


def test_single_recording_missing_evidence_is_informational(monkeypatch, capsys):
    r = good()
    r["risk"]["flags"] = []   # fails evidence_cited only
    for k in ("liquidity", "alpha", "risk", "fee"):
        r.pop(k)
    r["grounding"]["per_agent"] = {"synthesis": {"values_cited": 3}}   # single arm: needs the union of keys, absent
    assert run_with(monkeypatch, [("rec:council-t-1", "t", good()), ("rec:single-t-1", "t", r)]) == 0
    assert "informational" in capsys.readouterr().out


def test_single_recording_safety_failure_still_gates(monkeypatch):
    assert run_with(monkeypatch, [("rec:single-t-1", "t", bad())]) == 1
