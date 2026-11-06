"""LIVE eval runner (spends real LLM attempts; free tiers). Not run in CI.

  python -m evals.live_eval --arm council --runs 2 --cap 60 --start 1
  python -m evals.live_eval --arm single  --runs 3 --cap 30 --start 1

* HTTP attempts are hard-capped (router.http_attempt_cap); the pacer stays on.
* >= 65 s between Council runs (the run_consistency_eval inter-run sleep is not lowered).
* persist=False: nothing is written to Atlas. Each run is saved to disk immediately:
  council -> evals/recordings/council-<user>-<n>.json  (gated by evals/run_offline.py)
  single  -> evals/ablation/single-<user>-<n>.json     (compared in evals/ablation_results.md)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from config.env_loader import load_service_env  # noqa: E402

USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
COUNCIL_GAP_S = 65
SINGLE_GAP_S = 30


async def main(arm: str, runs: int, cap: int, start: int, users: list[str]) -> None:
    from agents import llm_router
    from agents.council import load_packets, run_council_pipeline
    from agents.single_call import run_single_call
    router = llm_router.get_default_router()
    router.http_attempt_cap = cap
    out_dir = os.path.join(ROOT, "evals", "recordings" if arm == "council" else "ablation")
    os.makedirs(out_dir, exist_ok=True)
    gap = COUNCIL_GAP_S if arm == "council" else SINGLE_GAP_S
    first = True
    for u in users:
        (fee, risk, liq, alpha), trades = await load_packets(u, "BTCUSDT")
        for n in range(start, start + runs):
            if router.http_attempts >= cap:
                print(f"attempt cap {cap} reached; stopping before {u} #{n}")
                return
            if not first:
                await asyncio.sleep(gap)
            first = False
            before = router.http_attempts
            try:
                if arm == "council":
                    res = await run_council_pipeline(u, u, "BTCUSDT", fee, risk, liq, alpha, llm=router,
                                                     trades=trades, persist=False)
                    body = {"golden_id": u, "arm": arm, "run": n, "council_result": res.model_dump(mode="json")}
                    path = os.path.join(out_dir, f"council-{u}-{n}.json")
                else:
                    res = await run_single_call(u, "BTCUSDT", fee, risk, liq, alpha, router, trades)
                    body = {"golden_id": u, "arm": arm, "run": n, "council_result": res}
                    path = os.path.join(out_dir, f"single-{u}-{n}.json")
            except Exception as exc:   # an exhausted router etc.: record and carry on within the cap
                print(f"{u} #{n} FAILED: {type(exc).__name__}")
                continue
            body["attempts"] = router.http_attempts - before
            with open(path, "w") as f:
                json.dump(body, f, indent=1, sort_keys=True, default=str)
            print(f"{u} #{n}: {body['attempts']} attempts (total {router.http_attempts}/{cap})", flush=True)
    print(f"done: {router.http_attempts} attempts")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", choices=["council", "single"], required=True)
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--cap", type=int, required=True)
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--users", nargs="*", default=USERS)
    a = ap.parse_args()
    load_service_env(os.path.join(ROOT, ".env"), os.path.join(ROOT, "..", "backend", ".env"))
    asyncio.run(main(a.arm, a.runs, a.cap, a.start, a.users))
