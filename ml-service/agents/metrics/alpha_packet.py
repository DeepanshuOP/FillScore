"""
Alpha MetricsPacket — deterministic computation from MongoDB trade data.
Measures execution quality vs benchmarks: VWAP deviation, symbol ranking,
hour-of-day quality. All numbers ground truth for Alpha Architect agent.
"""
from __future__ import annotations
import hashlib, json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class AlphaMetricsPacket:
    # ── identity ────────────────────────────────────────────────────────────
    user_id: str
    symbol: str
    computed_at: str
    metrics_version: str = "1.0.0"

    # ── VWAP deviation (MARKET orders only) ──────────────────────────────────
    # vwap_deviation_bps = (executionPrice - vwap5m) / vwap5m * 10000 * side
    # positive = paid more than VWAP (bad for buyer), negative = got better
    # vwap5m is the 5-minute volume-weighted avg price at execution time
    market_order_count: int = 0
    vwap_trades_count: int = 0           # trades that have vwap5m data
    avg_vwap_deviation_bps: float = 0.0
    median_vwap_deviation_bps: float = 0.0
    pct_beating_vwap: float = 0.0        # fraction with negative deviation (beat VWAP)

    # ── symbol ranking by execution quality ──────────────────────────────────
    # ranked by avg fill score (higher = better execution)
    symbol_avg_fill_score: dict[str, float] = field(default_factory=dict)
    symbol_trade_counts: dict[str, int] = field(default_factory=dict)
    best_symbol: str = ""
    worst_symbol: str = ""
    best_symbol_avg_score: float = 0.0
    worst_symbol_avg_score: float = 0.0

    # ── hour-of-day quality ranking ──────────────────────────────────────────
    # ranked by avg fill score per UTC hour
    hour_avg_fill_score: dict[str, float] = field(default_factory=dict)
    best_hour_utc: int = -1
    worst_hour_utc: int = -1
    best_hour_avg_score: float = 0.0
    worst_hour_avg_score: float = 0.0

    # ── worst individual fills (evidence) ────────────────────────────────────
    worst5_vwap_trade_ids: list[str] = field(default_factory=list)
    worst5_vwap_deviation_bps: list[float] = field(default_factory=list)

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
            "vwap_trades_count": self.vwap_trades_count,
            "avg_vwap_deviation_bps": round(self.avg_vwap_deviation_bps, 4),
            "median_vwap_deviation_bps": round(self.median_vwap_deviation_bps, 4),
            "pct_beating_vwap": round(self.pct_beating_vwap, 4),
            "worst5_vwap_deviation_bps": [round(x, 4) for x in self.worst5_vwap_deviation_bps],
            "symbol_avg_fill_score": {k: round(v, 2) for k, v in self.symbol_avg_fill_score.items()},
            "best_symbol": self.best_symbol,
            "worst_symbol": self.worst_symbol,
            "best_symbol_avg_score": round(self.best_symbol_avg_score, 2),
            "worst_symbol_avg_score": round(self.worst_symbol_avg_score, 2),
            "best_hour_utc": self.best_hour_utc,
            "worst_hour_utc": self.worst_hour_utc,
            "best_hour_avg_score": round(self.best_hour_avg_score, 2),
            "worst_hour_avg_score": round(self.worst_hour_avg_score, 2),
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


