"""Synthetic edge packets for the golden set (deterministic, no DB, no randomness).
Usage: python -m evals.edge_cases   (writes evals/golden/edge-*.json)"""
from __future__ import annotations

import json
import os

from agents.metrics.loader import build_all_packets
from agents.render import packet_ctx

GOLDEN = os.path.join(os.path.dirname(__file__), "golden")
# Packet keys each agent's rendered text must show (invariant evidence_cited); the same headline metric per agent.
REQUIRED_EVIDENCE = {"alpha_architect": ["alpha.avg_vwap_deviation_bps"], "fee_optimizer": ["fee.fee_drag_bps"],
                     "liquidity_scout": ["liquidity.avg_slippage_bps"], "risk_auditor": ["risk.adverse_rate"],
                     "synthesis": []}


def _trade(i: int, *, maker: bool, whale: bool = False, full: bool = True) -> dict:
    t = {"id": f"t{i}", "symbol": "BTCUSDT", "exchange": "binance", "isMaker": maker,
         "feePaid": 0.5 if maker else 1.0,           # maker 5 bps, taker 10 bps of 1000
         "notionalValue": 1000.0, "orderType": "LIMIT" if maker else "MARKET", "side": "BUY",
         "executedAt": f"2024-01-{1 + i % 9:02d}T{8 + i % 6:02d}:00:00Z", "whaleAdverse": whale}
    if full:
        t.update({"arrivalSlippageBps": 1.0 + i % 3, "fillScore": 70.0, "executionPrice": 100.0 + i,
                  "vwap5m": 100.0 + i})
    return t


def edge_trades() -> dict[str, list[dict]]:
    return {
        "edge-all-maker": [_trade(i, maker=True) for i in range(12)],
        "edge-all-taker": [_trade(i, maker=False) for i in range(12)],
        "edge-single-trade": [_trade(0, maker=False)],
        "edge-whale-adverse": [_trade(i, maker=bool(i % 2), whale=i % 3 == 0) for i in range(12)],
        "edge-missing-data": [_trade(i, maker=bool(i % 2), full=False) for i in range(8)],
    }


def main() -> None:
    os.makedirs(GOLDEN, exist_ok=True)
    for name, trades in edge_trades().items():
        ctx = packet_ctx(*build_all_packets(trades, name, "BTCUSDT"))
        with open(os.path.join(GOLDEN, f"{name}.json"), "w") as f:
            json.dump({"id": name, "kind": "edge", "symbol": "BTCUSDT", "n_trades": len(trades), "packet": ctx,
                       "required_evidence": REQUIRED_EVIDENCE},
                      f, indent=1, sort_keys=True, default=str)
        print(name, len(trades))


if __name__ == "__main__":
    main()
