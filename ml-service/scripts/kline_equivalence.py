"""Kline context against aggregate-trade context on seeded random symbol-hours of January 2024.

    cd ml-service && .venv/bin/python scripts/kline_equivalence.py [--seed 20260119] [--n 120]

Prints one JSON object (the committed result is tests/fixtures/market/kline_equivalence_2024-01.json). For each sampled
(symbol, day, hour) it takes one time t inside the hour and computes the model's hour context (sigma in bps, volume) twice:
from the cached data.binance.vision daily aggTrades file (`expected_cost.features.hour_context`, the definition the model
was calibrated with) and from the 1-minute klines of the same day (`measure.data.klines.hour_context_from_klines`, what real
accounts use). Kline day files are public (no key): https://data.binance.vision/data/spot/daily/klines/<SYM>/1m/ with a
published .CHECKSUM (SHA-256), downloaded once and cached in .cache/market/klines after the checksum matches.
Source: https://github.com/binance/binance-public-data (daily klines, 12 columns, no header; open time in ms before 2025).
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import io
import json
import random
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

SYMBOLS = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
FIRST_DAY, LAST_DAY = 2, 30            # day 1 has no earlier day and day 31 is not needed
AGG_CACHE = ROOT / ".cache" / "market" / "zips"
KLINE_CACHE = ROOT / ".cache" / "market" / "klines"
KLINE_BASE = "https://data.binance.vision/data/spot/daily/klines"
MS_HOUR = 3_600_000


def day_start_ms(day: str) -> int:
    d = dt.datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=dt.timezone.utc)
    return int(d.timestamp() * 1000)


def sample_cases(seed: int, n: int) -> list[dict]:
    """n distinct (symbol, day, hour) with one uniformly drawn time inside the hour. Hours 2..23: the 60-minute lookback and
    the reference close then lie inside the same UTC day."""
    rng = random.Random(seed)
    seen, out = set(), []
    while len(out) < n:
        sym = rng.choice(SYMBOLS)
        day = f"2024-01-{rng.randint(FIRST_DAY, LAST_DAY):02d}"
        hour = rng.randint(2, 23)
        if (sym, day, hour) in seen:
            continue
        seen.add((sym, day, hour))
        t_ms = day_start_ms(day) + hour * MS_HOUR + rng.randrange(0, MS_HOUR)
        out.append({"symbol": sym, "day": day, "hour": hour, "t_ms": t_ms})
    return out


def caches_present() -> bool:
    return all((AGG_CACHE / s / f"{s}-aggTrades-2024-01-{d:02d}.zip").exists() for s in SYMBOLS for d in range(FIRST_DAY, LAST_DAY + 1)) \
        and KLINE_CACHE.exists()


def _urlopen(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "market-data-client/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()


def load_kline_day(symbol: str, day: str, opener=None):
    """One UTC day of 1-minute klines as a KlineWindow; the zip is checked against its published SHA-256 before caching."""
    from measure.data.aggtrades import MarketDataRef
    from measure.data.klines import KlineWindow
    from measure.data.vision import check_names
    check_names(symbol, day)
    opener = opener or _urlopen
    name = f"{symbol}-1m-{day}.zip"
    path = KLINE_CACHE / symbol / name
    url = f"{KLINE_BASE}/{symbol}/1m/{name}"
    if path.exists():
        data = path.read_bytes()
    else:
        data = opener(url)
        expected = opener(url + ".CHECKSUM").decode().split()[0].lower()
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"{name}: sha256 mismatch")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        text = z.read(z.namelist()[0]).decode()
    rows = [ln.split(",") for ln in text.splitlines() if ln.strip() and ln[0].isdigit()]
    ref = MarketDataRef("data.binance.vision", "spot/daily/klines/1m", symbol, day, None, hashlib.sha256(data).hexdigest())
    return KlineWindow.from_rows(symbol, rows, [ref])


def run(seed: int, n: int) -> dict:
    from expected_cost.features import hour_context
    from measure.data.klines import hour_context_from_klines
    from measure.data.vision import load_day
    cases = sample_cases(seed, n)
    out_cases, d_sigma, d_vol, rel_vol, none_mm, skipped = [], [], [], [], 0, 0
    agg_cache, k_cache = {}, {}
    for c in cases:
        key = (c["symbol"], c["day"])
        if key not in agg_cache:
            agg_cache[key] = load_day(c["symbol"], c["day"], AGG_CACHE)
        if key not in k_cache:
            k_cache[key] = load_kline_day(c["symbol"], c["day"])
        a = hour_context(agg_cache[key], c["t_ms"])
        k = hour_context_from_klines(k_cache[key], c["t_ms"])
        row = dict(c)
        if a is None or k is None:
            if (a is None) != (k is None):
                none_mm += 1
            skipped += 1
            row.update(agg=a, kline=k, compared=False)
        else:
            d_sigma.append(abs(a[0] - k[0]))
            d_vol.append(abs(a[1] - k[1]))
            rel_vol.append(abs(a[1] - k[1]) / max(abs(a[1]), 1e-12))
            row.update(agg=list(a), kline=list(k), compared=True)
        out_cases.append(row)
    return {
        "seed": seed, "n_requested": n, "n_compared": len(d_sigma), "n_not_compared_both_none_or_mismatch": skipped,
        "none_mismatches": none_mm,
        "max_abs_diff_sigma_bps": max(d_sigma, default=None), "max_abs_diff_volume": max(d_vol, default=None),
        "max_rel_diff_volume": max(rel_vol, default=None),
        "symbols": sorted({c["symbol"] for c in cases}), "cases": out_cases,
    }


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--seed", type=int, default=20260119)
    p.add_argument("--n", type=int, default=120)
    p.add_argument("--out", help="write the JSON result to this path as well")
    a = p.parse_args(argv)
    text = json.dumps(run(a.seed, a.n), indent=1)
    if a.out:
        Path(a.out).write_text(text + "\n", encoding="utf-8")
    res = json.loads(text)
    print({k: v for k, v in res.items() if k != "cases"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
