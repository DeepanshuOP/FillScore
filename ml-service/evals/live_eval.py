"""LIVE eval runner (spends real LLM attempts; free tiers). Not run in CI.

  python -m evals.live_eval --plan 3b2 --cap 110      # the Phase 3b.2 batch (L1 completion + L2 ablation)
  python -m evals.live_eval --arm council --runs 2 --cap 60 --start 1
  python -m evals.live_eval --arm single  --runs 3 --cap 30 --start 1

* HTTP attempts are hard-capped (router.http_attempt_cap); the pacer stays on.
* >= 65 s between runs (the run_consistency_eval inter-run sleep is not lowered), for both arms.
* persist=False: nothing is written to Atlas. Every run is saved to disk immediately as
  evals/recordings/<council|single>-<user>-<n>.json with {arm, run, attempts, wall_s, meta, council_result}
  (gated by evals/run_offline.py, tabulated by evals/ablation.py).
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config.env_loader import load_service_env  # noqa: E402

USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
GAP_S = 65
MIN_ATTEMPTS_LEFT = {"council": 15, "single": 4}   # do not start a run the cap cannot finish
RECORDINGS = os.path.join(ROOT, "evals", "recordings")


def plan_3b2() -> list[tuple[str, str, int]]:
    """(arm, user, run number), in priority order. Already on disk before this phase: council disciplined 1-2,
    moderate 1. L1 completes moderate 2 and aggressive 1-2; L2 is 3 single runs per user plus one more
    Council run per user, so every user ends with 3 Council runs. Cheap single runs go before the extra Council."""
    plan = [("council", "demo-moderate", 2), ("council", "demo-aggressive", 1), ("council", "demo-aggressive", 2)]
    plan += [("single", u, n) for u in USERS for n in (1, 2, 3)]
    plan += [("council", "demo-disciplined", 3), ("council", "demo-moderate", 3), ("council", "demo-aggressive", 3)]
    return plan


def recording_meta(arm: str, router) -> dict:
    from agents.single_call import SINGLE_CALL_SYSTEM_PROMPT
    from agents.synthesis import SYNTHESIS_SYSTEM_PROMPT
    from config.versions import PROMPT_VERSION
    prompt = SINGLE_CALL_SYSTEM_PROMPT if arm == "single" else SYNTHESIS_SYSTEM_PROMPT
    return {"arm": arm, "prompt_version": PROMPT_VERSION, "route_config_hash": router.config.hash,
            "synthesis_prompt_sha256": hashlib.sha256(prompt.encode()).hexdigest()[:16],
            "routes": {role: list(models) for role, models in router.config.roles.items()}
            if hasattr(router.config, "roles") else None}


def recording_path(arm: str, user: str, n: int) -> str:
    return os.path.join(RECORDINGS, f"{arm}-{user}-{n}.json")


async def main(plan: list[tuple[str, str, int]], cap: int) -> None:
    from agents import llm_router
    from agents.council import load_packets, run_council_pipeline
    from agents.single_call import run_single_call
    router = llm_router.get_default_router()
    router.http_attempt_cap = cap
    os.makedirs(RECORDINGS, exist_ok=True)
    loaded: dict = {}
    first = True
    skipped = []
    for arm, u, n in plan:
        if os.path.exists(recording_path(arm, u, n)):
            print(f"{arm} {u} #{n}: already recorded, skipping")
            continue
        left = cap - router.http_attempts
        if left < MIN_ATTEMPTS_LEFT[arm]:
            skipped.append(f"{arm}-{u}-{n}")
            continue
        if u not in loaded:
            loaded[u] = await load_packets(u, "BTCUSDT")
        (fee, risk, liq, alpha), trades = loaded[u]
        if not first:
            await asyncio.sleep(GAP_S)
        first = False
        before, t0 = router.http_attempts, time.monotonic()
        try:
            if arm == "council":
                res = await run_council_pipeline(u, u, "BTCUSDT", fee, risk, liq, alpha, llm=router,
                                                 trades=trades, persist=False)
                result = res.model_dump(mode="json")
            else:
                result = await run_single_call(u, "BTCUSDT", fee, risk, liq, alpha, router, trades)
        except Exception as exc:   # an exhausted router etc.: record and carry on within the cap
            print(f"{arm} {u} #{n} FAILED: {type(exc).__name__}", flush=True)
            skipped.append(f"{arm}-{u}-{n} (failed: {type(exc).__name__})")
            continue
        body = {"golden_id": u, "arm": arm, "run": n, "council_result": result,
                "attempts": router.http_attempts - before, "wall_s": round(time.monotonic() - t0, 1),
                "meta": recording_meta(arm, router)}
        with open(recording_path(arm, u, n), "w") as f:
            json.dump(body, f, indent=1, sort_keys=True, default=str)
        print(f"{arm} {u} #{n}: {body['attempts']} attempts, {body['wall_s']}s "
              f"(total {router.http_attempts}/{cap})", flush=True)
    print(f"done: {router.http_attempts}/{cap} attempts; not run: {skipped or 'none'}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", choices=["3b2"])
    ap.add_argument("--arm", choices=["council", "single"])
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--cap", type=int, required=True)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--users", nargs="*", default=USERS)
    a = ap.parse_args()
    if a.plan:
        steps = plan_3b2()
    elif a.arm:
        steps = [(a.arm, u, n) for u in a.users for n in range(a.start, a.start + a.runs)]
    else:
        ap.error("give --plan or --arm")
    load_service_env(os.path.join(ROOT, ".env"), os.path.join(ROOT, "..", "backend", ".env"))
    asyncio.run(main(steps, a.cap))
