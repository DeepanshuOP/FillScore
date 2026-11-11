"""Order decisions of the three Binance demos: a line-by-line port of backend/src/scripts/generateSyntheticTrades.ts.

Every PRNG call of the original is kept in the same order, including the calls whose values the old generator used to
invent a fill price (the "slippage" draw). Those values are discarded here: in M2 the fill comes from real prints.
Keeping the calls keeps the decisions (time, symbol, side, size, market or limit) identical to the old demos, so the
old and new grades differ only by how the fills were made. tests/demo_v2/test_decisions.py proves the match against
the committed backend/src/data/synthetic/*-trades.json.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .prng import mulberry32

SYMBOLS = ("BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT")


@dataclass(frozen=True)
class Profile:
    id: str
    market_order_ratio: float
    preferred_hours: tuple[int, ...]
    avg_trade_usd: float
    trades_per_day: float
    symbol_weights: dict


# Values copied from generateSyntheticTrades.ts `profiles` (order matters: the PRNG is shared).
PROFILES = (
    Profile("aggressive", 0.80, (21, 22, 23, 0, 1, 2, 3), 800, 6, {"BTCUSDT": 0.30, "ETHUSDT": 0.25, "BNBUSDT": 0.20, "SOLUSDT": 0.25}),
    Profile("moderate", 0.35, (8, 9, 10, 11, 14, 15, 16, 17, 19, 20), 500, 4, {"BTCUSDT": 0.45, "ETHUSDT": 0.35, "BNBUSDT": 0.10, "SOLUSDT": 0.10}),
    Profile("disciplined", 0.0, (8, 9, 10, 11, 12, 13, 14, 15), 300, 3, {"BTCUSDT": 0.55, "ETHUSDT": 0.30, "BNBUSDT": 0.10, "SOLUSDT": 0.05}),
)


@dataclass(frozen=True)
class Decision:
    profile: str
    symbol: str
    side: str            # BUY | SELL
    order_type: str      # MARKET | LIMIT
    quantity: float      # base asset
    executed_at_ms: int  # the old generator's fill time; the M2 order is placed at this time
    minute_open: float
    old_trade_id: str
    old_order_id: str

    @property
    def executed_at_iso(self) -> str:
        dt = datetime.fromtimestamp(self.executed_at_ms / 1000, tz=timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{self.executed_at_ms % 1000:03d}Z"


def _floor(x: float) -> int:
    return int(x // 1)


def generate_decisions(market_dir: Path) -> dict[str, list[Decision]]:
    prng = mulberry32(42)
    out: dict[str, list[Decision]] = {p.id: [] for p in PROFILES}
    for symbol in SYMBOLS:
        path = Path(market_dir) / f"{symbol}-1m-2024-01.csv"
        prev_closes: list[float] = []
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            parts = line.split(",")
            if len(parts) < 6:
                continue
            try:
                open_time = int(parts[0])
                o = float(parts[1])
            except ValueError:
                continue
            high, low, close = float(parts[2]), float(parts[3]), float(parts[4])
            hour = datetime.fromtimestamp(open_time / 1000, tz=timezone.utc).hour
            volatility = (high - low) / o
            prev_closes.append(close)
            if len(prev_closes) > 4:
                prev_closes.pop(0)
            for p in PROFILES:
                probability = (p.trades_per_day / 1440) * p.symbol_weights[symbol] * 4
                if hour not in p.preferred_hours:
                    probability *= 0.1
                if volatility > 0.002:
                    probability *= 1.5
                if not prng() < probability:
                    continue
                if p.id == "aggressive":
                    side = "BUY" if prng() < 0.70 else "SELL"
                elif p.id == "disciplined":
                    if len(prev_closes) >= 3:
                        side = "BUY" if prev_closes[-1] > prev_closes[-3] else "SELL"
                    else:
                        side = "BUY" if prng() < 0.5 else "SELL"
                else:
                    if len(prev_closes) >= 3:
                        up = prev_closes[-1] > prev_closes[-3]
                        side = ("BUY" if prng() < 0.65 else "SELL") if up else ("SELL" if prng() < 0.65 else "BUY")
                    else:
                        side = "BUY" if prng() < 0.5 else "SELL"
                base_usd = p.avg_trade_usd * p.symbol_weights[symbol] * (0.6 + prng() * 0.8)
                quantity = base_usd / o
                is_market = prng() < p.market_order_ratio
                prng()                                   # the old invented-slippage draw (discarded)
                executed_at = open_time + _floor(prng() * 59000)
                trade_id = f"syn-{p.id}-{symbol}-{_floor(prng() * 1000000)}"
                order_id = f"ord-{p.id}-{symbol}-{_floor(prng() * 1000000)}"
                out[p.id].append(Decision(p.id, symbol, side, "MARKET" if is_market else "LIMIT", quantity, executed_at,
                                          o, trade_id, order_id))
    return out
