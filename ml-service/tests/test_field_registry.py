"""4R-0 Task 1: field-ownership registry. Test/script helper only (shared/ is not in the Docker build contexts)."""
from datetime import datetime
from pathlib import Path

import mongomock
import pytest

from marketdata import binance_vision as bv
from marketdata.enrich import enrich_trade, _Bars
from marketdata.field_registry import FieldOwnershipError, assert_writable

OWNER = "ml-service/scripts/backfill_markouts.py"
FIX = Path(__file__).parent / "fixtures" / "TESTUSDT-1s-2025-10-01.csv"
BASE = 1759276800   # 2025-10-01 00:00:00 UTC


def _doc():
    return {"_id": "a", "userId": "u1", "symbol": "TESTUSDT", "executedAt": datetime.utcfromtimestamp(BASE)}


def _bars():
    return _Bars(lambda s, d: bv.parse_klines(FIX.read_text()) if (s, d) == ("TESTUSDT", "2025-10-01") else {})


def test_backfill_writes_only_owned_fields():
    fields = enrich_trade(_doc(), _bars())
    assert fields                                    # builder returned something to check
    for k, v in fields.items():
        assert_writable("Trade", k, v, OWNER)        # raises on wrong type / non-owner


def test_backfill_never_writes_spreadBps():
    assert "spreadBps" not in enrich_trade(_doc(), _bars())
    assert set(enrich_trade(_doc(), _bars())) == {"postPrices", "spreadEstimates", "halfSpreadBps", "markoutVersion"}


def test_assert_writable_rejects_dict_for_spreadBps():
    with pytest.raises(FieldOwnershipError):
        assert_writable("Trade", "spreadBps", {"cs": 1.0, "ar": 2.0, "n_pairs": 3}, OWNER)


def test_assert_writable_rejects_non_owner_and_unknown_field():
    with pytest.raises(FieldOwnershipError):   # spreadBps is owned by the TS MarketDataService, not the backfill
        assert_writable("Trade", "spreadBps", 1.2, OWNER)
    assert_writable("Trade", "spreadBps", 1.2, "backend/src/services/MarketDataService.ts")
    with pytest.raises(FieldOwnershipError):
        assert_writable("Trade", "noSuchField", 1, OWNER)
    with pytest.raises(FieldOwnershipError):   # nullable=True so None is fine, but a string is the wrong type
        assert_writable("Trade", "halfSpreadBps", "1.2", OWNER)
    assert_writable("Trade", "halfSpreadBps", None, OWNER)
    assert_writable("Trade", "spreadEstimates", {"cs": None, "ar": None, "n_pairs": 0, "version": 1}, OWNER)
    with pytest.raises(FieldOwnershipError):   # unknown key inside spreadEstimates
        assert_writable("Trade", "spreadEstimates", {"cs": 1, "bogus": 2}, OWNER)
