"""Cut a capped window of real public prints for every filled, measured demo order, offline.

    cd ml-service && .venv/bin/python scripts/cut_demo_prints.py [--out demo_v2/out] [--cache .cache/market/zips]

Reads the committed demo build (demo_v2/out/<demo>/{orders,trades,order_measurements}.json) and the daily Binance
aggTrades files that the build's manifest names (data.binance.vision, spot/daily/aggTrades). Each file is read from the
local cache only (no network: a missing file stops the cut) and its SHA-256 must equal the one in
demo_v2/out/manifest.json, so the prints come from the very files the refs name. Writes
demo_v2/out/<demo>/prints.json. Never touches MongoDB.

Window per order: arrival - 5 s to the last fill + 5 s (inclusive), at most 60 prints; over the cap the 60 prints
nearest in time to the fills (distance 0 inside [first fill, last fill]) are kept, ties by aggregate id, stored in id
order, with `total` (prints in the whole window) and `truncated` saying so. An order with no fill or no arrival time
has no window (counted under `skipped`). Row = [aggregate id, ts ms, price, quantity, is_buyer_maker 0/1]:
is_buyer_maker 0 means the buyer was the aggressor (shown as a tick up), 1 the seller (a tick down).
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import OrderedDict
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

PAD_MS = 5_000
CAP = 60
DAY_MS = 86_400_000
_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _ms(iso: str) -> int:
    return (datetime.fromisoformat(iso.replace("Z", "+00:00")) - _EPOCH) // timedelta(milliseconds=1)


def _day(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%d")


def select_prints(agg_id, ts_ms, price, qty, is_buyer_maker, *, arrival_ms: int, first_fill_ms: int,
                  last_fill_ms: int, cap: int = CAP) -> dict:
    """The window [arrival - 5 s, last fill + 5 s] of one symbol's prints, at most `cap` rows (see the module text)."""
    lo, hi = arrival_ms - PAD_MS, last_fill_ms + PAD_MS
    ts = np.asarray(ts_ms, dtype=np.int64)
    idx = np.flatnonzero((ts >= lo) & (ts <= hi))
    total = int(len(idx))
    if total > cap:
        dist = np.where(ts[idx] < first_fill_ms, first_fill_ms - ts[idx], np.where(ts[idx] > last_fill_ms, ts[idx] - last_fill_ms, 0))
        ids = np.asarray(agg_id)[idx]
        keep = np.lexsort((ids, dist))[:cap]            # nearest first; ties by aggregate id
        idx = np.sort(idx[keep])
    rows = [[int(agg_id[i]), int(ts[i]), float(price[i]), float(qty[i]), int(bool(is_buyer_maker[i]))] for i in idx]
    rows.sort(key=lambda r: r[0])
    return {"fromMs": int(lo), "toMs": int(hi), "total": total, "truncated": total > len(rows), "prints": rows}


def cut_demo(demo_dir: Path, published: dict, load_day) -> dict:
    """{windows: {orderId: window}, skipped: {reason: n}} for one demo folder. `published` maps (symbol, 'YYYY-MM-DD') to
    the SHA-256 in the build manifest; `load_day(symbol, day)` returns that day's AggTradeWindow (its ref carries the hash)."""
    demo_dir = Path(demo_dir)
    orders = json.loads((demo_dir / "orders.json").read_text())
    trades = json.loads((demo_dir / "trades.json").read_text())
    meas = {(m["orderId"], m["symbol"]): m for m in json.loads((demo_dir / "order_measurements.json").read_text())}
    fills: dict[tuple, list[int]] = {}
    for t in trades:
        fills.setdefault((t["orderId"], t["symbol"]), []).append(_ms(t["executedAt"]))
    ids = [o["orderId"] for o in orders]
    if len(ids) != len(set(ids)):
        raise ValueError("order ids repeat across symbols: windows are keyed by order id, key them by (order id, symbol) first")
    skipped = {"no_fill": 0, "no_arrival": 0}
    todo = []
    for o in orders:
        key = (o["orderId"], o["symbol"])
        arrival = (meas.get(key) or {}).get("arrivalMs")
        if arrival is None:
            skipped["no_arrival"] += 1
        elif key not in fills:
            skipped["no_fill"] += 1
        else:
            todo.append((int(arrival), key))
    todo.sort()                                         # time order keeps one day's file in use for a long run of orders
    windows = {}
    for arrival, (order_id, symbol) in todo:
        f = sorted(fills[(order_id, symbol)])
        lo, hi = arrival - PAD_MS, f[-1] + PAD_MS
        cols = {"id": [], "ts": [], "px": [], "qty": [], "bm": []}
        files = []
        for d in range(_ms_day_start(lo), _ms_day_start(hi) + 1, DAY_MS):
            day = _day(d)
            w = load_day(symbol, day)
            sha = w.refs[0].sha256
            if published.get((symbol, day)) != sha:
                raise ValueError(f"{symbol} {day}: sha256 {sha} is not the committed manifest's {published.get((symbol, day))}")
            files.append({"symbol": symbol, "date": day, "sha256": sha})
            cols["id"].append(w.agg_id); cols["ts"].append(w.ts_ms); cols["px"].append(w.price)
            cols["qty"].append(w.qty); cols["bm"].append(w.is_buyer_maker)
        sel = select_prints(np.concatenate(cols["id"]), np.concatenate(cols["ts"]), np.concatenate(cols["px"]),
                            np.concatenate(cols["qty"]), np.concatenate(cols["bm"]),
                            arrival_ms=arrival, first_fill_ms=f[0], last_fill_ms=f[-1])
        windows[order_id] = {"symbol": symbol, "arrivalMs": arrival, "fills": f, "files": files, **sel}
    return {"windows": windows, "skipped": skipped}


