"""
Risk MetricsPacket — deterministic computation from MongoDB trade data.
Computes HHI concentration, size distribution, adverse selection rates,
and hour-of-day concentration. All numbers ground truth for Risk Auditor.
"""
from __future__ import annotations
import hashlib, json, math
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class RiskMetricsPacket:
    # ── identity ────────────────────────────────────────────────────────────
    user_id: str
    symbol: str
    computed_at: str
    metrics_version: str = "1.0.0"

    # ── concentration (HHI) ──────────────────────────────────────────────────
    # HHI = sum of squared market-share fractions across symbols traded
    # Range: 1/N (perfectly diversified) to 1.0 (single symbol only)
    # HHI > 0.25 = high concentration (US DOJ standard)
    symbol_hhi: float = 0.0
    symbol_notional_shares: dict[str, float] = field(default_factory=dict)  # symbol → fraction of total notional
    top_symbol_by_notional: str = ""
    top_symbol_notional_fraction: float = 0.0

    # ── hour concentration ───────────────────────────────────────────────────
    # Same HHI logic applied to UTC hours → measures how clustered trading is in time
    hour_hhi: float = 0.0
    top_hour_utc: int = -1
    top_hour_trade_fraction: float = 0.0
    hour_trade_counts: dict[str, int] = field(default_factory=dict)  # "HH" → count

    # ── size distribution ────────────────────────────────────────────────────
    avg_trade_usd: float = 0.0
    median_trade_usd: float = 0.0
    p90_trade_usd: float = 0.0
    max_trade_usd: float = 0.0
    large_trade_count: int = 0          # trades > 2× median
    large_trade_ids: list[str] = field(default_factory=list)

    # ── adverse selection (whale correlation) ────────────────────────────────
    total_trades: int = 0
    whale_adverse_count: int = 0        # trades flagged whale_adverse=True
    adverse_rate: float = 0.0           # whale_adverse_count / total_trades
    adverse_trade_ids: list[str] = field(default_factory=list)
    # per-symbol breakdown
    adverse_rate_by_symbol: dict[str, float] = field(default_factory=dict)

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
            "symbol_hhi": round(self.symbol_hhi, 4),
            "top_symbol_by_notional": self.top_symbol_by_notional,
            "top_symbol_notional_fraction": round(self.top_symbol_notional_fraction, 4),
            "symbol_notional_shares": {k: round(v, 4) for k, v in self.symbol_notional_shares.items()},
            "hour_hhi": round(self.hour_hhi, 4),
            "top_hour_utc": self.top_hour_utc,
            "top_hour_trade_fraction": round(self.top_hour_trade_fraction, 4),
            "avg_trade_usd": round(self.avg_trade_usd, 2),
            "median_trade_usd": round(self.median_trade_usd, 2),
            "p90_trade_usd": round(self.p90_trade_usd, 2),
            "large_trade_count": self.large_trade_count,
            "total_trades": self.total_trades,
            "whale_adverse_count": self.whale_adverse_count,
            "adverse_rate": round(self.adverse_rate, 4),
            "adverse_rate_by_symbol": {k: round(v, 4) for k, v in self.adverse_rate_by_symbol.items()},
            "evidence_counts": {k: len(v) for k, v in self.evidence_index.items()},
            "content_hash": self.content_hash,
            "metrics_version": self.metrics_version,
        }


