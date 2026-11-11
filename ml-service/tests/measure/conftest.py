"""Shared helpers for the measurement tests: the committed real-market fixtures (see fixtures/market/SOURCE.md)."""
from pathlib import Path

import pytest

MARKET = Path(__file__).resolve().parents[1] / "fixtures" / "market"

# Zip SHA-256 of each source day, as published by data.binance.vision and recorded in SOURCE.md.
BTC_2024 = ("BTCUSDT", "2024-01-15", "4b4ee84e3dec847499fd4bd9d3ea34aa5fff6ff9db825da4c8507b1107718a2b")
BNB_2024 = ("BNBUSDT", "2024-01-15", "dde821f1a59567413acbe5188bfc4d319322a81e8875dedea67420d098a1c348")
BTC_2025 = ("BTCUSDT", "2025-03-04", "65f296c975b16118774c230e4485e82d7ba5718886d513aab1b23953ad2ae279")


def load_fixture(spec):
    from measure.data import vision
    from measure.data.aggtrades import MarketDataRef

    symbol, day, sha = spec
    ref = MarketDataRef(source="data.binance.vision", dataset="spot/daily/aggTrades", symbol=symbol, date=day, window=None, sha256=sha)
    return vision.read_gz(MARKET / f"{symbol}-aggTrades-{day}_1400-1402.csv.gz", symbol, [ref])


@pytest.fixture(scope="session")
def btc_2024():
    return load_fixture(BTC_2024)


@pytest.fixture(scope="session")
def bnb_2024():
    return load_fixture(BNB_2024)


@pytest.fixture(scope="session")
def btc_2025():
    return load_fixture(BTC_2025)
