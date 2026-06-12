"""
Liquidity MetricsPacket — deterministic computation from MongoDB trade data.
MARKET orders only: limit/maker fills are immune to book sweeps and must be
excluded from slippage analysis (this is documented in the paper).
"""
from __future__ import annotations
import hashlib, json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class LiquidityMetricsPacket:
    # ── identity ────────────────────────────────────────────────────────────
    user_id: str
    symbol: str
    computed_at: str
    metrics_version: str = "1.0.0"

    # ── slippage stats (MARKET orders only) ──────────────────────────────────
    # arrivalSlippageBps = (executionPrice - arrivalPrice) / arrivalPrice * 10000 * side
    # positive = paid more than arrival (bad), negative = got better than arrival (good)
    market_order_count: int = 0
    limit_order_count: int = 0          # excluded from slippage — recorded for transparency
    avg_slippage_bps: float = 0.0
    median_slippage_bps: float = 0.0
    p90_slippage_bps: float = 0.0       # worst 10% of fills
    pct_negative_slippage: float = 0.0  # fraction where fill was BETTER than arrival

    # ── worst fills (evidence) ───────────────────────────────────────────────
    worst5_trade_ids: list[str] = field(default_factory=list)   # top 5 by slippage bps
    worst5_slippage_bps: list[float] = field(default_factory=list)

    # ── per-hour slippage ────────────────────────────────────────────────────
    avg_slippage_by_hour: dict[str, float] = field(default_factory=dict)  # "HH" → avg bps
    worst_hour_utc: int = -1
    best_hour_utc: int = -1

    # ── adverse vs clean split ───────────────────────────────────────────────
    # whale_adverse trades vs non-adverse — both on MARKET orders only
    adverse_slippage_avg_bps: float = 0.0
    clean_slippage_avg_bps: float = 0.0
    adverse_vs_clean_diff_bps: float = 0.0   # adverse - clean (positive = whale hurts)
    adverse_market_count: int = 0
    clean_market_count: int = 0

    # ── reversion metrics ────────────────────────────────────────────────────
    # reversion_Xs = avg price change X seconds after fill (from cached aggTrades)
    # positive reversion after a BUY = you paid a temporary-impact premium
    # = adverse selection evidence (BTCA-class metric)
    has_reversion_data: bool = False
    reversion_30s_avg_bps: float = 0.0
    reversion_60s_avg_bps: float = 0.0
    reversion_trade_count: int = 0      # how many trades have reversion data

    # ── evidence index ───────────────────────────────────────────────────────
    evidence_index: dict[str, list[str]] = field(default_factory=dict)

    # ── integrity ────────────────────────────────────────────────────────────
    content_hash: str = ""

    def compute_hash(self) -> str:
        payload = {k: v for k, v in asdict(self).items()
                   if k not in ("content_hash", "computed_at")}
        serialised = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialised.encode()).hexdigest()[:16]

    def to_prompt_dict(self) -> dict[str, Any]:
        return {
            "market_order_count": self.market_order_count,
            "limit_order_count": self.limit_order_count,
            "avg_slippage_bps": round(self.avg_slippage_bps, 4),
            "median_slippage_bps": round(self.median_slippage_bps, 4),
            "p90_slippage_bps": round(self.p90_slippage_bps, 4),
            "pct_negative_slippage": round(self.pct_negative_slippage, 4),
            "worst5_slippage_bps": [round(x, 4) for x in self.worst5_slippage_bps],
            "worst_hour_utc": self.worst_hour_utc,
            "best_hour_utc": self.best_hour_utc,
            "adverse_slippage_avg_bps": round(self.adverse_slippage_avg_bps, 4),
            "clean_slippage_avg_bps": round(self.clean_slippage_avg_bps, 4),
            "adverse_vs_clean_diff_bps": round(self.adverse_vs_clean_diff_bps, 4),
            "adverse_market_count": self.adverse_market_count,
            "clean_market_count": self.clean_market_count,
            "has_reversion_data": self.has_reversion_data,
            "reversion_30s_avg_bps": round(self.reversion_30s_avg_bps, 4),
            "reversion_60s_avg_bps": round(self.reversion_60s_avg_bps, 4),
            "reversion_trade_count": self.reversion_trade_count,
            "evidence_counts": {k: len(v) for k, v in self.evidence_index.items()},
            "content_hash": self.content_hash,
            "metrics_version": self.metrics_version,
        }


def _avg(vals: list[float]) -> float:
    return sum(vals) / len(vals) if vals else 0.0


def _percentile(sorted_vals: list[float], p: float) -> float:
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    idx = (p / 100) * (n - 1)
    lo, hi = int(idx), min(int(idx) + 1, n - 1)
    return sorted_vals[lo] + (idx - lo) * (sorted_vals[hi] - sorted_vals[lo])