def _ms_day_start(ms: int) -> int:
    return ms - ms % DAY_MS


BACKEND_DST = ROOT.parent / "backend" / "src" / "data" / "demoPrints.ts"
_TS_HEADER = """/**
 * Public prints around each filled demo order (fourth order, step 5), copied from ml-service/demo_v2/out/<demo>/prints.json
 * by ml-service/scripts/cut_demo_prints.py (cut offline from the checksummed Binance daily files the order refs name; each
 * window carries the file's SHA-256). The deployed backend image holds only backend/, so the data is copied here. A test
 * (services/__tests__/demoPrints.test.ts) fails when this copy differs from the build output. Never typed by hand.
 */
"""


def backend_ts_text(out_dir: Path) -> str:
    """backend/src/data/demoPrints.ts: one JSON string per demo folder that has a prints.json, in sorted order."""
    lines = [_TS_HEADER + "export const DEMO_PRINTS_JSON: Record<string, string> = {"]
    for d in sorted(p for p in Path(out_dir).iterdir() if (p / "prints.json").is_file()):
        text = (d / "prints.json").read_text().replace("\\", "\\\\").replace("'", "\\'")
        lines.append(f"    '{d.name}': '{text}',")
    lines.append("};")
    return "\n".join(lines) + "\n"


class _DayCache:
    """The last few symbol-days, so a run of orders on one day parses its file once."""

    def __init__(self, cache_dir: Path, keep: int = 3):
        from measure.data import vision
        self._vision, self._dir, self._keep, self._days = vision, cache_dir, keep, OrderedDict()

    def __call__(self, symbol: str, day: str):
        k = (symbol, day)
        if k in self._days:
            self._days.move_to_end(k)
            return self._days[k]

        def offline(url: str):
            raise RuntimeError(f"offline cut: {url} is not in the cache {self._dir}")
        w = self._vision.load_day(symbol, day, self._dir, opener=offline)
        self._days[k] = w
        while len(self._days) > self._keep:
            self._days.popitem(last=False)
        return w


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--out", default=str(ROOT / "demo_v2" / "out"))
    p.add_argument("--cache", default=str(ROOT / ".cache" / "market" / "zips"))
    a = p.parse_args()
    out = Path(a.out)
    manifest = json.loads((out / "manifest.json").read_text())
    published = {(t["symbol"], t["day"]): t["sha256"] for t in manifest["tapes"]}
    load = _DayCache(Path(a.cache))
    total = 0
    for demo in sorted(manifest["demos"]):
        res = cut_demo(out / demo, published, load)
        doc = {"version": 1, "source": "data.binance.vision spot/daily/aggTrades",
               "cutBy": "ml-service/scripts/cut_demo_prints.py",
               "rule": f"arrival - {PAD_MS // 1000} s to last fill + {PAD_MS // 1000} s, at most {CAP} prints (nearest the fills when over)",
               "row": ["aggId", "tsMs", "price", "qty", "isBuyerMaker"], "skipped": res["skipped"], "windows": res["windows"]}
        text = json.dumps(doc, sort_keys=True, separators=(",", ":"))
        (out / demo / "prints.json").write_text(text)
        n = sum(len(w["prints"]) for w in res["windows"].values())
        print(f"{demo}: {len(res['windows'])} windows, {n} prints, {len(text.encode()):,} bytes, skipped {res['skipped']}")
        total += len(text.encode())
    print(f"total {total:,} bytes ({total / 1_000_000:.2f} MB)")
    if out == ROOT / "demo_v2" / "out":
        BACKEND_DST.write_text(backend_ts_text(out))
        print(f"wrote {BACKEND_DST.relative_to(ROOT.parent)} ({BACKEND_DST.stat().st_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
