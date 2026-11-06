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


def test_refuses_when_a_required_scalar_would_be_emptied():
    doc = _doc()
    doc["council_result"]["synthesis"]["headline"] = "Costs were driven by the open."
    with pytest.raises(rc.Refuse):
        rc.reapply(doc)
