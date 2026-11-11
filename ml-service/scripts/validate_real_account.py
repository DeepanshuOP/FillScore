"""Validate measurement v2 and Scoring v2 on one real account. Read-only and dry-run only: it never writes anywhere
except an in-memory copy.

    cd ml-service && .venv/bin/python scripts/validate_real_account.py --account <accountId>

MONGODB_URI is read from the environment (never printed). The account's trades, orders and fee snapshots are copied
into an in-memory database; there the fills are measured against public Binance prints (REST, no key), the account
is scored under the current ScoringVersion, and the integrity hash is verified. The real database is wrapped so any
write raises PermissionError. This closes M1's "one real account scored under v2" check once real trades exist.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

_WRITES = {"insert_one", "insert_many", "update_one", "update_many", "replace_one", "delete_one", "delete_many",
           "find_one_and_update", "find_one_and_replace", "find_one_and_delete", "bulk_write", "drop", "create_index",
           "rename"}


class _ReadOnlyCollection:
    def __init__(self, coll):
        self._c = coll

    def __getattr__(self, name):
        if name in _WRITES:
            def refuse(*a, **k):
                raise PermissionError(f"read-only: {name} refused")
            return refuse
        return getattr(self._c, name)


class ReadOnlyDB:
    def __init__(self, db):
        self._db = db

    def __getattr__(self, name):
        return _ReadOnlyCollection(self._db[name])

    def __getitem__(self, name):
        return _ReadOnlyCollection(self._db[name])


def validate(src, account_id: str, source, version: dict, version_sha: str, now_ms: int) -> dict:
    import mongomock

    from measure.metrics import IDENTITY_TOL
    from measure.service import measure_account
    from scoring_v2.score import score_account_v2, verify_account_v2

    if account_id.startswith("demo-"):
        raise ValueError("demo accounts are rebuilt in M2; this harness is for real accounts")
    mem = mongomock.MongoClient().db
    trades = list(src.trades.find({"accountId": account_id}))
    for t in trades:
        t.pop("measurement", None)                     # always re-measure from scratch in memory
    if trades:
        mem.trades.insert_many(trades)
    for name in ("orders", "fee_snapshots"):
        docs = list(src[name].find({"accountId": account_id}))
        if docs:
            mem[name].insert_many(docs)

    runs = []
    while True:                                         # the job measures 500 fills per call
        r = measure_account(mem, account_id, source, now_ms)
        runs.append(r)
        if r["measured"] == 0 or r["pending"] == 0:
            break

    identity_failures, below_floor, measured, reasons = 0, 0, 0, Counter()
    for t in mem.trades.find({"accountId": account_id}):
        m = t.get("measurement")
        if not m:
            reasons["not measured (pending)"] += 1
            continue
        if m.get("effHalfBps") is None:
            reasons[m.get("unmeasuredReason") or "no mid"] += 1
            continue
        measured += 1
        eff = m["effHalfBps"]
        for h, r in (m.get("realized") or {}).items():
            i = (m.get("impact") or {}).get(h)
            if r is not None and i is not None and abs(eff - (r + i)) > IDENTITY_TOL * max(1.0, abs(eff), abs(r), abs(i)):
                identity_failures += 1
        half_tick = m["tickSize"] / 2 / m["mid"] * 1e4
        if eff < -half_tick - 1e-9 and not t.get("isMaker"):
            below_floor += 1                            # a taker fill better than the bid/ask proxies: worth a look

    totals = [om["shortfall"]["totalBps"] for om in mem.order_measurements.find({"accountId": account_id})
              if om.get("shortfall") and om["shortfall"].get("totalBps") is not None]
    score = score_account_v2(mem, account_id, version, version_sha, now_ms)
    mem.scores_v2.insert_one(dict(score))
    return {
        "account": account_id, "trades": len(trades), "measured": measured, "unmeasured": dict(reasons),
        "dataSource": dict(Counter(t.get("dataSource") for t in trades)),
        "identityFailures": identity_failures, "belowTickFloor": below_floor,
        "orders": mem.order_measurements.count_documents({"accountId": account_id}), "orderTotalsBps": totals,
        "score": score["result"], "scoringVersion": score["scoringVersion"], "integrityHash": score["integrityHash"],
        "verify": verify_account_v2(mem, account_id, version, version_sha), "jobRuns": len(runs),
    }


def format_report(rep: dict) -> str:
    s = rep["score"]
    lines = [
        f"account: {rep['account']}  (data source: {rep['dataSource']})",
        f"fills measured: {rep['measured']} of {rep['trades']}",
        f"not measured: {rep['unmeasured'] or 'none'}",
        f"identity failures: {rep['identityFailures']}",
        f"taker fills below the tick floor (better than the opposite proxy): {rep['belowTickFloor']}",
        f"orders measured: {rep['orders']}; orders with a total: {len(rep['orderTotalsBps'])}",
        f"scoring version: {rep['scoringVersion']}",
    ]
    for k, c in s["components"].items():
        lines.append(f"  {k:9s} {('%.2f' % c['score']) if c['score'] is not None else 'insufficient data':>18s}"
                     f"  ({c['measured']} measured, {c['unmeasured']} not)")
    if s["grade"]:
        lines.append(f"grade: {s['grade']} ({s['composite']:.2f}), 95% range {s['band']}")
    else:
        lines.append(f"no letter grade: {s['reason']}; 95% range {s['band']}")
    v = rep["verify"]
    lines.append(f"integrity check: {'matched' if v and v['match'] else 'DID NOT MATCH'} ({rep['integrityHash'][:16]}…)")
    return "\n".join(lines)


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--account", required=True)
    a = p.parse_args(argv)
    if not os.environ.get("MONGODB_URI"):
        print("MONGODB_URI is not set")
        return 2
    from pymongo import MongoClient

    from config.versions import SCORING_V2_VERSION
    from measure.service import rest_source
    from scoring_v2.version import load_version, version_file_sha256

    uri = os.environ["MONGODB_URI"]
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "fillscore"
    src = ReadOnlyDB(MongoClient(uri, serverSelectionTimeoutMS=10000)[db_name])
    rep = validate(src, a.account, rest_source, load_version(SCORING_V2_VERSION), version_file_sha256(SCORING_V2_VERSION),
                   int(time.time() * 1000))
    print(format_report(rep))
    return 0 if rep["identityFailures"] == 0 and rep["verify"] and rep["verify"]["match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
