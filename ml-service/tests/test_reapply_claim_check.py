"""3a G0: reapply_claim_check redacts causal text, never changes a number, and the shipped fixtures are clean."""
import copy
import json
import pathlib

import pytest

from scripts import reapply_claim_check as rc

DEMO = pathlib.Path(__file__).resolve().parents[1] / "demo_runs"


def _doc():
    return json.loads((DEMO / "demo-aggressive.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", ["demo-aggressive", "demo-disciplined", "demo-moderate"])
def test_shipped_fixtures_are_already_clean(name):
    doc = json.loads((DEMO / f"{name}.json").read_text(encoding="utf-8"))
    new, changes = rc.reapply(doc)
    assert changes == [] and new == doc


def test_causal_claim_is_removed_and_numbers_are_untouched():
    doc = _doc()
    doc["council_result"]["debate_transcript"]["claims"].append(
        {"side": "prosecution", "claim_id": "P9", "evidence_keys": [],
         "claim_text": "The trader paid 10.0 bps due to a high maker ratio of 22.7%.", "rebuts": None})
    new, changes = rc.reapply(copy.deepcopy(doc))
    assert [c[0] for c in changes] == [f"debate.claims.{len(doc['council_result']['debate_transcript']['claims']) - 1}"]
    assert dict(rc.numeric_leaves(doc["council_result"]["risk"])) == dict(rc.numeric_leaves(new["council_result"]["risk"]))


def _with_causal_debate_claim(doc):
    doc["council_result"]["debate_transcript"]["claims"].append(
        {"side": "prosecution", "claim_id": "P9", "evidence_keys": [],
         "claim_text": "The trader paid 10.0 bps due to a high maker ratio of 22.7%.", "rebuts": None})
    return doc


def test_debate_redaction_updates_the_stored_claims_ledger():
    # the stored ledger has N = debate_flagged = len(debate_redactions); one new strict redaction -> N + 1 each
    # (N is read from the recording, which changes when the demo runs are re-recorded)
    doc = _with_causal_debate_claim(_doc())
    before = doc["council_result"]["claims"]
    n = before["debate_flagged"]
    assert len(before["debate_redactions"]) == n
    n_claims = len(doc["council_result"]["debate_transcript"]["claims"]) - 1   # without the appended claim
    new, changes = rc.reapply(copy.deepcopy(doc))
    assert len(changes) == 1
    ledger = new["council_result"]["claims"]
    assert ledger["debate_flagged"] == n + 1
    assert len(ledger["debate_redactions"]) == n + 1
    last = ledger["debate_redactions"][-1]
    assert (last["field"], last["sentence_index"]) == (f"debate.claims.{n_claims}", 0)
    assert "due to" in last["terms"]
    # synthesis-side ledger fields are untouched by a debate redaction
    assert ledger["redactions"] == before["redactions"] and ledger["flagged_first_pass"] == before["flagged_first_pass"]


def test_synthesis_redaction_is_recorded_without_touching_debate_counts():
    doc = _doc()
    s = doc["council_result"]["synthesis"]
    s["narrative"] = "Costs were driven by the open. " + s["narrative"]
    before = doc["council_result"]["claims"]
    new, changes = rc.reapply(copy.deepcopy(doc))
    assert [c[0] for c in changes] == ["narrative"]
    ledger = new["council_result"]["claims"]
    assert ledger["debate_flagged"] == before["debate_flagged"]
    assert len(ledger["debate_redactions"]) == len(before["debate_redactions"]) == before["debate_flagged"]
    assert len(ledger["redactions"]) == 1
    assert (ledger["redactions"][0]["field"], ledger["redactions"][0]["sentence_index"]) == ("narrative", 0)
    assert ledger["flagged_first_pass"] == 0   # first-pass count is history, not rewritten


def test_write_persists_the_updated_ledger(tmp_path):
    base = _doc()
    n = base["council_result"]["claims"]["debate_flagged"]
    n_claims = len(base["council_result"]["debate_transcript"]["claims"])
    (tmp_path / "demo-aggressive.json").write_text(json.dumps(_with_causal_debate_claim(base)), encoding="utf-8")
    assert rc.main(["--dir", str(tmp_path), "--write"]) == 0
    saved = json.loads((tmp_path / "demo-aggressive.json").read_text(encoding="utf-8"))
    assert saved["council_result"]["claims"]["debate_flagged"] == n + 1
    assert len(saved["council_result"]["debate_transcript"]["claims"]) == n_claims   # the causal claim is gone


def test_refuses_when_a_required_scalar_would_be_emptied():
    doc = _doc()
    doc["council_result"]["synthesis"]["headline"] = "Costs were driven by the open."
    with pytest.raises(rc.Refuse):
        rc.reapply(doc)
