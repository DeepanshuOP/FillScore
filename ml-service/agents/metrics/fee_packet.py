"""
Fee MetricsPacket — deterministic computation from MongoDB trade data.
All numbers here are ground truth for the Fee Optimizer agent.
The agent's job is to label and explain these numbers, never invent new ones.
"""
from __future__ import annotations
import hashlib, json
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

# ── 2026 spot fee constants (verified) ──────────────────────────────────────
FEE_RATES = {
    "binance":  {"maker": 0.0010, "taker": 0.0010},
    "bybit":    {"maker": 0.0010, "taker": 0.0010},
    "okx":      {"maker": 0.0008, "taker": 0.0010},
}
DEFAULT_RATES = {"maker": 0.0010, "taker": 0.0010}

MAKER_RATIO_TARGETS = [0.50, 0.80]   # counterfactual scenarios

@dataclass
class FeeMetricsPacket:
    # ── identity ────────────────────────────────────────────────────────────
    user_id: str
    symbol: str
    exchange: str
    computed_at: str                     # ISO-8601 UTC
    metrics_version: str = "1.0.0"

    # ── observed ────────────────────────────────────────────────────────────
    trade_count: int = 0
    maker_count: int = 0
    taker_count: int = 0
    maker_ratio: float = 0.0             # maker_count / trade_count
    total_fee_paid_usd: float = 0.0      # sum of actual fees paid
    total_notional_usd: float = 0.0      # sum of notional values
    fee_drag_bps: float = 0.0            # (total_fee / total_notional) * 10000
    avg_fee_per_trade_usd: float = 0.0

    # ── taker streaks ────────────────────────────────────────────────────────
    longest_taker_streak: int = 0        # consecutive taker fills
    taker_streak_trade_ids: list[str] = field(default_factory=list)  # IDs of the longest streak

    # ── counterfactuals ──────────────────────────────────────────────────────
    # savings_at_X = what user would save per month if maker_ratio = X
    savings_at_050_usd: float = 0.0
    savings_at_080_usd: float = 0.0
    savings_at_050_bps: float = 0.0
    savings_at_080_bps: float = 0.0

    # ── evidence index ───────────────────────────────────────────────────────
    # maps metric keys to the trade IDs that produced them
    evidence_index: dict[str, list[str]] = field(default_factory=dict)

    # ── integrity ────────────────────────────────────────────────────────────
    content_hash: str = ""   # SHA-256 of all numeric fields; set after construction

    def compute_hash(self) -> str:
        """SHA-256 of all numeric/string fields except content_hash itself."""
        payload = {k: v for k, v in asdict(self).items() if k not in ("content_hash", "computed_at")}
        serialised = json.dumps(payload, sort_keys=True, default=str)
        return hashlib.sha256(serialised.encode()).hexdigest()[:16]

    def to_prompt_dict(self) -> dict[str, Any]:
        """Compact representation safe to inject into an LLM prompt.
        Excludes raw trade ID lists (too long); keeps summary evidence counts."""
        return {
            "trade_count": self.trade_count,
            "maker_ratio": round(self.maker_ratio, 4),
            "total_fee_paid_usd": round(self.total_fee_paid_usd, 4),
            "fee_drag_bps": round(self.fee_drag_bps, 4),
            "avg_fee_per_trade_usd": round(self.avg_fee_per_trade_usd, 4),
            "longest_taker_streak": self.longest_taker_streak,
            "savings_at_050_usd": round(self.savings_at_050_usd, 4),
            "savings_at_080_usd": round(self.savings_at_080_usd, 4),
            "savings_at_050_bps": round(self.savings_at_050_bps, 4),
            "savings_at_080_bps": round(self.savings_at_080_bps, 4),
            "evidence_counts": {k: len(v) for k, v in self.evidence_index.items()},
            "content_hash": self.content_hash,
            "metrics_version": self.metrics_version,
        }


