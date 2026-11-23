"""Re-record the four Home answers with the typed-claims path under claim rules 1.1.0 (seventh order, after the review of 2026-11-23).

    cd ml-service && .venv/bin/python scripts/record_ask_claims_fixture.py [--cap 12]

Why: the first claims recording (frontend/app/lib/ask/ask-recorded-claims.json, rules 1.0.0, kept unchanged beside this one) shows a sentence
the review found false: "The modelled cost's interval ran from -0.3 bps to -0.1 bps" (the interval bounds paid minus modelled cost). The template
was reworded and each slot now names its exact id (rules 1.1.0), so the four questions are asked again.
Same method as compare_ask_paths.py: production flow `ask_flow(mode="claims")` over demo-moderate's committed files, committed routes, real
free-tier providers, usage in memory (nothing to Atlas); at most --cap live calls (the order's cap of 60 minus the 48 used by B3 = 12); a
second 429 stops the run. Output verbatim: frontend/app/lib/ask/ask-recorded-claims-1.1.0.json. No secret is printed.
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

OUT = ROOT.parent / "frontend" / "app" / "lib" / "ask" / "ask-recorded-claims-1.1.0.json"
ACCOUNT = "demo-moderate"


async def main(cap: int) -> None:
    from mongomock_motor import AsyncMongoMockClient

    from agents.llm_router import LLMRouter, MongoUsageStore, load_routes
    from config.env_loader import load_service_env
    from config.versions import ASK_CLAIM_RULES_VERSION, ASK_PROMPT_VERSION, CLAIM_RULES_VERSION
    from evals import ask_compare as cmp
    from evals.ask_questions import HOME_QUESTIONS

    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    demo = ROOT / "demo_v2" / "out"
    grades = json.loads((demo / "grades_v2.json").read_text())[ACCOUNT]
    measurements = json.loads((demo / ACCOUNT / "order_measurements.json").read_text())
    score = {"scoringVersion": grades["scoringVersion"], "result": grades["result"]}

    async def load():
        return score, measurements

    tel: list = []
    stop = {"why": None}

    async def sleep(seconds: float) -> None:
        if sum(1 for t in tel if isinstance(t, dict) and t.get("outcome") == "http_429") >= 2:
            stop["why"] = "a second 429"
            router.http_attempt_cap = router.http_attempts
            return
        await asyncio.sleep(seconds)

    router = LLMRouter(load_routes(), usage_store=MongoUsageStore(AsyncMongoMockClient()["ask_rerecord"]), sleep=sleep)
    router.http_attempt_cap = cap
    runs = []
    for q in HOME_QUESTIONS:
        if stop["why"] or router.http_attempts >= cap:
            break
        try:
            rec = await cmp.run_question(router, "claims", q, load, telemetry=tel)
        except Exception as exc:
            stop["why"] = f"{type(exc).__name__}"
            break
        r = rec["result"]
        print(f"{q!r}: calls={rec['http_attempts']} degraded={r['degraded']} fallback={r.get('fallback')!r}")
        runs.append({"question": q, "result": r, "models": rec["models"], "recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")})
    doc = {
        "recorded": True,
        "label": "Recorded answers of the Ask agent on demo data (synthetic trader, real prices); not a live answer.",
        "answerKind": "claims",
        "account": ACCOUNT,
        "recordedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "claimRulesVersion": CLAIM_RULES_VERSION,
        "askPromptVersion": ASK_PROMPT_VERSION,
        "askClaimRulesVersion": ASK_CLAIM_RULES_VERSION,
        "scoringVersion": grades["scoringVersion"],
        "source": "ml-service/scripts/record_ask_claims_fixture.py over ml-service/demo_v2/out (committed demo files), typed claims, rules " + ASK_CLAIM_RULES_VERSION,
        "runs": runs,
    }
    if len(runs) == len(HOME_QUESTIONS):
        OUT.write_text(json.dumps(doc, indent=1) + "\n")
    print(f"live calls used: {router.http_attempts} of cap {cap}; stopped: {stop['why']}; written: {len(runs) == len(HOME_QUESTIONS)}")


if __name__ == "__main__":
    if os.environ.get("FILLSCORE_E2E_NO_LLM") == "1":
        sys.exit("FILLSCORE_E2E_NO_LLM=1: refusing to record")
    cap = int(sys.argv[sys.argv.index("--cap") + 1]) if "--cap" in sys.argv else 12
    asyncio.run(main(cap))
