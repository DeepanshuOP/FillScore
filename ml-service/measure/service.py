"""Runtime measurement job (M1 Part B, Task 10): measure an account's unmeasured fills and orders, and store them.

Outbox design (docs/research/decisions ADR-0011): the trade rows ARE the queue. A real-user trade whose
`measurement.version` is not the current MEASURE_VERSION is pending. Sync inserts trades as before; this job picks
up whatever is pending, so a crash between "trades inserted" and "job queued" cannot lose work, and a re-run is
idempotent without a transaction.

Rules:
  * Demo accounts and synthetic-demo trades are never measured (they are rebuilt in M2).
  * Only Binance spot trades are measured in this version: the prints come from Binance. Other venues get a stored
    record with an `unmeasuredReason`, so they are not retried for this version.
  * A fill younger than 300 s + 5 s is skipped (its last horizon does not exist yet) and retried on the next run.
  * A market-data failure (network, id gap, oversized window) stores nothing; the fill stays pending.
  * Every stored record carries `marketDataRefs` with the checksum of the prints it used.
Order shortfall goes to `order_measurements` (owned here); the backend's `orders` collection is only read.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Callable, Iterable

from config.versions import MEASURE_VERSION

from .benchmarks import MAX_QUOTE_AGE_MS, quote_at
from .data.aggtrades import AggTradeWindow
from .data.ticks import tick_from_prints
from .enrich_fill import HORIZONS_S, FillInput, measure_fill
from .orders import order_is

WRITER = "ml-service/measure/service.py"
PRE_MS = MAX_QUOTE_AGE_MS
POST_MS = max(HORIZONS_S) * 1000
MAX_WINDOW_MS = 30 * 60_000          # one REST window stays well under the endpoint's time-span limits
OPEN_ORDER_END_MS = 3600_000         # an order still open is valued at creation + 1 h, and labelled so
USD_PEGGED_QUOTES = ("USDT", "USDC", "FDUSD")
FINAL_UNFILLED = {"CANCELED", "EXPIRED", "REJECTED", "EXPIRED_IN_MATCH"}
VENUE_REASON = "no public prints for this venue in this measurement version"

MarketSource = Callable[[str, int, int], AggTradeWindow]
_MS = timedelta(milliseconds=1)


@dataclass(frozen=True)
class Need:
    symbol: str
    start_ms: int
    end_ms: int
    key: object


@dataclass
class Batch:
    symbol: str
    start_ms: int
    end_ms: int
    keys: list = field(default_factory=list)
    needs: list = field(default_factory=list)


def rest_source(symbol: str, start_ms: int, end_ms: int) -> AggTradeWindow:
    """Production source: public REST aggTrades (no key), checked for id gaps. Whole-day files are not loaded at
    runtime: a busy day is millions of rows, too large for the service's memory."""
    from .data import rest

    return rest.fetch_window(symbol, start_ms, end_ms)


def plan_windows(needs: Iterable[Need], max_window_ms: int = MAX_WINDOW_MS) -> list[Batch]:
    """Merge the time spans each measurement needs into as few windows as possible, per symbol. A span joins the
    current window when it overlaps or touches it and the merged window stays within max_window_ms."""
    out: list[Batch] = []
    by_symbol: dict[str, list[Need]] = {}
    for n in needs:
        if n.end_ms < n.start_ms:
            raise ValueError("need ends before it starts")
        by_symbol.setdefault(n.symbol, []).append(n)
    for symbol in sorted(by_symbol):
        cur: Batch | None = None
        for n in sorted(by_symbol[symbol], key=lambda x: (x.start_ms, x.end_ms)):
            if cur and n.start_ms <= cur.end_ms + 1 and max(cur.end_ms, n.end_ms) - cur.start_ms <= max_window_ms:
                cur.end_ms = max(cur.end_ms, n.end_ms)
                cur.keys.append(n.key)
                cur.needs.append(n)
            else:
                cur = Batch(symbol, n.start_ms, n.end_ms, [n.key], [n])
                out.append(cur)
    return out


def to_ms(dt) -> int:
    """Mongo datetimes come back naive in UTC."""
    if isinstance(dt, (int, float)):
        return int(dt)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt - datetime(1970, 1, 1, tzinfo=timezone.utc)) // _MS