def build_fee_packet(trades: list[dict], user_id: str, symbol: str) -> FeeMetricsPacket:
    """
    Build a FeeMetricsPacket from a list of trade dicts.
    Each trade dict must have at minimum:
      - _id or id (str): trade identifier
      - isMaker (bool): True if maker fill
      - feePaid (float): actual fee paid in USD
      - notionalValue (float): trade notional in USD
      - exchange (str): exchange name
    """
    if not trades:
        pkt = FeeMetricsPacket(
            user_id=user_id, symbol=symbol, exchange="unknown",
            computed_at=datetime.now(timezone.utc).isoformat()
        )
        pkt.content_hash = pkt.compute_hash()
        return pkt

    exchange = trades[0].get("exchange", "binance").lower()
    rates = FEE_RATES.get(exchange, DEFAULT_RATES)

    maker_ids, taker_ids = [], []
    total_fee = 0.0
    total_notional = 0.0
    all_ids = []

    for t in trades:
        tid = str(t.get("_id") or t.get("id", ""))
        all_ids.append(tid)
        is_maker = bool(t.get("isMaker", False))
        fee = float(t.get("feePaid", 0.0))
        notional = float(t.get("notionalValue", 0.0))
        total_fee += fee
        total_notional += notional
        if is_maker:
            maker_ids.append(tid)
        else:
            taker_ids.append(tid)

    n = len(trades)
    maker_count = len(maker_ids)
    taker_count = len(taker_ids)
    maker_ratio = maker_count / n if n > 0 else 0.0
    fee_drag_bps = (total_fee / total_notional * 10000) if total_notional > 0 else 0.0
    avg_fee = total_fee / n if n > 0 else 0.0

    # ── taker streak ─────────────────────────────────────────────────────────
    longest_streak = 0
    streak_ids: list[str] = []
    current_streak: list[str] = []
    for t in trades:
        tid = str(t.get("_id") or t.get("id", ""))
        if not t.get("isMaker", False):
            current_streak.append(tid)
            if len(current_streak) > longest_streak:
                longest_streak = len(current_streak)
                streak_ids = list(current_streak)
        else:
            current_streak = []

    # ── counterfactuals ───────────────────────────────────────────────────────
    # For each taker trade, fee paid = notional * taker_rate
    # If it were maker, fee would be = notional * maker_rate
    # Saving per trade = notional * (taker_rate - maker_rate)
    maker_rate = rates["maker"]
    taker_rate = rates["taker"]
    rate_delta = taker_rate - maker_rate  # 0 on Binance/Bybit spot, 0.0002 on OKX

    taker_notional = sum(
        float(t.get("notionalValue", 0.0))
        for t in trades if not t.get("isMaker", False)
    )

    # At target maker ratio X: fraction (X - current_maker_ratio) of trades switch to maker
    def savings_at_target(target_ratio: float) -> tuple[float, float]:
        if target_ratio <= maker_ratio:
            return 0.0, 0.0
        extra_maker_fraction = target_ratio - maker_ratio
        saved_notional = total_notional * extra_maker_fraction
        saved_usd = saved_notional * rate_delta
        saved_bps = (saved_usd / total_notional * 10000) if total_notional > 0 else 0.0
        return round(saved_usd, 6), round(saved_bps, 6)

    sav_050_usd, sav_050_bps = savings_at_target(0.50)
    sav_080_usd, sav_080_bps = savings_at_target(0.80)

    evidence = {
        "maker_trades": maker_ids,
        "taker_trades": taker_ids,
        "taker_streak": streak_ids,
        "all_trades": all_ids,
    }

    pkt = FeeMetricsPacket(
        user_id=user_id,
        symbol=symbol,
        exchange=exchange,
        computed_at=datetime.now(timezone.utc).isoformat(),
        trade_count=n,
        maker_count=maker_count,
        taker_count=taker_count,
        maker_ratio=round(maker_ratio, 6),
        total_fee_paid_usd=round(total_fee, 6),
        total_notional_usd=round(total_notional, 6),
        fee_drag_bps=round(fee_drag_bps, 6),
        avg_fee_per_trade_usd=round(avg_fee, 6),
        longest_taker_streak=longest_streak,
        taker_streak_trade_ids=streak_ids,
        savings_at_050_usd=sav_050_usd,
        savings_at_080_usd=sav_080_usd,
        savings_at_050_bps=sav_050_bps,
        savings_at_080_bps=sav_080_bps,
        evidence_index=evidence,
    )
    pkt.content_hash = pkt.compute_hash()
    return pkt