def build_liquidity_packet(trades: list[dict], user_id: str, symbol: str) -> LiquidityMetricsPacket:
    """
    Build a LiquidityMetricsPacket from a list of trade dicts.
    Each trade dict must have at minimum:
      - _id or id (str)
      - orderType (str): "MARKET" or "LIMIT" (case-insensitive)
      - isMaker (bool): alternative way to identify limit fills
      - arrivalSlippageBps (float): pre-computed slippage in bps
      - executedAt (str): ISO-8601 UTC timestamp
    Optional:
      - whale_adverse (bool): from whale scorer
      - reversion_30s_bps (float): post-fill 30s price drift in bps
      - reversion_60s_bps (float): post-fill 60s price drift in bps
    """
    if not trades:
        pkt = LiquidityMetricsPacket(
            user_id=user_id, symbol=symbol,
            computed_at=datetime.now(timezone.utc).isoformat()
        )
        pkt.content_hash = pkt.compute_hash()
        return pkt

    market_trades = []
    limit_ids = []
    all_ids = []

    for t in trades:
        tid = str(t.get("_id") or t.get("id", ""))
        all_ids.append(tid)
        order_type = str(t.get("orderType", "MARKET")).upper()
        is_maker = bool(t.get("isMaker", False))
        # a trade is a limit fill if orderType==LIMIT OR isMaker==True
        if order_type == "LIMIT" or is_maker:
            limit_ids.append(tid)
        else:
            market_trades.append(t)

    limit_count = len(limit_ids)
    market_count = len(market_trades)

    if not market_trades:
        pkt = LiquidityMetricsPacket(
            user_id=user_id, symbol=symbol,
            computed_at=datetime.now(timezone.utc).isoformat(),
            market_order_count=0,
            limit_order_count=limit_count,
            evidence_index={"all_trades": all_ids, "limit_trades": limit_ids},
        )
        pkt.content_hash = pkt.compute_hash()
        return pkt

    # ── slippage stats ────────────────────────────────────────────────────────
    slippages = [float(t.get("arrivalSlippageBps", 0.0)) for t in market_trades]
    market_ids = [str(t.get("_id") or t.get("id", "")) for t in market_trades]
    sorted_slip = sorted(slippages)
    avg_slip = _avg(slippages)
    median_slip = _percentile(sorted_slip, 50)
    p90_slip = _percentile(sorted_slip, 90)
    pct_neg = sum(1 for s in slippages if s < 0) / market_count

    # worst 5 by slippage bps (highest = worst)
    indexed = sorted(zip(slippages, market_ids), reverse=True)
    worst5_ids = [tid for _, tid in indexed[:5]]
    worst5_vals = [round(s, 4) for s, _ in indexed[:5]]

    # ── per-hour slippage ─────────────────────────────────────────────────────
    hour_slip: dict[str, list[float]] = {}
    for t, s in zip(market_trades, slippages):
        try:
            ts = t.get("executedAt", "")
            hour = str(datetime.fromisoformat(ts.replace("Z", "+00:00")).hour).zfill(2)
        except Exception:
            hour = "00"
        hour_slip.setdefault(hour, []).append(s)
    avg_slip_by_hour = {h: round(_avg(vals), 4) for h, vals in hour_slip.items()}
    worst_hour = int(max(avg_slip_by_hour, key=avg_slip_by_hour.get)) if avg_slip_by_hour else -1
    best_hour = int(min(avg_slip_by_hour, key=avg_slip_by_hour.get)) if avg_slip_by_hour else -1

    # ── adverse vs clean split ────────────────────────────────────────────────
    adverse_slips, clean_slips = [], []
    adverse_ids_market, clean_ids_market = [], []
    for t, s in zip(market_trades, slippages):
        tid = str(t.get("_id") or t.get("id", ""))
        if t.get("whale_adverse", False):
            adverse_slips.append(s)
            adverse_ids_market.append(tid)
        else:
            clean_slips.append(s)
            clean_ids_market.append(tid)
    adv_avg = _avg(adverse_slips)
    clean_avg = _avg(clean_slips)
    diff = round(adv_avg - clean_avg, 6)

    # ── reversion metrics ─────────────────────────────────────────────────────
    rev30_vals, rev60_vals, rev_ids = [], [], []
    for t in market_trades:
        r30 = t.get("reversion_30s_bps")
        r60 = t.get("reversion_60s_bps")
        if r30 is not None and r60 is not None:
            rev30_vals.append(float(r30))
            rev60_vals.append(float(r60))
            rev_ids.append(str(t.get("_id") or t.get("id", "")))
    has_rev = len(rev30_vals) > 0

    evidence = {
        "all_trades": all_ids,
        "market_trades": market_ids,
        "limit_trades": limit_ids,
        "worst5_trades": worst5_ids,
        "adverse_market_trades": adverse_ids_market,
        "clean_market_trades": clean_ids_market,
        "reversion_trades": rev_ids,
    }

    pkt = LiquidityMetricsPacket(
        user_id=user_id,
        symbol=symbol,
        computed_at=datetime.now(timezone.utc).isoformat(),
        market_order_count=market_count,
        limit_order_count=limit_count,
        avg_slippage_bps=round(avg_slip, 6),
        median_slippage_bps=round(median_slip, 6),
        p90_slippage_bps=round(p90_slip, 6),
        pct_negative_slippage=round(pct_neg, 6),
        worst5_trade_ids=worst5_ids,
        worst5_slippage_bps=worst5_vals,
        avg_slippage_by_hour=avg_slip_by_hour,
        worst_hour_utc=worst_hour,
        best_hour_utc=best_hour,
        adverse_slippage_avg_bps=round(adv_avg, 6),
        clean_slippage_avg_bps=round(clean_avg, 6),
        adverse_vs_clean_diff_bps=diff,
        adverse_market_count=len(adverse_slips),
        clean_market_count=len(clean_slips),
        has_reversion_data=has_rev,
        reversion_30s_avg_bps=round(_avg(rev30_vals), 6),
        reversion_60s_avg_bps=round(_avg(rev60_vals), 6),
        reversion_trade_count=len(rev30_vals),
        evidence_index=evidence,
    )
    pkt.content_hash = pkt.compute_hash()
    return pkt
