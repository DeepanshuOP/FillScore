"""Whale study re-run on the rebuilt demos (M2): count a whale burst as adverse only when its prints come BEFORE the
fill. Offline and read-only: the fills come from ml-service/demo_v2/out/, the prints from cached, checksum-verified
data.binance.vision daily files. Never runs or imports whale/enrich.py (it writes to MongoDB).

Definitions are the existing ones (whale/whale_score.py score_whale_window, unchanged): same-direction prints with
gaps <= 1 s form a burst; a burst of at least the symbol's threshold (whale/enrich.py WHALE_THRESHOLDS) is a whale
event; pressure = sum(sign x notional x exp(-|dt|/10 s)) / window notional; a fill is adverse when the pressure
points against it (a buy whale before a user buy).
  * old rule: prints in [fill - 30 s, fill + 30 s] (what was stored as `whaleAdverse`);
  * pre-fill rule: prints in [fill - 30 s, fill), strictly before the fill's millisecond.
Outcome check (association only, never causation): the measured effective half-spread of the fill (measure_fill),
and the mid drift over the 30 s before the fill, signed so that positive moved against the user.

    cd ml-service && .venv/bin/python scripts/whale_prefill_study.py
"""
from __future__ import annotations

import importlib.util
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from measure.benchmarks import quote_at  # noqa: E402
from measure.data.aggtrades import AggTradeWindow  # noqa: E402
from measure.data.ticks import tick_from_prints  # noqa: E402
from measure.enrich_fill import FillInput, measure_fill  # noqa: E402
from whale.whale_score import score_whale_window  # noqa: E402

# The thresholds of whale/enrich.py WHALE_THRESHOLDS, copied (importing enrich.py would need MONGODB_URI and connect).
THRESHOLDS = {"BTCUSDT": 250_000.0, "ETHUSDT": 250_000.0, "SOLUSDT": 100_000.0, "BNBUSDT": 50_000.0}
HALF_WINDOW_MS = 30_000


def _df(w: AggTradeWindow) -> pd.DataFrame:
    return pd.DataFrame({"agg_trade_id": w.agg_id, "price": w.price, "quantity": w.qty, "transact_time_ms": w.ts_ms,
                         "is_buyer_maker": w.is_buyer_maker})


def whale_flags(tape: AggTradeWindow, t_ms: int, side: str, threshold: float) -> dict:
    out = {}
    for name, lo, hi in (("old", t_ms - HALF_WINDOW_MS, t_ms + HALF_WINDOW_MS + 1), ("prefill", t_ms - HALF_WINDOW_MS, t_ms)):
        s = score_whale_window(_df(tape.between(lo, hi)), t_ms, side, whale_notional_usd=threshold)
        out[name] = {"adverse": bool(s["adverse"]), "events": int(s["whale_event_count"])}
    return out


def rate(flags, seed: int = 7, n_boot: int = 2000) -> dict:
    x = np.asarray(flags, dtype=float)
    if len(x) == 0:
        return {"n": 0, "rate": None, "lo": None, "hi": None}
    rng = np.random.default_rng(seed)
    boots = rng.choice(x, size=(n_boot, len(x)), replace=True).mean(axis=1)
    return {"n": int(len(x)), "rate": float(x.mean()), "lo": float(np.percentile(boots, 2.5)), "hi": float(np.percentile(boots, 97.5))}


def _median_diff(a, b, seed: int = 11, n_boot: int = 2000) -> dict:
    a, b = np.asarray(a, float), np.asarray(b, float)
    a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    if len(a) < 5 or len(b) < 5:
        return {"nA": int(len(a)), "nB": int(len(b)), "diff": None, "lo": None, "hi": None}
    rng = np.random.default_rng(seed)
    d = [np.median(rng.choice(a, len(a))) - np.median(rng.choice(b, len(b))) for _ in range(n_boot)]
    return {"nA": int(len(a)), "nB": int(len(b)), "medianA": float(np.median(a)), "medianB": float(np.median(b)),
            "diff": float(np.median(a) - np.median(b)), "lo": float(np.percentile(d, 2.5)), "hi": float(np.percentile(d, 97.5))}


def main() -> int:
    spec = importlib.util.spec_from_file_location("build_demo_v2", ROOT / "scripts" / "build_demo_v2.py")
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)
    tapes = b.DayTapes(ROOT / ".cache" / "market" / "zips")
    rows = []
    for demo in b.DEMOS.values():
        trades = json.loads((ROOT / "demo_v2" / "out" / demo / "trades.json").read_text())
        for t in sorted(trades, key=lambda x: (x["symbol"], x["executedAt"])):
            ts = int(datetime.strptime(t["executedAt"], "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc).timestamp() * 1000)
            tape = tapes(t["symbol"], ts - HALF_WINDOW_MS - 5_000, ts + 300_000 + 5_000)
            f = whale_flags(tape, ts, t["side"], THRESHOLDS[t["symbol"]])
            other = whale_flags(tape, ts, "SELL" if t["side"] == "BUY" else "BUY", THRESHOLDS[t["symbol"]])
            tick = tick_from_prints(tape.price) or 0.01
            m = measure_fill(FillInput(t["tradeId"], t["symbol"], 1 if t["side"] == "BUY" else -1, t["executionPrice"],
                                       t["quantity"], ts), tape, tick)
            m0, m1 = quote_at(tape, ts - HALF_WINDOW_MS).mid, quote_at(tape, ts).mid
            drift = (1 if t["side"] == "BUY" else -1) * (m1 - m0) / m0 * 1e4 if m0 and m1 else math.nan
            rows.append({"demo": demo, "maker": t["isMaker"], "old": f["old"]["adverse"], "pre": f["prefill"]["adverse"],
                         "preEvents": f["prefill"]["events"], "oldEvents": f["old"]["events"], "preOther": other["prefill"]["adverse"],
                         "eff": m["effHalfBps"] if m["effHalfBps"] is not None else math.nan, "drift": drift})
    df = pd.DataFrame(rows)
    res = {"fills": int(len(df)),
           "oldAdverseRate": rate(df["old"]), "prefillAdverseRate": rate(df["pre"]),
           "prefillAdverseRateOppositeSide": rate(df["preOther"]),
           "fillsWithAnyPrefillEvent": int((df["preEvents"] > 0).sum()), "fillsWithAnyOldEvent": int((df["oldEvents"] > 0).sum()),
           "effHalfBps_prefillAdverse_vs_not": _median_diff(df.loc[df["pre"], "eff"], df.loc[~df["pre"], "eff"]),
           "preDrift30s_prefillAdverse_vs_not": _median_diff(df.loc[df["pre"], "drift"], df.loc[~df["pre"], "drift"]),
           "byDemo": {d: {"old": rate(g["old"]), "prefill": rate(g["pre"])} for d, g in df.groupby("demo")},
           "takerOnly": {"old": rate(df.loc[~df["maker"], "old"]), "prefill": rate(df.loc[~df["maker"], "pre"]),
                         "effHalfBps_prefillAdverse_vs_not": _median_diff(df.loc[~df["maker"] & df["pre"], "eff"],
                                                                          df.loc[~df["maker"] & ~df["pre"], "eff"])}}
    print(json.dumps(res, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
