"""Compare imported fills with the public market price at the same second (M6 §1).

For each fill: the mid-price just before it, built from the last public aggregate trade on each side strictly before the fill with none older
than 5 s (the rules of the account measurement job: measure.benchmarks.quote_at), and the effective half-spread of the fill against that mid
(measure.metrics.effective_half_spread_bps). The fill's own fee is shown beside it. A fill that cannot be compared (a quote currency that is
not a dollar, no fresh print, market data that could not be fetched) is listed with its reason and left out of every statistic: it is never
counted as zero. The market data are fetched as the job fetches them (measure.service: one merged window per symbol where fills are close).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median

from csv_import.kraken import KrakenFill, reference_symbol
from measure.benchmarks import MAX_QUOTE_AGE_MS, quote_at
from measure.metrics import effective_half_spread_bps
from measure.service import MarketSource, Need, _fetch, _window_for, plan_windows

ASSUMPTIONS = [
    "The reference market is Binance's USDT market (for example BTCUSDT for a BTC/USD fill). That is an assumption: no official page links "
    "Kraken's USD prices to Binance's USDT prices, and the USDT/USD basis moves.",
    "The mid-price is built from public aggregate trades (the last trade on each side before the fill, none older than 5 seconds), not from "
    "Kraken's order book, which was not recorded.",
    "The fee is the commission Kraken states for the trade; Kraken says it is not necessarily the amount deducted from the account.",
    "Costs are in quote-currency units and read as US dollars for a USD fill.",
]


@dataclass
class FillCheck:
    txid: str
    order_id: str
    symbol: str | None
    side: int
    ts_ms: int
    price: float
    qty: float
    cost: float
    fee_bps: float
    fee_usd: float
    taker: bool | None
    mid: float | None = None
    quote_quality: str | None = None
    eff_half_bps: float | None = None
    total_bps: float | None = None
    cost_usd: float | None = None
    unmeasured_reason: str | None = None
    market_data: list[dict] = field(default_factory=list)


@dataclass
class CheckResult:
    fills: list[FillCheck]
    summary: dict
    assumptions: list[str]


def _summary(fills: list[FillCheck]) -> dict:
    ok = [f for f in fills if f.eff_half_bps is not None]
    reasons: dict[str, int] = {}
    for f in fills:
        if f.unmeasured_reason:
            reasons[f.unmeasured_reason] = reasons.get(f.unmeasured_reason, 0) + 1
    total_cost = sum(f.cost for f in ok)
    return {
        "fills": len(fills), "measured": len(ok), "unmeasured": len(fills) - len(ok), "unmeasured_reasons": reasons,
        "median_eff_half_bps": median(f.eff_half_bps for f in ok) if ok else None,
        "weighted_eff_half_bps": (sum(f.eff_half_bps * f.cost for f in ok) / total_cost) if ok and total_cost > 0 else None,
        "total_eff_cost_usd": sum(f.cost_usd for f in ok) if ok else None,
        "total_fee_usd": sum(f.fee_usd for f in ok) if ok else None,
        "weighted_fee_bps": (sum(f.fee_bps * f.cost for f in ok) / total_cost) if ok and total_cost > 0 else None,
    }


def check_fills(fills: list[KrakenFill], source: MarketSource) -> CheckResult:
    out: list[FillCheck] = []
    needs: list[Need] = []
    for i, f in enumerate(fills):
        symbol, why = reference_symbol(f.base, f.quote)
        fc = FillCheck(txid=f.txid, order_id=f.order_id, symbol=symbol, side=f.side, ts_ms=f.ts_ms, price=f.price, qty=f.qty, cost=f.cost,
                       fee_bps=f.fee_bps, fee_usd=f.fee, taker=f.taker, unmeasured_reason=why)
        out.append(fc)
        if symbol is not None:
            needs.append(Need(symbol, f.ts_ms - MAX_QUOTE_AGE_MS, f.ts_ms, i))
    skipped: dict[str, int] = {}
    got = _fetch(source, plan_windows(needs), skipped)
    for n in needs:
        fc = out[n.key]
        w = _window_for(got, n.key)
        if w is None:
            fc.unmeasured_reason = "market data could not be fetched"
            continue
        fc.market_data = [r.to_dict() for r in w.refs]
        q = quote_at(w, fc.ts_ms)
        fc.quote_quality = q.quality
        if q.mid is None:
            fc.unmeasured_reason = f"no fresh print within {MAX_QUOTE_AGE_MS} ms before the fill"
            continue
        fc.mid = q.mid
        fc.eff_half_bps = effective_half_spread_bps(fc.side, fc.price, q.mid)
        fc.total_bps = fc.eff_half_bps + fc.fee_bps
        fc.cost_usd = fc.eff_half_bps / 1e4 * fc.cost
    return CheckResult(out, _summary(out), list(ASSUMPTIONS))
