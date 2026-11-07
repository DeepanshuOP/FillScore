"""4a Q6: markout/spread backfill against an in-memory DB (mongomock). Offline: bars come from the fixture slice."""
from datetime import datetime
from pathlib import Path

import mongomock
import pytest

from marketdata import binance_vision as bv
from marketdata.enrich import ENRICH_VERSION, run_backfill

FIX = Path(__file__).parent / "fixtures" / "TESTUSDT-1s-2025-10-01.csv"
BASE = 1759276800   # 2025-10-01 00:00:00 UTC


def fetch_day(symbol, day):
    return bv.parse_klines(FIX.read_text()) if (symbol, day) == ("TESTUSDT", "2025-10-01") else {}


def _db():
    col = mongomock.MongoClient()["fillscore"]["trades"]
    mk = lambda i, off, **kw: {"_id": i, "userId": "u1", "symbol": "TESTUSDT", "side": "BUY", "isMaker": True,
                               "executionPrice": 100.0, "fillScore": 77.5, "grade": "B",
                               "executedAt": datetime.utcfromtimestamp(BASE + off), **kw}
    col.insert_many([mk("a", 0.5 - 0.5 + 0), mk("b", 9), mk("demo1", 9, userId="demo-moderate"),
                     mk("c", 0, symbol="NOPEUSDT")])
    return col


def test_dry_run_writes_nothing_and_reports():
    col = _db()
    before = list(col.find({}))
    rep = run_backfill(col, fetch_day, apply=False, cache_dir=None)
    assert list(col.find({})) == before
    assert rep["apply"] is False and rep["considered"] == 3            # demo-* excluded by default
    assert rep["computed"] == 3 and len(rep["first_rows"]) == 3
    assert "cache_bytes" in rep


def test_apply_writes_only_new_fields_and_is_idempotent():
    col = _db()
    scores = {d["_id"]: (d["fillScore"], d["grade"]) for d in col.find({})}
    rep = run_backfill(col, fetch_day, apply=True, cache_dir=None)
    assert rep["written"] == 3
    a = col.find_one({"_id": "a"})
    # executed at BASE+0 s: h1 -> target 1 -> bar0 ended 1, 100.0; h5 -> target 5 -> bar2 ended 3 (age 2) -> 100.2
    assert a["postPrices"] == {"1": 100.0, "5": 100.2, "30": None, "60": None, "300": None}
    assert a["markoutVersion"] == ENRICH_VERSION
    assert a["halfSpreadBps"] is None and a["spreadEstimates"]["cs"] is None and "spreadBps" not in a    # fixture too thin for the estimators
    # a symbol with no public data: fields are explicit None, never guessed
    assert col.find_one({"_id": "c"})["postPrices"] == {"1": None, "5": None, "30": None, "60": None, "300": None}
    # scores/grades untouched, demo rows untouched
    for d in col.find({}):
        assert (d["fillScore"], d["grade"]) == scores[d["_id"]]
    assert "postPrices" not in col.find_one({"_id": "demo1"})
    second = run_backfill(col, fetch_day, apply=True, cache_dir=None)
    assert second["written"] == 0 and second["already_enriched"] == 3


def test_fetch_error_is_not_stamped_and_is_retried():
    col = _db()
    calls = {"fail": True}

    def flaky(symbol, day):
        if calls["fail"]:
            raise ConnectionError("network down")
        return fetch_day(symbol, day)

    rep = run_backfill(col, flaky, apply=True, cache_dir=None)
    assert rep["fetch_errors"] == 3 and rep["written"] == 0
    assert "markoutVersion" not in col.find_one({"_id": "a"}) and "postPrices" not in col.find_one({"_id": "a"})
    calls["fail"] = False
    rep = run_backfill(col, flaky, apply=True, cache_dir=None)
    assert rep["fetch_errors"] == 0 and rep["written"] == 3        # the retry picks them up


def test_explicit_demo_user_needs_the_flag():
    with pytest.raises(ValueError):
        run_backfill(_db(), fetch_day, user_id="demo-moderate")


def test_include_demo_flag():
    col = _db()
    rep = run_backfill(col, fetch_day, apply=False, cache_dir=None, include_demo=True)
    assert rep["considered"] == 4


def test_apply_sets_only_whitelisted_fields():
    col = _db()
    before = col.find_one({"_id": "b"})
    run_backfill(col, fetch_day, apply=True, cache_dir=None)
    after = col.find_one({"_id": "b"})
    new = set(after) - set(before)
    assert new == {"postPrices", "spreadEstimates", "halfSpreadBps", "markoutVersion"}   # never spreadBps
    assert {k: after[k] for k in before} == before
