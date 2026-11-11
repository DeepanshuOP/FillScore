"""The real-account validation harness: read-only against the source database, everything computed in memory."""
import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import mongomock
import pytest

from tests.measure.test_service import ACC, NOW, Source, order, trade

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate_real_account.py"


def _mod():
    spec = importlib.util.spec_from_file_location("validate_real_account", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


VERSION = {"id": "v2.0.0", "anchors": {}, "hourProfiles": {}, "feeTable": {}}


def _src_db():
    d = mongomock.MongoClient().db
    d.trades.insert_many([trade(1, 20000, 100.02, 1.0, "7", 0.10), trade(2, 30000, 100.04, 0.5, "7", 0.05)])
    d.orders.insert_one(order("7", 10000, 40000, 2.0, 1.5))
    return d


def test_read_only_proxy_refuses_writes():
    m = _mod()
    ro = m.ReadOnlyDB(_src_db())
    assert ro.trades.count_documents({}) == 2
    for call in (lambda: ro.trades.update_one({}, {"$set": {"x": 1}}), lambda: ro.trades.insert_one({}),
                 lambda: ro.trades.delete_many({}), lambda: ro.orders.replace_one({}, {}), lambda: ro.trades.bulk_write([])):
        with pytest.raises(PermissionError):
            call()


def test_validate_measures_scores_and_verifies_in_memory_without_touching_the_source():
    m = _mod()
    src = _src_db()
    before = list(src.trades.find())
    rep = m.validate(m.ReadOnlyDB(src), ACC, Source(), VERSION, "ff" * 32, NOW)
    assert list(src.trades.find()) == before                    # the source is unchanged
    assert src.order_measurements.count_documents({}) == 0 and src.scores_v2.count_documents({}) == 0
    assert rep["trades"] == 2 and rep["measured"] == 2
    assert rep["identityFailures"] == 0
    assert rep["belowTickFloor"] == 0                          # buys at or above the mid: never below -half tick
    assert rep["orders"] == 1
    assert rep["orderTotalsBps"] == [pytest.approx(12.0, abs=1e-9)]
    assert rep["verify"]["match"] is True
    assert rep["score"]["grade"] is None                       # 2 fills < 20: no letter
    assert rep["dataSource"] == {"real-user": 2}


def test_validate_refuses_demo_accounts():
    m = _mod()
    with pytest.raises(ValueError):
        m.validate(m.ReadOnlyDB(_src_db()), "demo-moderate", Source(), VERSION, "ff" * 32, NOW)


def test_report_text_is_plain_and_complete():
    m = _mod()
    rep = m.validate(m.ReadOnlyDB(_src_db()), ACC, Source(), VERSION, "ff" * 32, NOW)
    text = m.format_report(rep)
    for needle in ("fills measured: 2 of 2", "identity failures: 0", "integrity check: matched", "no letter grade"):
        assert needle in text
