"""The sample broker file of "Try the sample file" (A5, orders of 2026-11-23).

`sample/kraken_sample.csv` is committed: 24 synthetic Kraken Trades rows (XBT/USD, market, taker) whose times and prices are real
Binance BTCUSDT aggTrades prints of 2026-09-02 to 2026-09-05 (the first print at or after :13 of the minutes :07, :24 and :41 of two hours
on each day; quantities are made up; the fee is 0.1% of cost). The fills are synthetic and the prices are real, and the result says so.
The check is `csv_import.service.run_check`, the same code a user's file goes through, with the same market-data source and gate.
Nothing is stored; the file is a constant of the code, so there is no upload and nothing of a user's to log.
"""
from __future__ import annotations

from pathlib import Path

from csv_import.service import run_check

SAMPLE_LABEL = "Sample file: synthetic fills, real prices"
SAMPLE_PATH = Path(__file__).resolve().parent / "sample" / "kraken_sample.csv"
SAMPLE_SHA256 = "a4cf849c5667e536bb45657ae0a5956f970729b1d1f345c0e437d10e15c24448"


def sample_csv() -> str:
    return SAMPLE_PATH.read_text(encoding="utf-8")


def run_sample(source) -> dict:
    result = run_check("kraken", sample_csv(), None, source)
    result["sample"] = {"label": SAMPLE_LABEL, "sha256": SAMPLE_SHA256}
    return result