def _iso(now_ms: int) -> str:
    return datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc).isoformat()


def _fetch(source: MarketSource, batches: list[Batch], skipped: dict) -> list[tuple[Batch, AggTradeWindow]]:
    from .data.rest import WindowTooLargeError

    got = []
    queue = list(batches)
    while queue:
        b = queue.pop(0)
        try:
            got.append((b, source(b.symbol, b.start_ms, b.end_ms)))
        except WindowTooLargeError:
            if len(b.needs) > 1:
                # A busy stretch merged into too many prints for one request chain: fetch each span alone (review M1-2).
                queue[:0] = [Batch(b.symbol, n.start_ms, n.end_ms, [n.key], [n]) for n in b.needs]
                continue
            skipped["market_data"] = skipped.get("market_data", 0) + len(b.keys)
            print(f"[measure] market data window too large for {b.symbol} {b.start_ms}-{b.end_ms}")
        except Exception as e:                       # network, gap: transient, stays pending
            skipped["market_data"] = skipped.get("market_data", 0) + len(b.keys)
            print(f"[measure] market data failed for {b.symbol} {b.start_ms}-{b.end_ms}: {type(e).__name__}")
    return got


def _window_for(got: list[tuple[Batch, AggTradeWindow]], key) -> AggTradeWindow | None:
    for b, w in got:
        if key in b.keys:
            return w
    return None


def _refs(*windows: AggTradeWindow | None) -> list[dict]:
    seen, out = set(), []
    for w in windows:
        for r in (w.refs if w is not None else ()):
            d = r.to_dict()
            k = (d["source"], d["dataset"], d["symbol"], d["date"], tuple(d["window"] or ()), d["sha256"])
            if k not in seen:
                seen.add(k)
                out.append(d)
    return out


def check_data_source(account_id: str, data_source: str) -> None:
    """real-user (production) or synthetic-demo (the offline M2 demo build, demo-* accounts only, in-memory
    databases). Anything else, or a mix, is refused."""
    if data_source not in ("real-user", "synthetic-demo"):
        raise ValueError(f"unsupported data source {data_source!r}")
    if data_source == "synthetic-demo" and not account_id.startswith("demo-"):
        raise ValueError("synthetic-demo data belongs to demo-* accounts only")


def measure_account(db, account_id: str, source: MarketSource, now_ms: int, limit: int = 500,
                    data_source: str = "real-user") -> dict:
    """Measure up to `limit` pending fills of one account, then the orders they belong to and the account's
    unfilled orders. Returns counts: {measured, orders, skipped{reason: n}, pending, measureVersion}.
    `data_source="synthetic-demo"` is for the offline demo build only (demo_v2.build); the runtime never passes it."""
    check_data_source(account_id, data_source)
    skipped: dict[str, int] = {}
    report = {"measured": 0, "orders": 0, "skipped": skipped, "measureVersion": MEASURE_VERSION}
    if account_id.startswith("demo-") and data_source == "real-user":
        skipped["demo"] = 1
        return report
    pending_q = {"accountId": account_id, "dataSource": data_source, "measurement.version": {"$ne": MEASURE_VERSION}}
    # Fills younger than their last horizon are counted but not fetched, so they never fill the batch (review M1-2).
    cutoff = datetime.fromtimestamp((now_ms - POST_MS - PRE_MS) / 1000, tz=timezone.utc).replace(tzinfo=None)
    recent = db.trades.count_documents({**pending_q, "exchange": "binance", "executedAt": {"$gt": cutoff}})
    if recent:
        skipped["too_recent"] = recent
    trades = list(db.trades.find({"$and": [pending_q, {"$or": [{"exchange": {"$ne": "binance"}}, {"executedAt": {"$lte": cutoff}}]}]})
                  .sort("executedAt", 1).limit(limit))

    needs: list[Need] = []
    for t in trades:
        if t.get("exchange") != "binance":
            rec = {"version": MEASURE_VERSION, "tradeId": str(t["tradeId"]), "symbol": t["symbol"],
                   "side": 1 if t["side"] == "BUY" else -1, "unmeasuredReason": VENUE_REASON, "marketDataRefs": [],
                   "measuredAt": _iso(now_ms)}
            db.trades.update_one({"_id": t["_id"]}, {"$set": {"measurement": rec}})
            skipped["venue"] = skipped.get("venue", 0) + 1
            continue
        ts = to_ms(t["executedAt"])
        if ts + POST_MS + PRE_MS > now_ms:
            skipped["too_recent"] = skipped.get("too_recent", 0) + 1
            continue
        needs.append(Need(t["symbol"], ts - PRE_MS, ts + POST_MS, ("fill", t["_id"])))

    got = _fetch(source, plan_windows(needs), skipped)
    ticks: dict[str, float] = {}
    for b, w in got:
        tk = tick_from_prints(w.price)
        if tk is not None:
            ticks[b.symbol] = min(ticks.get(b.symbol, tk), tk)

    by_id = {t["_id"]: t for t in trades}
    touched_orders: set[tuple[str, str]] = set()
    for n in needs:
        w = _window_for(got, n.key)
        if w is None:
            continue
        t = by_id[n.key[1]]
        tick = ticks.get(t["symbol"])
        if tick is None:
            skipped["price_step_unknown"] = skipped.get("price_step_unknown", 0) + 1
            continue
        f = FillInput(str(t["tradeId"]), t["symbol"], 1 if t["side"] == "BUY" else -1, float(t["executionPrice"]),
                      float(t["quantity"]), to_ms(t["executedAt"]))
        rec = measure_fill(f, w, tick)
        rec["measuredAt"] = _iso(now_ms)
        db.trades.update_one({"_id": t["_id"]}, {"$set": {"measurement": rec}})
        report["measured"] += 1
        touched_orders.add((t["symbol"], str(t["orderId"])))

    report["orders"] = _measure_orders(db, account_id, source, now_ms, touched_orders, skipped)
    report["pending"] = db.trades.count_documents(pending_q)
    return report


