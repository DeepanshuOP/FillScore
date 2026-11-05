"""A3: the opt-in local grounding debug sink. Off by default, refused when FILLSCORE_DEPLOY=1."""
from __future__ import annotations

import json

from agents import debug_sink
from agents.grounding import redact
from tests.test_grounding import CTX

TEXT = "Fills were clean. Slippage hit 7.3 bps at {{liquidity.worst_hour_utc}}. Most fills were limit orders."


def _env(monkeypatch, tmp_path, debug=None, deploy=None):
    monkeypatch.setattr(debug_sink, "DEBUG_PATH", tmp_path / ".debug" / "grounding.jsonl")
    for k, v in (("FILLSCORE_GROUNDING_DEBUG", debug), ("FILLSCORE_DEPLOY", deploy)):
        monkeypatch.delenv(k, raising=False)
        if v is not None:
            monkeypatch.setenv(k, v)
    return tmp_path / ".debug" / "grounding.jsonl"


def test_off_by_default_writes_nothing(monkeypatch, tmp_path):
    path = _env(monkeypatch, tmp_path)
    redact(TEXT, CTX, "liquidity_scout", "slippageRoot")
    assert not path.exists() and debug_sink.enabled() is False


def test_on_writes_one_line_for_the_redacted_sentence(monkeypatch, tmp_path):
    path = _env(monkeypatch, tmp_path, debug="1")
    redact(TEXT, CTX, "liquidity_scout", "slippageRoot")
    lines = path.read_text().splitlines()
    assert len(lines) == 1
    rec = json.loads(lines[0])
    assert rec.pop("ts")
    assert rec == {"agent": "liquidity_scout", "field": "slippageRoot", "kind": "numeral_redacted",
                   "sentence": "Slippage hit 7.3 bps at {{liquidity.worst_hour_utc}}.", "tokens": ["7.3 bps"]}


def test_a_deploy_config_refuses_the_sink(monkeypatch, tmp_path):
    path = _env(monkeypatch, tmp_path, debug="1", deploy="1")
    redact(TEXT, CTX, "liquidity_scout", "slippageRoot")
    assert not path.exists()
    assert debug_sink.enabled() is False and debug_sink.refused() is True


def test_an_unwritable_path_does_not_raise(monkeypatch, tmp_path):
    _env(monkeypatch, tmp_path, debug="1")
    blocker = tmp_path / "file"
    blocker.write_text("x")
    monkeypatch.setattr(debug_sink, "DEBUG_PATH", blocker / "sub" / "g.jsonl")
    debug_sink.record("a", "f", "numeral_flagged", "s", ["t"])


def test_enforce_claims_records_flag_and_redaction(monkeypatch, tmp_path):
    from tests.test_claims import T_S0, T_S1, _regen_ok, claims_answers
    from tests.test_council_grounded import _run
    path = _env(monkeypatch, tmp_path, debug="1")
    _run(claims_answers(_regen_ok(T_S0 + " " + T_S1)), trades=None)
    recs = [json.loads(l) for l in path.read_text().splitlines()]
    claim = [r for r in recs if r["kind"].startswith("claim_")]
    assert [(r["kind"], r["field"], r["tokens"]) for r in claim] == [
        ("claim_flagged", "narrative", ["avoidable"]), ("claim_redacted", "narrative", ["avoidable"])]
    assert all("avoidable taker costs" in r["sentence"] for r in claim)