def build_alpha_packet(trades: list[dict], user_id: str, symbol: str) -> AlphaMetricsPacket:
    """
    Build an AlphaMetricsPacket from a list of trade dicts.
    Each trade dict must have at minimum:
      - _id or id (str)
      - orderType (str): "MARKET" or "LIMIT"
      - isMaker (bool): True = limit fill
      - fillScore (float): composite fill score 0-100
      - symbol (str): trading pair
      - executedAt (str): ISO-8601 UTC timestamp
    Optional:
      - vwap5m (float): 5-min VWAP at execution time
      - executionPrice (float): actual fill price
      - side (str): "BUY" or "SELL" — used to sign VWAP deviation
    """
    if not trades:
        pkt = AlphaMetricsPacket(
            user_id=user_id, symbol=symbol,
            computed_at=datetime.now(timezone.utc).isoformat()
        )
        pkt.content_hash = pkt.compute_hash()
        return pkt

    all_ids = []
    market_trades = []
    limit_ids = []

    for t in trades:
        tid = str(t.get("_id") or t.get("id", ""))
        all_ids.append(tid)
        order_type = str(t.get("orderType", "MARKET")).upper()
        is_maker = bool(t.get("isMaker", False))
        if order_type == "LIMIT" or is_maker:
            limit_ids.append(tid)
        else:
            market_trades.append(t)

    market_count = len(market_trades)
    market_ids = [str(t.get("_id") or t.get("id", "")) for t in market_trades]

    # ── VWAP deviation (market orders with vwap5m data) ───────────────────────
    vwap_deviations = []
    vwap_ids = []
    for t in market_trades:
        vwap = t.get("vwap5m")
        exec_price = t.get("executionPrice") or t.get("price")
        side = str(t.get("side", "BUY")).upper()
        if vwap and exec_price and float(vwap) > 0:
            sign = 1.0 if side == "BUY" else -1.0
            dev = (float(exec_price) - float(vwap)) / float(vwap) * 10000.0 * sign
            vwap_deviations.append(dev)
            vwap_ids.append(str(t.get("_id") or t.get("id", "")))

    sorted_dev = sorted(vwap_deviations)
    avg_dev = _avg(vwap_deviations)
    median_dev = _percentile(sorted_dev, 50)
    pct_beat = sum(1 for d in vwap_deviations if d < 0) / len(vwap_deviations) if vwap_deviations else 0.0

    indexed_dev = sorted(zip(vwap_deviations, vwap_ids), reverse=True)
    worst5_dev_ids = [tid for _, tid in indexed_dev[:5]]
    worst5_dev_vals = [round(d, 4) for d, _ in indexed_dev[:5]]

    # ── symbol ranking by fill score ──────────────────────────────────────────
    sym_scores: dict[str, list[float]] = {}
    sym_ids: dict[str, list[str]] = {}
    for t in trades:
        sym = t.get("symbol", symbol)
        score = float(t.get("fillScore", 0.0))
        tid = str(t.get("_id") or t.get("id", ""))
        sym_scores.setdefault(sym, []).append(score)
        sym_ids.setdefault(sym, []).append(tid)

    sym_avg = {s: round(_avg(scores), 4) for s, scores in sym_scores.items()}
    best_sym = max(sym_avg, key=sym_avg.get) if sym_avg else ""
    worst_sym = min(sym_avg, key=sym_avg.get) if sym_avg else ""

    # ── hour ranking by fill score ────────────────────────────────────────────
    hour_scores: dict[str, list[float]] = {}
    for t in trades:
        try:
            ts = t.get("executedAt", "")
            hour = str(datetime.fromisoformat(ts.replace("Z", "+00:00")).hour).zfill(2)
        except Exception:
            hour = "00"
        score = float(t.get("fillScore", 0.0))
        hour_scores.setdefault(hour, []).append(score)

    hour_avg = {h: round(_avg(scores), 4) for h, scores in hour_scores.items()}
    best_hour_str = max(hour_avg, key=hour_avg.get) if hour_avg else "00"
    worst_hour_str = min(hour_avg, key=hour_avg.get) if hour_avg else "00"

    evidence = {
        "all_trades": all_ids,
        "market_trades": market_ids,
        "limit_trades": limit_ids,
        "vwap_trades": vwap_ids,
        "worst5_vwap_trades": worst5_dev_ids,
    }
    for sym_key, ids in sym_ids.items():
        evidence[f"symbol_{sym_key}"] = ids

    pkt = AlphaMetricsPacket(
        user_id=user_id,
        symbol=symbol,
        computed_at=datetime.now(timezone.utc).isoformat(),
        market_order_count=market_count,
        vwap_trades_count=len(vwap_deviations),
        avg_vwap_deviation_bps=round(avg_dev, 6),
        median_vwap_deviation_bps=round(median_dev, 6),
        pct_beating_vwap=round(pct_beat, 6),
        worst5_vwap_trade_ids=worst5_dev_ids,
        worst5_vwap_deviation_bps=worst5_dev_vals,
        symbol_avg_fill_score=sym_avg,
        symbol_trade_counts={s: len(ids) for s, ids in sym_ids.items()},
        best_symbol=best_sym,
        worst_symbol=worst_sym,
        best_symbol_avg_score=sym_avg.get(best_sym, 0.0),
        worst_symbol_avg_score=sym_avg.get(worst_sym, 0.0),
        hour_avg_fill_score=hour_avg,
        best_hour_utc=int(best_hour_str),
        worst_hour_utc=int(worst_hour_str),
        best_hour_avg_score=hour_avg.get(best_hour_str, 0.0),
        worst_hour_avg_score=hour_avg.get(worst_hour_str, 0.0),
        evidence_index=evidence,
    )
    pkt.content_hash = pkt.compute_hash()
    return pkt