def _order_plan(db, account_id: str, symbol: str, order_id: str, now_ms: int, skipped: dict) -> dict | None:
    fills = list(db.trades.find({"accountId": account_id, "exchange": "binance", "symbol": symbol, "orderId": order_id}).sort("executedAt", 1))
    if any((f.get("measurement") or {}).get("version") != MEASURE_VERSION for f in fills):
        skipped["order_fills_pending"] = skipped.get("order_fills_pending", 0) + 1
        return None
    o = db.orders.find_one({"accountId": account_id, "exchange": "binance", "symbol": symbol, "orderId": order_id})
    if o is None and not fills:
        return None
    side = 1 if (o or fills[0])["side"] == "BUY" else -1
    plan = {"symbol": symbol, "orderId": order_id, "side": side, "fills": fills, "order": o,
            "arrivalMs": to_ms(o["createdAt"]) if o else to_ms(fills[0]["executedAt"]), "endMs": None, "endBasis": None}
    if o is not None:
        status = o["status"]
        if status == "FILLED":
            plan["endBasis"] = "filled"
        elif status in FINAL_UNFILLED:
            plan["endMs"], plan["endBasis"] = to_ms(o["updatedAt"]), f"order {status.lower()}"
        else:
            plan["endMs"], plan["endBasis"] = plan["arrivalMs"] + OPEN_ORDER_END_MS, "order still open: creation + 1 h"
        if plan["endMs"] is not None and plan["endMs"] > now_ms:
            skipped["order_end_in_future"] = skipped.get("order_end_in_future", 0) + 1
            return None
    return plan


def _fees_quote(symbol: str, fills: list[dict]) -> float | None:
    """Fees in the quote currency, from feeUsd, for USD-pegged quote assets only (1 USDT/USDC/FDUSD taken as 1 USD).
    None when any fill lacks feeUsd or the quote asset is not USD-pegged."""
    if not symbol.endswith(USD_PEGGED_QUOTES):
        return None
    total = 0.0
    for f in fills:
        v = f.get("feeUsd")
        if not isinstance(v, (int, float)) or isinstance(v, bool):
            return None
        total += float(v)
    return total


