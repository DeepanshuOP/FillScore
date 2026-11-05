"""Structured acceptance of a Council run (1d.6). Hand-computed fixtures, no network."""
import copy
import json
import pathlib
import subprocess
import sys

import pytest

from agents.acceptance import accept_run, string_sweep

ROOT = pathlib.Path(__file__).resolve().parents[1]
QUARANTINE = ROOT.parent / ".work" / "phase1c_quarantine" / "demo-moderate.1c.discarded.json"


def good():
    return {
        "degraded": False, "degraded_reasons": [],
        "n_calls_expected": 9, "n_calls_ok": 9,
        "liquidity": {"agent": "liquidity_scout", "slippageRoot": "slip", "flags": []},
        "alpha": {"agent": "alpha_architect", "bestAlternative": "alt", "flags": []},
        "risk": {"agent": "risk_auditor", "flags": []},
        "fee": {"agent": "fee_optimizer", "recommendedAction": "act", "flags": []},
        "synthesis": {"headline": "H", "narrative": "N", "findings": []},
        "grounding": {"redactions": [], "fallbacks": []},
        "debate_transcript": {"prosecution_summary": "p", "defense_summary": "d"},
        "llm_calls": [{"outcome": "ok"} for _ in range(9)],
    }


def test_good_run_is_accepted():
    a = accept_run(good())
    assert a.accepted and a.failures == [] and "no findings" in a.notes


def test_recovered_429_is_a_note_only():
    r = good()
    r["llm_calls"] += [{"outcome": "http_429"}] * 3
    a = accept_run(r)
    assert a.accepted and a.recovered_429 == 3 and a.unrecovered_429 == 0
    assert "3 rate-limited attempts, all recovered" in a.notes


def test_degraded_with_429_is_rejected():
    r = good()
    r["degraded"], r["degraded_reasons"] = True, ["liquidity_scout: x"]
    r["llm_calls"] += [{"outcome": "http_429"}] * 2
    a = accept_run(r)
    assert not a.accepted
    assert "degraded: liquidity_scout: x" in a.failures
    assert "rate limits contributed: 2 http_429 attempts in a rejected run" in a.failures
    assert a.unrecovered_429 == 2 and a.recovered_429 == 0


def test_call_count_mismatch():
    r = good()
    r["n_calls_ok"] = 8
    assert "n_calls_ok 8 != n_calls_expected 9" in accept_run(r).failures


def test_agent_failed_flag_names_agent():
    r = good()
    r["fee"]["flags"] = ["agent_failed"]
    a = accept_run(r)
    assert not a.accepted and any("fee" in f for f in a.failures)


def test_default_synthesis_marker():
    r = good()
    r["synthesis"]["headline"] = "Analysis incomplete"
    a = accept_run(r)
    assert not a.accepted and any("synthesis" in f for f in a.failures)


def test_redaction_with_empty_required_field_fails():
    r = good()
    r["grounding"]["redactions"] = [{"x": 1}]
    r["liquidity"]["slippageRoot"] = ""
    a = accept_run(r)
    assert not a.accepted and any("liquidity.slippageRoot" in f for f in a.failures)


def test_empty_debate_summary_fails():
    r = good()
    r["grounding"]["redactions"] = [{"x": 1}]
    r["debate_transcript"]["defense_summary"] = "  "
    assert any("debate.defense_summary" in f for f in accept_run(r).failures)


def test_redaction_with_fallback_text_is_accepted():
    r = good()
    r["grounding"]["redactions"] = [{"x": 1}]
    r["liquidity"]["slippageRoot"] = "Liquidity verdict: GOOD; average slippage 7.3 bps."
    r["grounding"]["fallbacks"] = [{"agent": "liquidity_scout", "field": "slippageRoot", "fallback_text": True}]
    a = accept_run(r)
    assert a.accepted
    assert "1 sentence(s) redacted; required fields intact" in a.notes
    assert "fallback text used for liquidity_scout.slippageRoot" in a.notes


def test_finding_effect_recomputed():
    r = good()
    r["synthesis"]["findings"] = [{"effect_usd": 3.1, "method": "exclude_hours", "verified": True}]
    assert accept_run(r).accepted
    r["synthesis"]["findings"][0]["effect_usd"] = None
    a = accept_run(r)
    assert not a.accepted and "finding 0 has no recomputed effect" in a.failures
    r["synthesis"]["findings"][0]["effect_usd"] = float("inf")   # review 1d.9 #11: not a real effect
    assert "finding 0 has no recomputed effect" in accept_run(r).failures


def test_string_sweep():
    assert string_sweep("x failed: y\n429 429 Rate Limit") == {
        "failed:": 1, "Max retries": 0, "_default_": 0, "429": 2, "rate limit": 1}


def _fixture():
    if not QUARANTINE.exists():
        pytest.skip("quarantine fixture missing (.work is gitignored)")
    return json.loads(QUARANTINE.read_text())


def test_real_quarantined_run():
    res = _fixture()["council_result"]
    a = accept_run(res)
    # Phase 1c report: degraded False, 9/9, 0 findings, redactions []. Spec said 6 http_429 but the fixture
    # llm_calls holds 5 (Counter: ok 10, http_429 5, invalid_json 4); counting the file is the ground truth.
    assert a.accepted, a.failures
    assert a.recovered_429 == 5 and len(res["synthesis"]["findings"]) == 0


def test_cli_accepts_and_rejects(tmp_path):
    script = ROOT / "scripts" / "check_council_run.py"
    bad = good()
    bad["n_calls_ok"] = 8
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(bad))
    r = subprocess.run([sys.executable, str(script), str(p)], capture_output=True, text=True)
    assert r.returncode == 1 and "REJECTED" in r.stdout and "string sweep (secondary, not a gate)" in r.stdout
    g = tmp_path / "good.json"
    g.write_text(json.dumps({"council_result": good()}))
    r = subprocess.run([sys.executable, str(script), str(g)], capture_output=True, text=True)
    assert r.returncode == 0 and "ACCEPTED" in r.stdout
