"""READ-ONLY. Per demo user: enrich the demo trades IN MEMORY from public Binance 1s klines (nothing is written to
the DB), then print the spread-aware maker counterfactual components and effect vs the materiality threshold.

  .venv/bin/python scripts/demo_counterfactual_report.py [--plan]   # --plan: only count the (symbol, day) files needed
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.env_loader import load_service_env  # noqa: E402
from marketdata import binance_vision as bv  # noqa: E402
from marketdata.enrich import _Bars, _days, _epoch, enrich_trade  # noqa: E402

USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
CACHE = ROOT.parent / ".work" / "marketcache"


async def _load(user):
    from agents.metrics.loader import load_trades
    return await load_trades(user, "ALL")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan", action="store_true")
    a = ap.parse_args()
    load_service_env(str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    from agents.counterfactual import maker_instead_of_taker
    from agents.verification import materiality_threshold
    trades = {u: asyncio.run(_load(u)) for u in USERS}
    files = set()
    for u, ts in trades.items():
        for t in ts:
            e = _epoch(t["executedAt"])
            files.update((t["symbol"], d) for d in _days(e - 1860, e + 1860))
    print(f"trades: { {u: len(ts) for u, ts in trades.items()} }; distinct (symbol, day) files: {len(files)}")
    if a.plan:
        return 0
    bars = _Bars(lambda s, d: bv.fetch_day(s, d, CACHE))
    out = {}
    for u, ts in trades.items():
        enriched = [{**t, **enrich_trade(t, bars)} for t in ts]
        fees = sum(float(t.get("feePaid") or 0) for t in enriched)
        thr = materiality_threshold(fees)
        res = {}
        for r in (0.5, 0.8):
            cf = maker_instead_of_taker(enriched, r)
            d = cf.details
            res[str(r)] = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in d.items()
                           if k != "target_ratio"} | {"effect_usd": round(cf.effect_usd, 4),
                                                      "threshold_usd": round(thr, 4),
                                                      "clears": cf.effect_usd > thr,
                                                      "n_converted": cf.n_trades_affected}
        n_priced = sum(1 for t in enriched if t.get("halfSpreadBps") is not None)
        n_path = sum(1 for t in enriched if any(v is not None for v in t["postPrices"].values()))
        out[u] = {"n_trades": len(ts), "n_with_spread": n_priced, "n_with_any_post_price": n_path,
                  "total_fees_usd": round(fees, 4), "results": res}
    print(json.dumps(out, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
