"""Print the `citedValues` the Council stream adds to a demo account's recorded run (design v3 fixes A7), computed from
the offline demo build (ml-service/demo_v2/out) instead of the database: no network, no Atlas. The design QA mock
(frontend/e2e-shots/mock.ts) serves it beside the committed recorded run. Every value is a packet value rendered by
agents.render (agents.cited_values); nothing comes from a language model, and the recorded run is not changed.

The offline packets do not hash-equal the recorded ones (the stored trades carry database ids the build lacks), so this
is for screenshots only; the server traces against the packets whose hashes equal the recorded run's.

    cd ml-service && .venv/bin/python scripts/cut_cited_fixture.py demo-moderate
"""
from __future__ import annotations

import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from agents.cited_values import trace_result  # noqa: E402
from agents.metrics.loader import build_all_packets, normalise_trade_doc  # noqa: E402
from agents.render import packet_ctx  # noqa: E402


def main(account: str) -> None:
    run = json.loads((ROOT / "demo_runs" / f"{account}.json").read_text(encoding="utf-8"))
    symbol, result = run["symbol"], run["council_result"]
    out = ROOT / "demo_v2" / "out" / account
    raw = json.loads((out / "trades.json").read_text(encoding="utf-8"))
    measured = json.loads((out / "order_measurements.json").read_text(encoding="utf-8"))

    def trade(t: dict) -> dict:
        t = dict(t)
        t["executedAt"] = datetime.datetime.fromisoformat(t["executedAt"].replace("Z", "+00:00"))
        return normalise_trade_doc(t)

    trades = sorted((trade(t) for t in raw if symbol == "ALL" or t["symbol"] == symbol), key=lambda t: t["executedAt"])
    ms = sorted(({k: m.get(k) for k in ("orderId", "shortfall", "unmeasuredReason")} for m in measured
                 if symbol == "ALL" or m.get("symbol") == symbol), key=lambda m: m["orderId"])
    ctx = packet_ctx(*build_all_packets(trades, account, symbol, ms), trades)
    print(json.dumps(trace_result(result, ctx), indent=1))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "demo-moderate")
