"""Build the three Binance demos from real January 2024 prints, then measure and score them offline under Scoring v2.
Never touches MongoDB: scoring runs on an in-memory mongomock database through the production measurement job and
scorer (data_source="synthetic-demo"). Writes ml-service/demo_v2/out/<demo>/{trades,orders,fee_snapshots}.json, a
manifest with every tape's SHA-256, and grades_v2.json.

    cd ml-service && .venv/bin/python scripts/build_demo_v2.py [--out demo_v2/out]

Tapes are data.binance.vision daily aggTrades (checksum-verified by measure.data.vision.load_day, cached under
.cache/market/zips).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import OrderedDict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from config.versions import MEASURE_VERSION, SCORING_V2_VERSION  # noqa: E402
from demo_v2.build import build_demo  # noqa: E402
from demo_v2.decisions import generate_decisions  # noqa: E402
from measure.data import vision  # noqa: E402
from measure.data.aggtrades import AggTradeWindow  # noqa: E402

DEMOS = {"aggressive": "demo-aggressive", "moderate": "demo-moderate", "disciplined": "demo-disciplined"}
TTL_MS, HORIZON_MS = 30 * 60_000, 5 * 60_000
# Regular tier, maker 0.1000% / taker 0.1000%: https://www.binance.com/en/fee/schedule (searched 2026-11-11, M1;
# scoring_v2/version.py PUBLISHED_TAKER_BPS). The page shows today's schedule; January 2024 is not separately confirmed.
FEES = {"maker": 0.001, "taker": 0.001}
FEE_SOURCE = "https://www.binance.com/en/fee/schedule (regular tier 0.1000% / 0.1000%, searched 2026-11-11)"


class DayTapes:
    """Serves [start, end) windows of one symbol from cached daily files, joining adjacent days when needed."""

    def __init__(self, cache: Path, keep: int = 6):
        self.cache, self.keep, self.days, self.used = cache, keep, OrderedDict(), {}

    def _day(self, symbol: str, day: str) -> AggTradeWindow:
        k = (symbol, day)
        if k not in self.days:
            self.days[k] = vision.load_day(symbol, day, self.cache)
            self.used[k] = self.days[k].refs[0]
            while len(self.days) > self.keep:
                self.days.popitem(last=False)
        self.days.move_to_end(k)
        return self.days[k]

    def __call__(self, symbol: str, start: int, end: int) -> AggTradeWindow:
        d0 = datetime.fromtimestamp(start / 1000, tz=timezone.utc).date()
        d1 = datetime.fromtimestamp((end - 1) / 1000, tz=timezone.utc).date()
        parts, d = [], d0
        while d <= d1:
            if d <= date(2024, 1, 31):                     # the decision window; nothing is borrowed from other days
                parts.append(self._day(symbol, d.isoformat()).between(start, end))
            d += timedelta(days=1)
        if not parts:                                      # entirely after the window: no prints, never borrowed
            return AggTradeWindow.from_rows(symbol, [])
        if len(parts) == 1:
            return parts[0]
        cols = [np.concatenate([getattr(p, c) for p in parts]) for c in ("agg_id", "price", "qty", "ts_ms", "is_buyer_maker")]
        return AggTradeWindow.from_arrays(symbol, *cols, refs=tuple(r for p in parts for r in p.refs))


def _dt(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%m-%dT%H:%M:%S.%fZ")      # naive UTC, as Mongo returns it


def measure_offline(demo: str, out: dict, tapes: DayTapes):
    """Measure one rebuilt demo with the production job on an in-memory database. Returns (db, now_ms, reports)."""
    import mongomock

    from measure.service import measure_account

    db = mongomock.MongoClient().db
    db.trades.insert_many([{**t, "executedAt": _dt(t["executedAt"])} for t in out["trades"]] or [{"_skip": 1}])
    db.trades.delete_many({"_skip": 1})
    db.orders.insert_many([{**o, "createdAt": _dt(o["createdAt"]), "updatedAt": _dt(o["updatedAt"])} for o in out["orders"]])
    db.fee_snapshots.insert_many([{**s, "fetchedAt": _dt(s["fetchedAt"])} for s in out["fee_snapshots"]])
    now = int(datetime(2024, 3, 1, tzinfo=timezone.utc).timestamp() * 1000)
    reports = []
    while True:
        r = measure_account(db, demo, tapes, now, data_source="synthetic-demo")
        reports.append(r)
        if r["measured"] == 0 or r["pending"] == 0:
            break
    return db, now, reports


def score_offline(demo: str, out: dict, tapes: DayTapes) -> dict:
    from scoring_v2.score import _plain, score_account_v2
    from scoring_v2.version import load_version, version_file_sha256

    db, now, reports = measure_offline(demo, out, tapes)
    unmeasured = db.trades.count_documents({"measurement.unmeasuredReason": {"$ne": None}})
    s = score_account_v2(db, demo, load_version(SCORING_V2_VERSION), version_file_sha256(SCORING_V2_VERSION), now,
                         data_source="synthetic-demo")
    # The order measurements the production job wrote into the in-memory database: the seed script stores them in
    # `order_measurements`, so the dashboard's order views read the same documents as for a real account.
    oms = sorted((_plain(d) for d in db.order_measurements.find({"accountId": demo})), key=lambda d: (d["symbol"], d["orderId"]))
    return {"scoringVersion": s["scoringVersion"], "versionFileSha256": s["versionFileSha256"],
            "measureVersion": s["measureVersion"], "integrityHash": s["integrityHash"], "result": s["result"],
            "measured": sum(r["measured"] for r in reports), "orders": sum(r["orders"] for r in reports),
            "unmeasuredFills": unmeasured, "skipped": reports[-1]["skipped"], "orderMeasurements": oms}


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(ROOT / "demo_v2" / "out"))
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    a = p.parse_args(argv)
    out_dir = Path(a.out)
    decisions = generate_decisions(ROOT.parent / "backend" / "src" / "data" / "market")
    tapes = DayTapes(Path(a.cache))
    manifest = {"seed": 42, "window": ["2024-01-01", "2024-01-31"], "ttlMs": TTL_MS, "horizonMs": HORIZON_MS,
                "feeRates": FEES, "feeSource": FEE_SOURCE, "measureVersion": MEASURE_VERSION,
                "scoringVersion": SCORING_V2_VERSION, "demos": {}, "generatedBy": "ml-service/scripts/build_demo_v2.py"}
    grades = {}
    for prof, demo in DEMOS.items():
        out = build_demo(demo, decisions[prof], tapes, fee_rates=FEES, ttl_ms=TTL_MS, horizon_ms=HORIZON_MS, fee_source=FEE_SOURCE)
        d = out_dir / demo
        d.mkdir(parents=True, exist_ok=True)
        files = {}
        for name in ("trades", "orders", "fee_snapshots"):
            text = json.dumps(out[name], indent=1, sort_keys=True) + "\n"
            (d / f"{name}.json").write_text(text, encoding="utf-8")
            files[f"{name}.json"] = hashlib.sha256(text.encode()).hexdigest()
        g = score_offline(demo, out, tapes)
        text = json.dumps(g.pop("orderMeasurements"), indent=1, sort_keys=True, default=str) + "\n"
        (d / "order_measurements.json").write_text(text, encoding="utf-8")
        files["order_measurements.json"] = hashlib.sha256(text.encode()).hexdigest()
        grades[demo] = g
        manifest["demos"][demo] = {"counts": out["counts"], "skipped": out["skipped"], "files": files,
                                   "statuses": {s: sum(1 for o in out["orders"] if o["status"] == s) for s in ("FILLED", "CANCELED")}}
        r = g["result"]
        print(f"{demo}: {out['counts']} skipped={out['skipped']} | v2 composite={r['composite']} grade={r['grade']} "
              f"band={r['band']} reason={r['reason']} measured={g['measured']} unmeasured={g['unmeasuredFills']}", flush=True)
        for c, v in r["components"].items():
            print(f"    {c:9s} score={v['score']} measured={v['measured']} unmeasured={v['unmeasured']}")
    manifest["tapes"] = sorted(({"symbol": k[0], "day": k[1], "sha256": ref.sha256, "url": vision.day_url(k[0], k[1])}
                                for k, ref in tapes.used.items()), key=lambda x: (x["symbol"], x["day"]))
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    (out_dir / "grades_v2.json").write_text(json.dumps(grades, indent=1, sort_keys=True, default=str) + "\n", encoding="utf-8")
    print(f"wrote {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
