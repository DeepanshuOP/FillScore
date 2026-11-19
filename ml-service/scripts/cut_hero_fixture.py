"""Cut the data behind the design lab's hero, "one order, measured" (M8 phase 2a, 2026-11-19).

Reads the offline demo build (demo_v2/out/demo-moderate: order, fill, order measurement) and the public Binance daily
aggTrades file in the local cache, and writes `frontend/app/design-lab/fixtures/hero-order.inputs.json`:
the order, its fill, its stored measurement, the real prints around the order, and the running mid computed by the
measurement code itself (`measure.benchmarks.quote_at`, strictly-before rule, 5 s staleness). Nothing is invented: the
prints are the public file's rows, the mid is the production function, the figures are the stored measurement.
The replay JSON (`hero-order.replay.json`) is the output of backend `buildOrderReplay` on these inputs; the backend
test `heroFixture.test.ts` keeps the two equal.

Run from ml-service/:  .venv/bin/python scripts/cut_hero_fixture.py
Reads the cache and the offline build only; no network, no database."""
from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from measure.benchmarks import quote_at  # noqa: E402
from measure.data.vision import load_day  # noqa: E402

ORDER_ID = "ord-moderate-BNBUSDT-115583"
ACCOUNT = "demo-moderate"
BEFORE_MS, AFTER_MS = 4_000, 1_500           # shown window: arrival - 4 s to fill + 1.5 s
OUT = ROOT.parent / "frontend" / "app" / "design-lab" / "fixtures" / "hero-order.inputs.json"


def iso_ms(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms % 1000:03d}Z"


def main() -> None:
    d = ROOT / "demo_v2" / "out" / ACCOUNT
    order = next(o for o in json.loads((d / "orders.json").read_text()) if o["orderId"] == ORDER_ID)
    fills = [t for t in json.loads((d / "trades.json").read_text()) if t["orderId"] == ORDER_ID]
    meas = next(m for m in json.loads((d / "order_measurements.json").read_text()) if m["orderId"] == ORDER_ID)
    assert len(fills) == 1 and order["symbol"] == "BNBUSDT" and meas["unmeasuredReason"] is None

    day = meas["marketDataRefs"][0]["date"]
    w = load_day("BNBUSDT", day, ROOT / ".cache" / "market" / "zips")
    sha = w.refs[0].sha256
    assert sha == meas["marketDataRefs"][0]["sha256"], "cached file differs from the one the measurement used"

    arrival = int(meas["arrivalMs"])
    fill_ms = int(datetime.fromisoformat(fills[0]["executedAt"].replace("Z", "+00:00")).timestamp() * 1000)
    lo, hi = arrival - BEFORE_MS, fill_ms + AFTER_MS
    prints = [{"id": int(w.agg_id[i]), "ts": int(w.ts_ms[i]), "price": float(w.price[i]), "qty": float(w.qty[i]),
               "buyerInitiated": not bool(w.is_buyer_maker[i])}      # is_buyer_maker false = the buyer was the aggressor
              for i in range(len(w)) if lo <= int(w.ts_ms[i]) <= hi]

    mid, last = [], None
    for t in [lo] + [p["ts"] + 1 for p in prints]:                   # the mid after each print (strictly-before rule)
        q = quote_at(w, t)
        if q.mid is not None and q.mid != last:
            mid.append({"ts": t, "mid": round(q.mid, 8), "bid": q.bid, "ask": q.ask})
            last = q.mid
    out = {
        "note": "Real public prints and the production mid function around one synthetic-demo order. Trader behaviour is synthetic; prices are real.",
        "order": order, "fills": fills, "measurement": meas,
        "tape": {"symbol": "BNBUSDT", "date": day, "source": "data.binance.vision spot/daily/aggTrades", "sourceSha256": sha,
                 "windowStart": iso_ms(lo), "windowEnd": iso_ms(hi), "arrivalMs": arrival, "fillMs": fill_ms,
                 "prints": prints, "mid": mid},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(f"wrote {OUT.relative_to(ROOT.parent)}: {len(prints)} prints, {len(mid)} mid points, window {iso_ms(lo)} to {iso_ms(hi)}")


if __name__ == "__main__":
    main()
