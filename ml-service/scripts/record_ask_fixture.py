"""Record the real Ask agent's answers for the IA v4 design-lab prototype (fifth order of 2026-11-22, step 3).

The Ask service refuses demo accounts (no model is run for demo data on request); like the demo Council, the prototype shows a
RECORDED run instead, labelled as such. This script runs `agents.ask.ask_flow` (the production flow: planner call, deterministic
tools, answerer call, code-placed numbers, claim rules) over the committed demo files of one account (`demo_v2/out/`), with the
committed routes and real free-tier providers. Usage is counted in an in-memory store: nothing is written to MongoDB.
The output is written verbatim; it is never edited afterwards.

    cd ml-service && .venv/bin/python scripts/record_ask_fixture.py demo-moderate ../frontend/app/design-lab/ia4/fixtures/ask-recorded.json
"""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

QUESTIONS = [
    "Which orders cost the most?",
    "What did my orders cost in total?",
    "How did my market orders compare with the modelled cost?",
    "What score did my execution get?",
]


async def main(account: str, out_path: str) -> None:
    from mongomock_motor import AsyncMongoMockClient

    from agents.ask import ask_flow
    from agents.llm_router import LLMRouter, MongoUsageStore, load_routes
    from config.env_loader import load_service_env
    from config.versions import CLAIM_RULES_VERSION

    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))   # key names only; values are never printed
    out_dir = ROOT / "demo_v2" / "out"
    grades = json.loads((out_dir / "grades_v2.json").read_text())[account]
    measurements = json.loads((out_dir / account / "order_measurements.json").read_text())
    score = {"scoringVersion": grades["scoringVersion"], "result": grades["result"]}

    async def load():
        return score, measurements

    router = LLMRouter(load_routes(), usage_store=MongoUsageStore(AsyncMongoMockClient()["ask_fixture"]))
    runs = []
    for q in QUESTIONS:
        telemetry: list = []
        result = await ask_flow(q, load, router, telemetry=telemetry)
        models = [f"{t.get('provider')}/{t.get('model')}" for t in telemetry if isinstance(t, dict) and t.get("outcome") == "ok"]
        runs.append({"question": q, "result": result, "models": models})
        print(f"{q!r}: calls={result['n_calls']} degraded={result['degraded']} tools={result['tools_used']}")
    doc = {
        "recorded": True,
        "label": "Recorded answers of the Ask agent on demo data (synthetic trader, real prices); not a live answer.",
        "account": account,
        "recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "claimRulesVersion": CLAIM_RULES_VERSION,
        "scoringVersion": grades["scoringVersion"],
        "source": "ml-service/scripts/record_ask_fixture.py over ml-service/demo_v2/out (committed demo files)",
        "runs": runs,
    }
    Path(out_path).write_text(json.dumps(doc, indent=1) + "\n")


if __name__ == "__main__":
    if os.environ.get("FILLSCORE_E2E_NO_LLM") == "1":
        sys.exit("FILLSCORE_E2E_NO_LLM=1: refusing to record")
    asyncio.run(main(sys.argv[1], sys.argv[2]))
