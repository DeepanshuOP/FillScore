"""Disposable Parquet cache for aggTrade days: <root>/exchange=binance/dataset=aggTrades/symbol=<S>/date=<D>/.

The cache is only an accelerator. Raw data can always be fetched again and re-verified from its checksum, so
entries may be evicted at any time (the hosting disk is ephemeral). Least recently used entries go first.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path

import pandas as pd

from .aggtrades import AggTradeWindow, MarketDataRef
from .vision import check_names

DEFAULT_MAX_GB = 2.0


class MarketCache:
    def __init__(self, root: str | os.PathLike | None = None, max_bytes: int | None = None):
        self.root = Path(root or os.environ.get("MARKETDATA_CACHE_DIR", ".cache/market")).resolve()
        self.max_bytes = int(max_bytes if max_bytes is not None else float(os.environ.get("MARKETDATA_CACHE_MAX_GB", DEFAULT_MAX_GB)) * 1024**3)

    def _dir(self, symbol: str, day: str) -> Path:
        check_names(symbol, day)                                   # strict shapes only: no separators, no dots
        d = (self.root / "exchange=binance" / "dataset=aggTrades" / f"symbol={symbol}" / f"date={day}").resolve()
        if self.root not in d.parents:                             # defence in depth against path escape
            raise ValueError("cache path escapes the cache root")
        return d

    def put(self, symbol: str, day: str, window: AggTradeWindow, now: float | None = None) -> None:
        d = self._dir(symbol, day)
        d.mkdir(parents=True, exist_ok=True)
        pd.DataFrame({
            "agg_id": window.agg_id, "price": window.price, "qty": window.qty, "ts_ms": window.ts_ms, "is_buyer_maker": window.is_buyer_maker,
        }).to_parquet(d / "data.parquet", index=False)
        (d / "refs.json").write_text(json.dumps([r.to_dict() for r in window.refs]))
        self._touch(d, now)

    def get(self, symbol: str, day: str, now: float | None = None) -> AggTradeWindow | None:
        d = self._dir(symbol, day)
        if not (d / "data.parquet").exists() or not (d / "refs.json").exists():
            return None
        df = pd.read_parquet(d / "data.parquet")
        refs = [MarketDataRef.from_dict(x) for x in json.loads((d / "refs.json").read_text())]
        self._touch(d, now)
        return AggTradeWindow.from_arrays(symbol, df["agg_id"], df["price"], df["qty"], df["ts_ms"], df["is_buyer_maker"], refs)

    @staticmethod
    def _touch(d: Path, now: float | None) -> None:
        (d / "last_used").write_text(repr(float(now if now is not None else time.time())))

    def _entries(self) -> list[tuple[float, Path]]:
        out = []
        for d in self.root.glob("exchange=binance/dataset=aggTrades/symbol=*/date=*"):
            try:
                used = float((d / "last_used").read_text())
            except (OSError, ValueError):
                used = 0.0
            out.append((used, d))
        return sorted(out, key=lambda e: (e[0], str(e[1])))

    def size_bytes(self) -> int:
        return sum(f.stat().st_size for f in self.root.rglob("*") if f.is_file()) if self.root.exists() else 0

    def evict(self) -> list[tuple[str, str]]:
        """Remove least recently used entries until the cache fits `max_bytes`. Returns what was removed."""
        removed = []
        size = self.size_bytes()
        for _, d in self._entries():
            if size <= self.max_bytes:
                break
            size -= sum(f.stat().st_size for f in d.rglob("*") if f.is_file())
            shutil.rmtree(d)
            removed.append((d.parent.name.split("=", 1)[1], d.name.split("=", 1)[1]))
        return removed
