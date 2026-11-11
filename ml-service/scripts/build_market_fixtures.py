"""Build the small real-market fixtures used by the offline measurement tests. Run once; the output is committed.

Each fixture is a verbatim slice (raw CSV lines, unchanged) of one public daily aggTrades file from
data.binance.vision. The script verifies the zip against its published .CHECKSUM before slicing, and
writes a SOURCE.md with the URL, the zip SHA-256, the slice bounds and the row counts.

It deliberately does not import ml-service/measure: the fixtures must not depend on the code they test.

Usage (from ml-service/):
    .venv/bin/python scripts/build_market_fixtures.py [--zip-dir DIR] [--out tests/fixtures/market]
With --zip-dir, zips and .CHECKSUM files already in DIR are reused; missing ones are downloaded there.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import tempfile
import urllib.request
import zipfile
from pathlib import Path

BASE = "https://data.binance.vision/data/spot/daily/aggTrades"

# (symbol, UTC date, slice start in epoch ms, slice end in epoch ms (exclusive), timestamp unit of the file)
SLICES = [
    ("BTCUSDT", "2024-01-15", 1705327200000, 1705327320000, "ms"),   # 14:00:00-14:02:00 UTC
    ("BNBUSDT", "2024-01-15", 1705327200000, 1705327320000, "ms"),
    ("BTCUSDT", "2025-03-04", 1741096800000, 1741096920000, "us"),   # microsecond-era file
]


def _get(url: str, dest: Path) -> bytes:
    if dest.exists():
        return dest.read_bytes()
    req = urllib.request.Request(url, headers={"User-Agent": "market-fixture-builder/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = r.read()
    dest.write_bytes(data)
    return data


def build(zip_dir: Path, out_dir: Path) -> str:
    out_dir.mkdir(parents=True, exist_ok=True)
    rows_md = []
    for symbol, day, start_ms, end_ms, unit in SLICES:
        name = f"{symbol}-aggTrades-{day}"
        url = f"{BASE}/{symbol}/{name}.zip"
        zbytes = _get(url, zip_dir / f"{name}.zip")
        expected = _get(url + ".CHECKSUM", zip_dir / f"{name}.zip.CHECKSUM").decode().split()[0].lower()
        sha = hashlib.sha256(zbytes).hexdigest()
        if sha != expected:
            raise SystemExit(f"{name}: sha256 mismatch (got {sha}, published {expected})")
        scale = 1000 if unit == "us" else 1
        lo, hi = start_ms * scale, end_ms * scale
        kept: list[bytes] = []
        total = 0
        with zipfile.ZipFile(io.BytesIO(zbytes)) as z:
            with z.open(z.namelist()[0]) as f:
                for line in f:
                    total += 1
                    ts = int(line.split(b",")[5])
                    if lo <= ts < hi:
                        kept.append(line)
        out = out_dir / f"{name}_1400-1402.csv.gz"
        buf = io.BytesIO()
        with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0, filename="") as g:   # mtime=0: byte-stable output
            g.write(b"".join(kept))
        out.write_bytes(buf.getvalue())
        first, last = kept[0].decode().strip(), kept[-1].decode().strip()
        rows_md.append(
            f"| `{out.name}` | {url} | `{sha}` | {total:,} | {start_ms}–{end_ms} ms (end exclusive) | {unit} | {len(kept):,} | `{first}` | `{last}` |"
        )
    md = "\n".join([
        "# Market fixtures: provenance",
        "",
        "Real public data from data.binance.vision (Binance spot daily aggTrades). Each fixture is a verbatim",
        "2-minute slice (14:00:00–14:02:00 UTC) of one daily file. Built by `ml-service/scripts/build_market_fixtures.py`,",
        "which verifies each zip against its published `.CHECKSUM` first. Columns (no header): aggregate trade id,",
        "price, quantity, first trade id, last trade id, timestamp, is-buyer-maker, best-match.",
        "",
        "| Fixture | Source zip | Zip SHA-256 | Rows in zip | Slice | Timestamp unit | Rows in slice | First row | Last row |",
        "|---|---|---|---|---|---|---|---|---|",
        *rows_md,
        "",
    ])
    (out_dir / "SOURCE.md").write_text(md)
    return md


if __name__ == "__main__":
    ap = argparse.ArgumentParser(allow_abbrev=False)
    ap.add_argument("--zip-dir", type=Path, default=None)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "market")
    a = ap.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        zd = a.zip_dir or Path(tmp)
        zd.mkdir(parents=True, exist_ok=True)
        print(build(zd, a.out))
