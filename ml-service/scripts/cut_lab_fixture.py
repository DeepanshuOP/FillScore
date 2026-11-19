"""Cut the data behind the design lab's dashboard mock (M8 phase 2a, 2026-11-19): demo-moderate.

Reads only the offline demo build (demo_v2/out): the v2.3.0 grade (grades_v2.json), the cost-vs-expected block, and
the 245 order measurements, from which it sums the dollar cost (USD = bps x intended notional / 10,000, the same rule
as backend/src/services/orderReplay.ts) and builds a per-symbol table (orders, median total cost in bps, total USD).
The locked v1 grade of demo-moderate (84.80888516669383, B) is the published constant of CLAUDE.md rule 5.
Writes `frontend/app/design-lab/fixtures/dashboard-mock.json`. No network, no database.

Run from ml-service/:  .venv/bin/python scripts/cut_lab_fixture.py"""
from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "frontend" / "app" / "design-lab" / "fixtures" / "dashboard-mock.json"
ACCOUNT = "demo-moderate"


def main() -> None:
    g = json.loads((ROOT / "demo_v2" / "out" / "grades_v2.json").read_text())[ACCOUNT]
    ms = json.loads((ROOT / "demo_v2" / "out" / ACCOUNT / "order_measurements.json").read_text())
    rows = []
    terms_usd = {"spread": 0.0, "impactTiming": 0.0, "unfilled": 0.0, "fees": 0.0}
    for m in ms:
        sf = m.get("shortfall")
        if not sf or sf.get("totalBps") is None or not sf.get("intendedNotional"):
            continue
        rows.append((m["symbol"], sf["totalBps"], sf["totalBps"] * sf["intendedNotional"] / 1e4, sf["intendedNotional"]))
        for key, field in (("spread", "spreadBps"), ("impactTiming", "impactTimingBps"), ("unfilled", "opportunityBps"), ("fees", "feesBps")):
            terms_usd[key] += (sf.get(field) or 0.0) * sf["intendedNotional"] / 1e4
    by: dict[str, list] = {}
    for r in rows:
        by.setdefault(r[0], []).append(r)
    symbols = [{"symbol": s, "orders": len(v), "medianTotalBps": statistics.median(x[1] for x in v),
                "totalUsd": sum(x[2] for x in v), "notionalUsd": sum(x[3] for x in v)} for s, v in sorted(by.items())]
    c = g["costVsExpected"]
    out = {
        "note": "demo-moderate, rebuilt from real public prints; trader behaviour is synthetic (dataSource synthetic-demo).",
        "account": ACCOUNT, "dataSource": "synthetic-demo",
        "v2": {"composite": g["result"]["composite"], "grade": g["result"]["grade"], "band": g["result"]["band"],
               "scoringVersion": g["scoringVersion"], "integrityHash": g["integrityHash"], "fills": g["result"]["fills"],
               "orders": g["result"]["orders"], "components": {k: v["score"] for k, v in g["result"]["components"].items()}},
        "v1": {"score": 84.80888516669383, "grade": "B", "version": "v1"},
        "totals": {"orders": len(rows), "usd": sum(r[2] for r in rows), "notionalUsd": sum(r[3] for r in rows),
                   "bps": sum(r[2] for r in rows) / sum(r[3] for r in rows) * 1e4},
        "termsUsd": terms_usd,   # spread + impactTiming + unfilled + fees = totals.usd (a test in the lab checks it)
        "costVsExpected": c, "symbols": symbols,
        "evidenceKeyFingerprint": "ba11aa53c4961be4",
    }
    OUT.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
    print(f"wrote {OUT.relative_to(ROOT.parent)}: {len(rows)} orders, total ${out['totals']['usd']:.2f} = {out['totals']['bps']:.2f} bps")
    for s in symbols:
        print(s)


if __name__ == "__main__":
    main()