def _measure_orders(db, account_id: str, source: MarketSource, now_ms: int, touched: set, skipped: dict) -> int:
    keys = set(touched)
    # Orders that never filled have no trade to point at them: pick up the final ones not yet measured.
    for o in db.orders.find({"accountId": account_id, "exchange": "binance", "executedQty": 0, "status": {"$in": sorted(FINAL_UNFILLED)}}):
        done = db.order_measurements.find_one({"accountId": account_id, "exchange": "binance", "symbol": o["symbol"], "orderId": o["orderId"], "version": MEASURE_VERSION})
        if done is None:
            keys.add((o["symbol"], str(o["orderId"])))
    # Orders measured while still open are measured again once the exchange reports them final (review M1-5).
    for om in db.order_measurements.find({"accountId": account_id, "exchange": "binance", "version": MEASURE_VERSION,
                                          "endBasis": {"$regex": "^order still open"}}):
        o = db.orders.find_one({"accountId": account_id, "exchange": "binance", "symbol": om["symbol"], "orderId": om["orderId"]})
        if o is not None and (o["status"] == "FILLED" or o["status"] in FINAL_UNFILLED):
            keys.add((om["symbol"], str(om["orderId"])))
    plans =[p for p in (_order_plan(db, account_id, s, oid, now_ms, skipped) for s, oid in sorted(keys)) if p]
    needs = []
    for i, p in enumerate(plans):
        if p["order"] is not None:
            needs.append(Need(p["symbol"], p["arrivalMs"] - PRE_MS, p["arrivalMs"], ("arrival", i)))
        if p["endMs"] is not None:
            needs.append(Need(p["symbol"], p["endMs"] - PRE_MS, p["endMs"], ("end", i)))
    got = _fetch(source, plan_windows(needs), skipped)
    n = 0
    for i, p in enumerate(plans):
        wa, we = _window_for(got, ("arrival", i)), _window_for(got, ("end", i))
        if (p["order"] is not None and wa is None) or (p["endMs"] is not None and we is None):
            continue                                  # market data failed: stays pending
        fills = p["fills"]
        doc = {"accountId": account_id, "exchange": "binance", "symbol": p["symbol"], "orderId": p["orderId"],
               "version": MEASURE_VERSION, "side": p["side"], "tradeIds": [str(f["tradeId"]) for f in fills],
               "arrivalMs": p["arrivalMs"], "endMs": p["endMs"], "endBasis": p["endBasis"], "arrivalMid": None,
               "endMid": None, "shortfall": None, "unmeasuredReason": None, "marketDataRefs": [],
               "measuredAt": datetime.fromtimestamp(now_ms / 1000, tz=timezone.utc)}
        fill_rows = [(float(f["executionPrice"]), float(f["quantity"]), f["measurement"].get("mid")) for f in fills]
        refs_from_fills = [r for f in fills for r in f["measurement"].get("marketDataRefs", [])]
        if p["order"] is not None:
            arrival = quote_at(wa, p["arrivalMs"]).mid
            basis, ordered = "order", float(p["order"]["origQty"])
        else:
            arrival = fill_rows[0][2]
            basis, ordered = "first_fill", None
        end_mid = quote_at(we, p["endMs"]).mid if we is not None else None
        doc["arrivalMid"], doc["endMid"] = arrival, end_mid
        doc["marketDataRefs"] = _refs(wa, we) + [r for r in refs_from_fills if r not in _refs(wa, we)]
        if arrival is None:
            doc["unmeasuredReason"] = "no fresh print before the order's arrival time"
        elif basis == "order" and float(p["order"]["executedQty"]) > 0 and not fills:
            doc["unmeasuredReason"] = "order has executed quantity but no stored fills"
        elif basis == "order" and abs(float(p["order"]["executedQty"]) - sum(q for _, q, _ in fill_rows)) > 1e-9 * max(1.0, float(p["order"]["executedQty"])):
            # Some fills are outside the synced history: the unfilled part would be overstated (review M1-6).
            doc["unmeasuredReason"] = "stored fills do not add up to the order's executed quantity"
        else:
            try:
                doc["shortfall"] = order_is(p["side"], ordered, fill_rows, arrival, end_mid, _fees_quote(p["symbol"], fills), basis)
            except ValueError as e:
                doc["unmeasuredReason"] = f"inconsistent order data: {e}"
        db.order_measurements.update_one(
            {"accountId": account_id, "exchange": "binance", "symbol": p["symbol"], "orderId": p["orderId"]},
            {"$set": doc}, upsert=True)
        n += 1
    return n
