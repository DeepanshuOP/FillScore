"""Run the old (free text) and the new (typed claims) Ask paths on the same 12 questions over demo-moderate, live (seventh order, B3 and B4).

    cd ml-service && .venv/bin/python scripts/compare_ask_paths.py [--cap 60]

What it does: for each question of `evals/ask_questions.py`, in order, it runs the old path and then the new path through the production flow
(`agents.ask.ask_flow`, mode "free" and "claims") over the committed demo files of demo-moderate (`demo_v2/out/`), with the committed routes and
the real free-tier providers. Usage is counted in memory (a mongomock store): nothing is written to MongoDB, nothing to Atlas.
Limits (the order's): at most --cap live HTTP calls in total (retries count; the router's attempt cap stops the run when it is reached, and
the stop is printed and saved); on a 429 it waits once for the provider's Retry-After and a second 429 stops the run.
Output (verbatim, never edited afterwards): evals/ask_claims_runs/{free_runs,claims_runs,summary}.json after every question, and, from the
new path's runs of the four Home questions, the recorded fixture beside the old one: frontend/app/lib/ask/ask-recorded-claims.json.
No secret is printed; the key names are only read by the env loader.
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

OUT_DIR = ROOT / "evals" / "ask_claims_runs"
FIXTURE = ROOT.parent / "frontend" / "app" / "lib" / "ask" / "ask-recorded-claims.json"
ACCOUNT = "demo-moderate"


async def main(cap: int) -> None:
    from mongomock_motor import AsyncMongoMockClient

    from agents.ask_tools import run_tools
    from agents.llm_router import LLMRouter, MongoUsageStore, load_routes
    from config.env_loader import load_service_env
    from config.versions import ASK_CLAIM_RULES_VERSION, ASK_PROMPT_VERSION, CLAIM_RULES_VERSION
    from evals import ask_compare as cmp
    from evals.ask_questions import HOME_QUESTIONS, QUESTIONS

    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    demo = ROOT / "demo_v2" / "out"
    grades = json.loads((demo / "grades_v2.json").read_text())[ACCOUNT]
    measurements = json.loads((demo / ACCOUNT / "order_measurements.json").read_text())
    score = {"scoringVersion": grades["scoringVersion"], "result": grades["result"]}

    async def load():
        return score, measurements

    tel_all: list = []
    state = {"stop": None}

    async def sleep(seconds: float) -> None:
        if sum(1 for t in tel_all if isinstance(t, dict) and t.get("outcome") == "http_429") >= 2:
            state["stop"] = "a second 429: the order says wait once for Retry-After, then stop"
            router.http_attempt_cap = router.http_attempts          # the next attempt is refused by the router
            return
        await asyncio.sleep(seconds)

    router = LLMRouter(load_routes(), usage_store=MongoUsageStore(AsyncMongoMockClient()["ask_compare"]), sleep=sleep)
    router.http_attempt_cap = cap
    runs: dict[str, list] = {"free": [], "claims": []}
    ctxs: dict[str, list] = {"free": [], "claims": []}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stopped = None

    def save() -> None:
        summary = {"account": ACCOUNT, "cap": cap, "live_calls_used": router.http_attempts, "stopped": stopped,
                   "questions_run": len(runs["claims"]), "askPromptVersion": ASK_PROMPT_VERSION, "askClaimRulesVersion": ASK_CLAIM_RULES_VERSION}
        for p in ("free", "claims"):
            if runs[p]:
                summary[p] = cmp.summarize(runs[p], ctxs[p])
        for p in ("free", "claims"):
            (OUT_DIR / f"{p}_runs.json").write_text(json.dumps(runs[p], indent=1) + "\n")
        (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")
        home = [r for r in runs["claims"] if r["question"] in HOME_QUESTIONS]
        if home:
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
                "source": "ml-service/scripts/compare_ask_paths.py over ml-service/demo_v2/out (committed demo files), new path (typed claims)",
                "runs": [{"question": r["question"], "result": r["result"], "models": r["models"], "recordedAt": r["recordedAt"]} for r in home],
            }
            FIXTURE.write_text(json.dumps(doc, indent=1) + "\n")

    for q in QUESTIONS:
        for path in ("free", "claims"):
            if router.http_attempts >= cap or state["stop"]:
                stopped = state["stop"] or f"the live-call cap of {cap} was reached"
                break
            try:
                rec = await cmp.run_question(router, path, q, load, telemetry=tel_all)
            except Exception as exc:      # the planner call has no fallback: a failure here ends this question, and is counted
                stopped = state["stop"] or f"{type(exc).__name__} on the {path} path"
                print(f"{q!r} [{path}] stopped: {type(exc).__name__}")
                break
            rec["recordedAt"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
            used, ctx = run_tools(rec["result"]["tools_used"], score, measurements)
            rec["ctx"] = ctx
            runs[path].append(rec)
            ctxs[path].append(ctx)
            r = rec["result"]
            print(f"{q!r} [{path}]: calls={rec['http_attempts']} degraded={r['degraded']} fallback={r.get('fallback')!r} outcomes={rec['outcomes']}")
            save()
        else:
            continue
        break
    save()
    print(f"live calls used: {router.http_attempts} of cap {cap}; stopped: {stopped}")
    print(json.dumps(json.loads((OUT_DIR / "summary.json").read_text()), indent=1))


if __name__ == "__main__":
    if os.environ.get("FILLSCORE_E2E_NO_LLM") == "1":
        sys.exit("FILLSCORE_E2E_NO_LLM=1: refusing to run live")
    cap = int(sys.argv[sys.argv.index("--cap") + 1]) if "--cap" in sys.argv else 60
    asyncio.run(main(cap))
