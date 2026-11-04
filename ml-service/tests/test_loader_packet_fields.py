"""1c.1: loader reads the stored `vwap5min` field and maps it to `vwap5m` for the builders."""
from agents.metrics.loader import TRADE_PROJECTION, normalise_trade_doc


def test_projection_loads_vwap5min():
    assert TRADE_PROJECTION.get("vwap5min") == 1
    assert "vwap5m" not in TRADE_PROJECTION


def test_vwap5min_mapped_to_vwap5m():
    assert normalise_trade_doc({"_id": "x", "vwap5min": 101.5})["vwap5m"] == 101.5


def test_missing_vwap5min_gives_no_vwap():
    assert normalise_trade_doc({"_id": "x"}).get("vwap5m") is None
    assert normalise_trade_doc({"_id": "x", "vwap5min": None}).get("vwap5m") is None


def test_existing_vwap5m_left_alone_without_vwap5min():
    assert normalise_trade_doc({"_id": "x", "vwap5m": 7.0})["vwap5m"] == 7.0
