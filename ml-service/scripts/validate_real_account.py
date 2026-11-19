"""Validate measurement v2 and Scoring v2 on one real account. Read-only and dry-run only: it never writes anywhere
except an in-memory copy.

    cd ml-service && .venv/bin/python scripts/validate_real_account.py --account <accountId>

MONGODB_URI is loaded from the service env files by the script itself (or read from the environment); only variable
names are printed. Never source an env file in a shell. The account's trades, orders and fee snapshots are copied
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


FINAL_UNFILLED = ("CANCELED", "EXPIRED", "REJECTED", "EXPIRED_IN_MATCH")
QTY_TOL = 1e-9
FEE_REL_TOL = 0.01          # Binance rounds a fee to the asset's precision: a 1% band is not a finding


def order_outcomes(orders: list[dict]) -> dict:
    """Orders by type and outcome. filled: executed >= ordered; partial: some but not all (whatever the status);
    unfilled: nothing executed and the order is final; open: nothing executed and not final yet."""
    out: dict = {"total": len(orders)}
    for o in orders:
        t = str(o.get("type") or "OTHER")
        row = out.setdefault(t, {"total": 0, "filled": 0, "partial": 0, "unfilled": 0, "open": 0})
        row["total"] += 1
        orig, ex = float(o.get("origQty") or 0), float(o.get("executedQty") or 0)
        if orig > 0 and ex >= orig * (1 - QTY_TOL):
            row["filled"] += 1
        elif ex > 0:
            row["partial"] += 1
        elif o.get("status") in FINAL_UNFILLED:
            row["unfilled"] += 1
        else:
            row["open"] += 1
    return out


def unfilled_cost(order_measurements: list[dict], orders_below_full_fill: int) -> dict:
    """The cost of the part of an order that did not fill: opportunity bps x intended notional / 1e4 (USD), over measured
    orders with a fill ratio below 1. An order below a full fill that has no measurement is counted as not measured."""
    usd, bps = [], []
    for om in order_measurements:
        s = om.get("shortfall")
        if not s or not isinstance(s.get("fillRatio"), (int, float)) or s["fillRatio"] >= 1 or s.get("opportunityBps") is None:
            continue
        bps.append(float(s["opportunityBps"]))
        usd.append(float(s["opportunityBps"]) * float(s["intendedNotional"]) / 1e4)
    measured = len(usd)
    srt = sorted(bps)
    median = None if not srt else (srt[len(srt) // 2] if len(srt) % 2 else (srt[len(srt) // 2 - 1] + srt[len(srt) // 2]) / 2)
    return {"measured": measured, "notMeasured": max(orders_below_full_fill - measured, 0),
            "totalUsd": sum(usd) if measured else None, "medianBps": median}


def fee_check(trades: list[dict], snapshots: list[dict]) -> dict:
    """Fees paid against the rate the account's commission snapshot states: expected = notional x effective rate
    (measure.fees; the BNB discount only when the fee was paid in BNB and the snapshot enables it). feeUsd is the paid fee.
    A fill whose symbol has no snapshot is not compared (never guessed)."""
    from measure.fees import effective_rate
    latest: dict = {}
    for s in snapshots:
        cur = latest.get(s["symbol"])
        if cur is None or str(s.get("fetchedAt")) > str(cur.get("fetchedAt")):
            latest[s["symbol"]] = s
    paid = expected = 0.0
    compared = no_snapshot = above = below = bnb = 0
    for t in trades:
        snap, fee, notional = latest.get(t["symbol"]), t.get("feeUsd"), t.get("notional")
        if snap is None:
            no_snapshot += 1
            continue
        if not isinstance(fee, (int, float)) or isinstance(fee, bool) or not notional or notional <= 0:
            continue
        in_bnb = t.get("feeAsset") == "BNB"
        try:
            exp = notional * effective_rate(snap, t["side"], bool(t.get("isMaker")), in_bnb)
        except ValueError:
            continue
        compared += 1
        bnb += in_bnb
        paid, expected = paid + fee, expected + exp
        if fee > exp * (1 + FEE_REL_TOL) + 1e-12:
            above += 1
        elif fee < exp * (1 - FEE_REL_TOL) - 1e-12:
            below += 1
    return {"compared": compared, "noSnapshot": no_snapshot, "bnbFees": bnb, "aboveRate": above, "belowRate": below,
            "paidUsd": paid if compared else None, "expectedUsd": expected if compared else None,
            "differenceUsd": (paid - expected) if compared else None}


def validate(src, account_id: str, source, version: dict, version_sha: str, now_ms: int, expected_cost=None) -> dict:
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
        r = measure_account(mem, account_id, source, now_ms, expected_cost=expected_cost)
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

    from expected_cost.aggregate import cost_vs_expected
    om_rows = list(mem.order_measurements.find({"accountId": account_id}))
    orders = list(mem.orders.find({"accountId": account_id}))
    outcomes = order_outcomes(orders)
    below_full = sum(1 for o in orders if o.get("status") in FINAL_UNFILLED
                     and float(o.get("executedQty") or 0) < float(o.get("origQty") or 0) * (1 - QTY_TOL))
    extra = {
        "outcomes": outcomes,
        "costVsExpected": cost_vs_expected(om_rows),
        "unfilledCost": unfilled_cost(om_rows, below_full),
        "feeCheck": fee_check(trades, list(mem.fee_snapshots.find({"accountId": account_id}))),
        "marketOrders": (outcomes.get("MARKET") or {}).get("total", 0),
    }
    return {**extra,
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
    if "outcomes" in rep:
        lines += _sections(rep)
    v = rep["verify"]
    lines.append(f"integrity check: {'matched' if v and v['match'] else 'DID NOT MATCH'} ({rep['integrityHash'][:16]}…)")
    return "\n".join(lines)


def _usd(x) -> str:
    return "insufficient data" if x is None else f"${x:,.2f}"


def _sections(rep: dict) -> list[str]:
    """Order outcomes, cost against expectation, unfilled-order cost and fees against the account's rates. Past-tense findings;
    a value that could not be measured says so."""
    out = ["", "== Order outcomes (from the exchange's order records)"]
    oc = rep["outcomes"]
    out.append(f"orders: {oc['total']}")
    for t in sorted(k for k in oc if k != "total"):
        r = oc[t]
        out.append(f"  {t:7s} {r['total']:3d}: {r['filled']} filled, {r['partial']} partly filled, {r['unfilled']} ended with nothing filled, {r['open']} still open")

    out += ["", "== Cost against expectation (market orders)"]
    c = rep["costVsExpected"]
    if c.get("insufficient"):
        x = c["excluded"]
        out.append(f"insufficient data: {c['n']} market orders had a usable expected cost; at least 20 are needed (the account has {rep['marketOrders']} market orders).")
        out.append(f"  not used: {x['noExpectedCost']} without an expected cost, {x['outsideModel']} not priced by the model (limit orders, or beyond its calibrated range), {x['partlyFilled']} partly filled")
    else:
        out.append(f"{c['n']} market orders: paid {c['paidBps']:.3f} bps ({_usd(c['paidUsd'])}); the model expected {c['expectedBps']:.3f} bps ({_usd(c['expectedUsd'])}) for orders of this size in the same hours.")
        out.append(f"  difference {c['excessBps']:+.3f} bps, {int(c['level'] * 100)}% interval {c['lowBps']:+.3f} to {c['highBps']:+.3f} bps; calibration {c['version']}")
        x = c["excluded"]
        out.append(f"  not used: {x['noExpectedCost']} without an expected cost, {x['outsideModel']} not priced by the model (limit orders, or beyond its calibrated range), {x['partlyFilled']} partly filled")

    out += ["", "== Cost of orders that did not fill completely"]
    u = rep["unfilledCost"]
    if u["measured"] == 0:
        out.append(f"insufficient data: no order below a full fill has a measured cost ({u['notMeasured']} not measured).")
    else:
        out.append(f"{u['measured']} orders ended below a full fill with a measured cost: {_usd(u['totalUsd'])} in total, median {u['medianBps']:.3f} bps of the intended notional"
                   f" ({u['notMeasured']} more not measured).")

    out += ["", "== Fees against the account's rates"]
    f = rep["feeCheck"]
    if f["compared"] == 0:
        out.append(f"insufficient data: no fill could be compared with a commission snapshot ({f['noSnapshot']} without one).")
    else:
        out.append(f"{f['compared']} fills compared: paid {_usd(f['paidUsd'])}; the account's stated rates give {_usd(f['expectedUsd'])}; difference {f['differenceUsd']:+.4f} USD.")
        out.append(f"  paid above the stated rate (beyond 1%): {f['aboveRate']}; below: {f['belowRate']}; fees paid in BNB: {f['bnbFees']}; fills without a snapshot: {f['noSnapshot']}")
    out.append("")
    return out


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--account", required=True)
    a = p.parse_args(argv)
    # Load the service env files here (python-dotenv); never source them in a shell. Names only are printed.
    import env_report

    res = env_report.load_and_report(["MONGODB_URI"], str(ROOT / ".env"), str(ROOT.parent / "backend" / ".env"))
    if not res["present"]["MONGODB_URI"]:
        print("MONGODB_URI is not set")
        return 2
    from pymongo import MongoClient

    from config.versions import SCORING_V2_VERSION
    from measure.service import rest_source
    from scoring_v2.version import load_version, version_file_sha256

    uri = os.environ["MONGODB_URI"]
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] or "fillscore"
    src = ReadOnlyDB(MongoClient(uri, serverSelectionTimeoutMS=10000)[db_name])
    from expected_cost.runtime import kline_expected_cost_hook   # Binance public 1-minute klines for the hour before each market order

    rep = validate(src, a.account, rest_source, load_version(SCORING_V2_VERSION), version_file_sha256(SCORING_V2_VERSION),
                   int(time.time() * 1000), expected_cost=kline_expected_cost_hook())
    print(format_report(rep))
    return 0 if rep["identityFailures"] == 0 and rep["verify"] and rep["verify"]["match"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
