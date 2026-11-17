"""I8 (correlation, never causation) for the cached demo Council runs shown to every visitor.

The claim check (agents/claims.py CONNECTIVE_TERMS) names "because of", "due to" and the like. A bare "because" slipped
through once (re-record of 2026-11-14: "paid $21.10 in fees because 30.9% of executions were maker orders"). The
committed demo runs are public copy, so they are held to the stricter rule: no causal connective of any kind in any text
value. A fixture that fails is re-recorded, never edited (recorded LLM output is never edited)."""
import glob
import json
import os
import re

from agents.claims import CONNECTIVE_TERMS

DEMO_RUNS = os.path.join(os.path.dirname(__file__), "..", "demo_runs")
CAUSAL = re.compile(r"\b(" + "|".join([re.escape(t) for t in CONNECTIVE_TERMS] + ["because", "therefore", "thereby", "hence", "consequently"]) + r")\b", re.I)


def _strings(node, path=""):
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _strings(v, f"{path}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _strings(v, f"{path}[{i}]")
    elif isinstance(node, str):
        yield path, node


def test_the_re_recorded_demos_are_served():
    """State of 2026-11-17: all three demo runs (prompt 1.7.0) are clean and match the current demo data. On 2026-11-14
    demo-aggressive held a "because" and was not served; it was re-recorded under claim rules 1.1.0 (which now also
    checks the specialists' own text). A run that states a cause is still refused: see the last test of this file."""
    from agents.council_service import load_demo_fixture, recorded_hashes
    served = set()
    for f in sorted(glob.glob(os.path.join(DEMO_RUNS, "*.json"))):
        doc = json.load(open(f))
        if load_demo_fixture(doc["account_id"], doc["symbol"], hashes=recorded_hashes(doc["council_result"])) is not None:
            served.add(doc["account_id"])
    assert served == {"demo-aggressive", "demo-disciplined", "demo-moderate"}


def test_the_ledgers_that_list_redacted_terms_are_not_copy():
    from agents.council_service import states_a_cause
    assert states_a_cause({"claims": {"redactions": [{"terms": ["due to"]}]}, "grounding": {"x": "because"}}) is False
    assert states_a_cause({"fee": {"recommendedAction": "Fees were high because most fills were taker fills."}}) is True
    assert states_a_cause({"synthesis": {"narrative": "The cost coincided with a wider spread."}}) is False


def _causal_hits(result: dict) -> list[str]:
    return [f"{path}: {m.group(0)!r}" for path, text in _strings(result) if "grounding" not in path and "/claims" not in path
            for m in [CAUSAL.search(text)] if m]


def test_a_committed_demo_run_either_states_no_cause_or_is_not_served():
    """The serving path (agents.council_service) refuses a demo run whose copy states a cause, so a fixture that does is
    harmless until it is re-recorded. This test holds both halves: clean, or refused."""
    from agents.council_service import load_demo_fixture, recorded_hashes
    files = sorted(glob.glob(os.path.join(DEMO_RUNS, "*.json")))
    assert len(files) == 3
    for f in files:
        doc = json.load(open(f))
        hits = _causal_hits(doc["council_result"])
        served = load_demo_fixture(doc["account_id"], doc["symbol"], hashes=recorded_hashes(doc["council_result"]))
        assert (not hits) or served is None, f"{os.path.basename(f)} states a cause and would be served: {hits}"


def test_serving_refuses_a_stored_run_that_states_a_cause():
    import asyncio
    from unittest.mock import MagicMock, patch
    import pytest
    from mongomock_motor import AsyncMongoMockClient
    from agents.errors import CouncilError
    from tests.council_fakes import make_packets, make_router
    from tests.test_council_cache_demo import _flow, _stored_run

    router, _ = make_router()
    run = _stored_run(router, account="demo-moderate")
    run["council_result"]["fee"]["recommendedAction"] = "The trader paid $2.00 in fees because most fills were taker fills."
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(run))
    with patch("agents.council_service.DEMO_RUNS_DIR", __import__("pathlib").Path("/nonexistent")), pytest.raises(CouncilError) as info:
        _flow(router, db, account="demo-moderate")
    assert info.value.code == "DEMO_NOT_GENERATED"
    run["council_result"]["fee"]["recommendedAction"] = "The trader paid $2.00 in fees, and most fills were taker fills."
    db2 = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db2["council_runs"].insert_one(dict(run, run_id="clean")))
    with patch("agents.council_service.DEMO_RUNS_DIR", __import__("pathlib").Path("/nonexistent")):
        assert _flow(router, db2, account="demo-moderate").cached is True
