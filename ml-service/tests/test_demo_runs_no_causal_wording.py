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


def test_the_demos_served_under_claim_rules_1_2_0():
    """State of 2026-11-19. On 2026-11-17 all three demo runs (prompt 1.7.0) were clean under rules 1.1.0. Rules 1.2.0
    (causal phrasings and number-free judgements) flag two of them, so the serving path refuses them until they are
    re-recorded (waiting item in docs/PROGRESS.md; recorded LLM output is never edited):
      demo-aggressive   liquidity.slippageRoot  "..., resulting in a median spread paid of <0.01 bps."
      demo-disciplined  fee.recommendedAction   "All executions were maker orders (100.0% maker), resulting in a total fee cost of $13.50."
    demo-moderate was clean under 1.2.0. Under 1.3.0 (2026-11-20) its alpha flag "Unfilled Opportunity Cost Assessed"
    fails, so none of the three was served until the re-record of item 26.
    2026-11-20: all three were re-recorded under the fixed renderer and rules 1.3.0 (3 live runs, each accepted, 9 of 9
    calls); all three are served."""
    from agents.council_service import load_demo_fixture, recorded_hashes
    served = set()
    for f in sorted(glob.glob(os.path.join(DEMO_RUNS, "*.json"))):
        doc = json.load(open(f))
        if load_demo_fixture(doc["account_id"], doc["symbol"], hashes=recorded_hashes(doc["council_result"])) is not None:
            served.add(doc["account_id"])
    assert served == {"demo-aggressive", "demo-disciplined", "demo-moderate"}


def test_fails_claim_rules_names_the_field_and_ignores_the_ledgers():
    from agents.council_service import fails_current_claim_rules
    assert fails_current_claim_rules({"fee": {"recommendedAction": "Fees were 4.0 bps, resulting in a drag."}}) is True
    assert fails_current_claim_rules({"synthesis": {"headline": "The trader showed efficient routing."}}) is True
    assert fails_current_claim_rules({"debate_transcript": {"claims": [{"claim_text": "Cost was inherent to the venue."}]}}) is True
    assert fails_current_claim_rules({"synthesis": {"headline": "Fee drag was low at 0.5 bps."}}) is False
    # the redaction ledger lists the terms it removed; it is not copy
    assert fails_current_claim_rules({"claims": {"redactions": [{"terms": ["inherent to"]}]},
                                      "grounding": {"x": "efficient routing"}}) is False


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


def test_serving_refuses_a_stored_run_that_fails_claim_rules_1_2_0():
    """A stored demo run with a causal phrasing or a number-free judgement is "not yet generated", as for a cause."""
    import asyncio
    from unittest.mock import patch
    import pathlib
    import pytest
    from mongomock_motor import AsyncMongoMockClient
    from agents.errors import CouncilError
    from tests.council_fakes import make_router
    from tests.test_council_cache_demo import _flow, _stored_run

    router, _ = make_router()
    for i, text in enumerate(["The trader paid $2.00 in fees, resulting in a drag of 4.0 bps.",
                              "Execution stayed within acceptable range."]):
        run = _stored_run(router, account="demo-moderate")
        run["council_result"]["fee"]["recommendedAction"] = text
        db = AsyncMongoMockClient()["fillscore"]
        asyncio.run(db["council_runs"].insert_one(dict(run, run_id=f"r{i}")))
        with patch("agents.council_service.DEMO_RUNS_DIR", pathlib.Path("/nonexistent")), pytest.raises(CouncilError) as info:
            _flow(router, db, account="demo-moderate")
        assert info.value.code == "DEMO_NOT_GENERATED", text
