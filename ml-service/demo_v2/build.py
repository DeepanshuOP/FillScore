"""Demo rebuild (M2): decisions -> trades, orders and fee snapshots whose prices all come from real public prints.

  * Each decision places one order at its time t (demo_v2.simulate): a MARKET order takes the next own-side
    aggressor prints within `horizon_ms`; a LIMIT order rests at the same-side proxy and fills only on prints that
    trade through it within `ttl_ms`. A limit decision without a fresh proxy is skipped and counted, never invented.
  * One trade per fill, at the print's price and time. Fees are the published regular-tier rate x notional (USDT
    quote, so feeUsd = fee).
  * Fee snapshot: the demo trader is synthetic, and so is its account. Its snapshot carries the published schedule
    (source "published-schedule", BNB discount off) and is dated at the midpoint of the decision window, so the
    30-day snapshot rule of scoring_v2 covers a one-month demo window. It is a property of the synthetic account,
    never presented as an exchange's answer for a real account.
Nothing here touches a database. Output documents use the field names of shared/fieldRegistry.json.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Iterable

from measure.data.aggtrades import AggTradeWindow

from .decisions import Decision
from .simulate import simulate_limit, simulate_market

TapeSource = Callable[[str, int, int], AggTradeWindow]
PRE_MS = 5_000


def iso(ms: int) -> str:
    dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{ms % 1000:03d}Z"


def build_demo(account_id: str, decisions: Iterable[Decision], tapes: TapeSource, *, fee_rates: dict, ttl_ms: int,
               horizon_ms: int, exchange: str = "binance", fee_source: str = "") -> dict:
    if not account_id.startswith("demo-"):
        raise ValueError("the demo build writes demo-* accounts only")
    decisions = sorted(decisions, key=lambda d: (d.executed_at_ms, d.old_order_id))
    trades, orders, skipped = [], [], {}
    base = {"accountId": account_id, "exchange": exchange, "dataSource": "synthetic-demo"}
    for d in decisions:
        tape = tapes(d.symbol, d.executed_at_ms - PRE_MS, d.executed_at_ms + max(ttl_ms, horizon_ms) + 1)
        if d.order_type == "MARKET":
            o = simulate_market(tape, d.side, d.quantity, d.executed_at_ms, horizon_ms)
        else:
            o = simulate_limit(tape, d.side, d.quantity, d.executed_at_ms, ttl_ms)
            if o is None:
                skipped["no_limit_price"] = skipped.get("no_limit_price", 0) + 1
                continue
        maker = d.order_type == "LIMIT"
        rate = fee_rates["maker" if maker else "taker"]
        quote = 0.0
        for k, f in enumerate(o.fills):
            notional = f.price * f.qty
            quote += notional
            trades.append({**base, "userId": account_id, "symbol": d.symbol, "tradeId": f"v2:{d.old_trade_id}:{k}",
                           "orderId": d.old_order_id, "side": d.side, "orderType": d.order_type, "isMaker": maker,
                           "executionPrice": f.price, "quantity": f.qty, "notional": notional, "fee": notional * rate,
                           "feeUsd": notional * rate, "feeAsset": "USDT", "executedAt": iso(f.ts_ms)})
        orders.append({**base, "symbol": d.symbol, "orderId": d.old_order_id, "side": d.side, "type": d.order_type,
                       "origQty": d.quantity, "executedQty": o.executed_qty, "cummulativeQuoteQty": quote,
                       "price": o.limit_price, "timeInForce": "GTC" if maker else None, "status": o.status,
                       "createdAt": iso(d.executed_at_ms), "updatedAt": iso(o.updated_ms)})
    snaps = []
    if decisions:
        mid = (decisions[0].executed_at_ms + decisions[-1].executed_at_ms) // 2
        for sym in sorted({d.symbol for d in decisions}):
            snaps.append({"accountId": account_id, "exchange": exchange, "symbol": sym, "source": "published-schedule",
                          "standard": {"maker": fee_rates["maker"], "taker": fee_rates["taker"], "buyer": 0.0, "seller": 0.0},
                          "tax": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
                          "special": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
                          "discount": {"enabledForAccount": False, "enabledForSymbol": False, "asset": None, "rate": 1.0},
                          "fetchedAt": iso(mid)})
    return {"trades": trades, "orders": orders, "fee_snapshots": snaps, "skipped": skipped, "feeSource": fee_source,
            "counts": {"decisions": len(decisions), "orders": len(orders), "fills": len(trades)}}
