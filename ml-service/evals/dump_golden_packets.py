"""One-off, READ-ONLY: store the deterministic packets for the three demo users as golden fixtures.
Reads trades from the configured Mongo (no writes) and writes evals/golden/<user>.json.
Usage: python -m evals.dump_golden_packets"""
from __future__ import annotations

import asyncio
import json
import os

from config.env_loader import load_service_env

GOLDEN = os.path.join(os.path.dirname(__file__), "golden")
USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]


async def main() -> None:
    from agents.metrics.loader import load_run_inputs
    from agents.render import packet_ctx
    os.makedirs(GOLDEN, exist_ok=True)
    for u in USERS:
        (fee, risk, liq, alpha), trades = await load_run_inputs(u, "BTCUSDT")
        ctx = packet_ctx(fee, risk, liq, alpha)
        with open(os.path.join(GOLDEN, f"{u}.json"), "w") as f:
            json.dump({"id": u, "kind": "demo", "symbol": "BTCUSDT", "n_trades": len(trades), "packet": ctx},
                      f, indent=1, sort_keys=True, default=str)
        print(u, len(trades), "trades")


if __name__ == "__main__":
    _root = os.path.join(os.path.dirname(__file__), "..")
    load_service_env(os.path.join(_root, ".env"), os.path.join(_root, "..", "backend", ".env"))
    asyncio.run(main())