def _hhi(shares: list[float]) -> float:
    """Herfindahl-Hirschman Index from a list of fractions that sum to ~1."""
    return round(sum(s * s for s in shares), 6)


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Linear interpolation percentile on a sorted list."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    idx = (p / 100) * (n - 1)
    lo, hi = int(idx), min(int(idx) + 1, n - 1)
    frac = idx - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def build_risk_packet(trades: list[dict], user_id: str, symbol: str) -> RiskMetricsPacket:
    """
    Build a RiskMetricsPacket from a list of trade dicts.
    Each trade dict must have at minimum:
      - _id or id (str): trade identifier
      - notionalValue (float): trade size in USD
      - symbol (str): trading pair
      - executedAt (str): ISO-8601 timestamp (UTC)
    Optional fields:
      - whale_adverse (bool): True if flagged by whale scorer
    """
    if not trades:
        pkt = RiskMetricsPacket(
            user_id=user_id, symbol=symbol,
            computed_at=datetime.now(timezone.utc).isoformat()
        )
        pkt.content_hash = pkt.compute_hash()
        return pkt

    all_ids = []
    notionals = []
    symbol_notional: dict[str, float] = {}
    hour_counts: dict[str, int] = {}
    adverse_ids = []
    adverse_by_symbol: dict[str, list[str]] = {}
    symbol_trade_ids: dict[str, list[str]] = {}

    for t in trades:
        tid = str(t.get("_id") or t.get("id", ""))
        all_ids.append(tid)
        notional = float(t.get("notionalValue", 0.0))
        notionals.append(notional)
        sym = t.get("symbol", symbol)

        # symbol aggregation
        symbol_notional[sym] = symbol_notional.get(sym, 0.0) + notional
        if sym not in symbol_trade_ids:
            symbol_trade_ids[sym] = []
        symbol_trade_ids[sym].append(tid)

        # hour aggregation
        try:
            ts = t.get("executedAt", "")
            hour = str(datetime.fromisoformat(ts.replace("Z", "+00:00")).hour).zfill(2)
        except Exception:
            hour = "00"
        hour_counts[hour] = hour_counts.get(hour, 0) + 1

        # whale adverse
        if t.get("whale_adverse", False):
            adverse_ids.append(tid)
            if sym not in adverse_by_symbol:
                adverse_by_symbol[sym] = []
            adverse_by_symbol[sym].append(tid)

    n = len(trades)
    total_notional = sum(notionals)

    # ── symbol HHI ────────────────────────────────────────────────────────────
    sym_shares = {}
    if total_notional > 0:
        sym_shares = {s: v / total_notional for s, v in symbol_notional.items()}
    hhi_sym = _hhi(list(sym_shares.values()))
    top_sym = max(sym_shares, key=sym_shares.get) if sym_shares else ""
    top_sym_frac = sym_shares.get(top_sym, 0.0)

    # ── hour HHI ─────────────────────────────────────────────────────────────
    hour_shares = [c / n for c in hour_counts.values()] if n > 0 else []
    hhi_hour = _hhi(hour_shares)
    top_hour_str = max(hour_counts, key=hour_counts.get) if hour_counts else "00"
    top_hour_frac = hour_counts.get(top_hour_str, 0) / n if n > 0 else 0.0

    # ── size distribution ─────────────────────────────────────────────────────
    sorted_notionals = sorted(notionals)
    avg_n = total_notional / n if n > 0 else 0.0
    median_n = _percentile(sorted_notionals, 50)
    p90_n = _percentile(sorted_notionals, 90)
    max_n = max(notionals) if notionals else 0.0
    large_ids = [
        str(t.get("_id") or t.get("id", ""))
        for t in trades
        if float(t.get("notionalValue", 0.0)) > 2 * median_n
    ]

    # ── adverse rates ─────────────────────────────────────────────────────────
    adverse_rate = len(adverse_ids) / n if n > 0 else 0.0
    adverse_rate_by_sym = {
        s: round(len(ids) / len(symbol_trade_ids.get(s, ["placeholder"])), 4)
        for s, ids in adverse_by_symbol.items()
    }

    evidence = {
        "all_trades": all_ids,
        "adverse_trades": adverse_ids,
        "large_trades": large_ids,
    }
    for sym_key, ids in symbol_trade_ids.items():
        evidence[f"symbol_{sym_key}"] = ids

    pkt = RiskMetricsPacket(
        user_id=user_id,
        symbol=symbol,
        computed_at=datetime.now(timezone.utc).isoformat(),
        symbol_hhi=hhi_sym,
        symbol_notional_shares={k: round(v, 6) for k, v in sym_shares.items()},
        top_symbol_by_notional=top_sym,
        top_symbol_notional_fraction=round(top_sym_frac, 6),
        hour_hhi=hhi_hour,
        top_hour_utc=int(top_hour_str),
        top_hour_trade_fraction=round(top_hour_frac, 6),
        hour_trade_counts=hour_counts,
        avg_trade_usd=round(avg_n, 4),
        median_trade_usd=round(median_n, 4),
        p90_trade_usd=round(p90_n, 4),
        max_trade_usd=round(max_n, 4),
        large_trade_count=len(large_ids),
        large_trade_ids=large_ids,
        total_trades=n,
        whale_adverse_count=len(adverse_ids),
        adverse_rate=round(adverse_rate, 6),
        adverse_trade_ids=adverse_ids,
        adverse_rate_by_symbol=adverse_rate_by_sym,
        evidence_index=evidence,
    )
    pkt.content_hash = pkt.compute_hash()
    return pkt
