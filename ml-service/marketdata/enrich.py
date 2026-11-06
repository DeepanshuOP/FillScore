"""Per-trade markout + spread enrichment. Writes ONLY postPrices, spreadBps, halfSpreadBps, markoutVersion; never a
score, grade or any existing field. Idempotent (skips docs already at ENRICH_VERSION). Dry-run unless apply=True.

Reference market: Binance SPOT 1s klines for the trade's symbol (public data). For fills on other venues this is a
reference price path, not that venue's own tape (an assumption, stated in the report).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from agents.metrics.spread_estimators import estimate_spread_window
from marketdata.price_path import HORIZONS_S, aggregate_minutes, post_prices

ENRICH_VERSION = 1
FIELDS = ("postPrices", "spreadBps", "halfSpreadBps", "markoutVersion")


def _epoch(dt) -> float:
    if isinstance(dt, datetime):
        return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).timestamp()
    return datetime.fromisoformat(str(dt).replace("Z", "+00:00")).timestamp()


def _days(lo_s: float, hi_s: float) -> list[str]:
    d0 = datetime.fromtimestamp(lo_s, timezone.utc).date()
    d1 = datetime.fromtimestamp(hi_s, timezone.utc).date()
    return [(d0 + timedelta(days=i)).isoformat() for i in range((d1 - d0).days + 1)]


class _Bars:
    """Small in-process day cache over a `fetch_day(symbol, day) -> {sec: (h, l, c)}` callable; a failed fetch is {}."""
    def __init__(self, fetch_day):
        self.fetch_day, self.cache, self.failed = fetch_day, {}, set()

    def day(self, symbol, day):
        key = (symbol, day)
        if key not in self.cache:
            if len(self.cache) > 6:
                self.cache.pop(next(iter(self.cache)))
            try:
                self.cache[key] = self.fetch_day(symbol, day) or {}
            except Exception as exc:
                # 404 on a day that should long be published = the pair has no data that day (genuinely empty);
                # anything else (network, checksum, a day not published yet) is a FAILURE, never stored as "no data".
                old = (datetime.now(timezone.utc).date() - datetime.fromisoformat(day).date()).days > 2
                if getattr(exc, "code", None) == 404 and old:
                    self.cache[key] = {}
                else:
                    self.cache[key] = {}
                    self.failed.add(key)
        return self.cache[key]

    def window(self, symbol, lo_s, hi_s):
        out = {}
        for d in _days(lo_s, hi_s):
            out.update(self.day(symbol, d))
        return out

    def any_failed(self, symbol, lo_s, hi_s) -> bool:
        return any((symbol, d) in self.failed for d in _days(lo_s, hi_s))


class FetchFailed(Exception):
    pass


def enrich_trade(doc: dict, bars: _Bars) -> dict:
    t = _epoch(doc["executedAt"])
    sym = doc["symbol"]
    path = bars.window(sym, t - 10, t + max(HORIZONS_S) + 1)
    wide = bars.window(sym, t - 1860, t + 1860)
    if bars.any_failed(sym, t - 1860, t + 1860):
        raise FetchFailed(sym)
    prices = post_prices(path, t * 1000)
    est = estimate_spread_window(aggregate_minutes(wide), t)
    return {"postPrices": prices,
            "spreadBps": {"cs": est["cs_bps"], "ar": est["ar_bps"], "n_pairs": est["n_pairs"]},
            "halfSpreadBps": est["half_spread_bps"], "markoutVersion": ENRICH_VERSION}


def run_backfill(col, fetch_day, apply: bool = False, cache_dir=None, include_demo: bool = False,
                 user_id: str | None = None) -> dict:
    query: dict = {}
    if user_id:
        if user_id.startswith("demo-") and not include_demo:
            raise ValueError("demo-* accounts need --include-demo")
        query["userId"] = user_id
    elif not include_demo:
        query["userId"] = {"$not": {"$regex": "^demo-"}}
    docs = sorted(col.find(query), key=lambda d: (str(d.get("symbol")), _epoch(d["executedAt"])))
    bars = _Bars(fetch_day)
    rep = {"apply": apply, "considered": len(docs), "computed": 0, "written": 0, "already_enriched": 0,
           "fetch_errors": 0, "first_rows": []}
    for d in docs:
        if d.get("markoutVersion") == ENRICH_VERSION:
            rep["already_enriched"] += 1
            continue
        try:
            fields = enrich_trade(d, bars)
        except FetchFailed:
            rep["fetch_errors"] += 1      # nothing written and no version stamp, so the next run retries it
            continue
        rep["computed"] += 1
        if len(rep["first_rows"]) < 5:
            rep["first_rows"].append({"_id": str(d["_id"]), "symbol": d["symbol"], **fields})
        if apply:
            col.update_one({"_id": d["_id"]}, {"$set": fields})
            rep["written"] += 1
    if cache_dir is not None:
        from marketdata.binance_vision import cache_size_bytes
        rep["cache_bytes"] = cache_size_bytes(cache_dir)
    else:
        rep["cache_bytes"] = 0
    return rep
