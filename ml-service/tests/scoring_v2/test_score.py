"""Account scoring under a ScoringVersion, on mongomock. Version dict is built inline so values are hand-checkable.

Fixture: N orders on XUSDT, each one buy fill: price 100.02, qty 1.0 (notional 100.02 USD, bucket lt1k), mid 100.01,
tick 0.01, effective half-spread 0.99990001 bps, filled 30 s after the order arrived, hour 14 UTC, feeUsd 0.10002
(10 bps of 100.02), isMaker False.
Version: spread anchors lt1k = (0.5, 1.0, 2.0, 4.0); slippage anchors 10s-1m = (-2, 0, 4, 10); hour profile index
h+1 for hour h; snapshot taker 0.001, BNB discount 0.75 enabled.
  spread  : x = 0.99990001 in (0.5, 1.0): 100 - (0.49990001/0.5) x 25 = 75.0049995
  slippage: impactTimingBps 2.0 -> halfway between 0 and 4 -> 57.5
  timing  : hour 14 has 14 cheaper hours -> 100 x (1 - 14/23) = 39.13043478
  fees    : paid = 0.10002/100.02 x 1e4 = 10.0 bps; best = 0.001 x 0.75 x 1e4 = 7.5 bps (paid in BNB would be cheaper)
            -> 100 x (15 - 10)/7.5 = 66.66666667
  composite = 0.35 x 57.5 + 0.25 x 66.66666667 + 0.25 x 39.13043478 + 0.15 x 75.0049995
            = 20.125 + 16.66666667 + 9.78260870 + 11.25074993 = 57.82502529 -> D
"""
from datetime import datetime, timezone

import mongomock
import pytest

from config.versions import MEASURE_VERSION
from scoring_v2.score import score_account_v2, verify_account_v2

ACC = "acct-s"
B = datetime(2026, 10, 1, 14, 0, 0, tzinfo=timezone.utc)
VERSION = {
    "id": "v2.0.0", "weights": {"slippage": 0.35, "fees": 0.25, "timing": 0.25, "spread": 0.15},
    "anchors": {"XUSDT": {"tick": 0.01, "spread": {"lt1k": [0.5, 1.0, 2.0, 4.0]}, "slippage": {"10s-1m": [-2.0, 0.0, 4.0, 10.0]}}},
    "hourProfiles": {"XUSDT": [float(h + 1) for h in range(24)]},
    "feeTable": {"publishedTakerBps": {"binance": 10.0}},
}
SNAP = {"accountId": ACC, "exchange": "binance", "symbol": "XUSDT", "source": "account",
        "standard": {"maker": 0.001, "taker": 0.001, "buyer": 0.0, "seller": 0.0},
        "tax": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
        "special": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
        "discount": {"enabledForAccount": True, "enabledForSymbol": True, "asset": "BNB", "rate": 0.75},
        "fetchedAt": datetime(2026, 10, 2)}


def make_db(n=20, **trade_kw):
    db = mongomock.MongoClient().db
    for i in range(n):
        arrival = int(B.timestamp() * 1000) + i * 120_000      # 2 min apart: all 21 fills stay inside hour 14
        t = arrival + 30_000
        meas = {"version": MEASURE_VERSION, "tradeId": str(i), "symbol": "XUSDT", "side": 1, "mid": 100.01,
                "quoteQuality": "two_sided", "effHalfBps": (100.02 - 100.01) / 100.01 * 1e4, "tickSize": 0.01,
                "marketDataRefs": [{"sha256": "ab"}], "unmeasuredReason": None}
        doc = {"accountId": ACC, "dataSource": "real-user", "exchange": "binance", "symbol": "XUSDT", "tradeId": str(i),
               "orderId": str(i), "side": "BUY", "isMaker": False, "executionPrice": 100.02, "quantity": 1.0,
               "notional": 100.02, "feeUsd": 0.10002, "feeAsset": "USDT",
               "executedAt": datetime.fromtimestamp(t / 1000, tz=timezone.utc).replace(tzinfo=None), "measurement": meas}
        doc.update(trade_kw)
        db.trades.insert_one(doc)
        db.order_measurements.insert_one({
            "accountId": ACC, "exchange": "binance", "symbol": "XUSDT", "orderId": str(i), "version": MEASURE_VERSION,
            "arrivalMs": arrival, "marketDataRefs": [{"sha256": "cd"}],
            "shortfall": {"basis": "order", "impactTimingBps": 2.0, "executionBps": 3.0}, "measuredAt": datetime(2026, 10, 3)})
    db.fee_snapshots.insert_one(dict(SNAP))
    return db


def test_hand_case_components_and_grade():
    r = score_account_v2(make_db(20), ACC, VERSION, "ff" * 32, now_ms=0)
    c = r["result"]["components"]
    assert c["spread"]["score"] == pytest.approx(75.0049995, abs=1e-6)
    assert c["slippage"]["score"] == pytest.approx(57.5, abs=1e-9)
    assert c["timing"]["score"] == pytest.approx(39.13043478, abs=1e-6)
    assert c["fees"]["score"] == pytest.approx(66.66666667, abs=1e-6)
    assert r["result"]["composite"] == pytest.approx(57.82502529, abs=1e-6)
    assert r["result"]["grade"] == "D"
    assert r["scoringVersion"] == "v2.0.0" and r["versionFileSha256"] == "ff" * 32
    assert len(r["integrityHash"]) == 64


def test_fewer_than_20_gives_band_not_letter():
    r = score_account_v2(make_db(19), ACC, VERSION, "ff" * 32, now_ms=0)
    assert r["result"]["grade"] is None and r["result"]["reason"] == "fewer than 20 measured fills"


def test_symbol_outside_calibration_scores_fees_only():
    db = make_db(20, symbol="ZZZUSDT")
    for m in db.order_measurements.find():
        db.order_measurements.update_one({"_id": m["_id"]}, {"$set": {"symbol": "ZZZUSDT"}})
    db.fee_snapshots.update_one({}, {"$set": {"symbol": "ZZZUSDT"}})
    c = score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)["result"]["components"]
    assert c["spread"]["score"] is None and c["slippage"]["score"] is None and c["timing"]["score"] is None
    assert c["fees"]["score"] == pytest.approx(66.66666667, abs=1e-6)


def test_no_fee_snapshot_means_fee_component_unmeasured():
    db = make_db(20)
    db.fee_snapshots.delete_many({})
    assert score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)["result"]["components"]["fees"]["score"] is None


def test_unmeasured_fill_is_counted_not_imputed():
    db = make_db(21)
    db.trades.update_one({"tradeId": "0"}, {"$set": {"measurement.effHalfBps": None, "measurement.mid": None}})
    c = score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)["result"]["components"]
    assert c["spread"]["measured"] == 20 and c["spread"]["unmeasured"] == 1


def test_demo_and_synthetic_never_scored():
    db = make_db(20, dataSource="synthetic-demo")
    r = score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)
    assert r["result"]["fills"] == 0
    with pytest.raises(ValueError):
        score_account_v2(db, "demo-moderate", VERSION, "ff" * 32, now_ms=0)


def test_verify_matches_then_detects_a_changed_measurement():
    db = make_db(20)
    r = score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)
    db.scores_v2.insert_one(dict(r))
    v = verify_account_v2(db, ACC, VERSION, "ff" * 32)
    assert v == {"match": True, "storedHash": r["integrityHash"], "recomputedHash": r["integrityHash"], "resultMatch": True,
                 "scoringVersion": "v2.0.0"}
    # a trade measured later does not break verification (the stored input keys are used) ...
    db.trades.insert_one({**db.trades.find_one({"tradeId": "0"}, {"_id": 0}), "tradeId": "999"})
    assert verify_account_v2(db, ACC, VERSION, "ff" * 32)["match"] is True
    # ... but a changed stored number does
    db.trades.update_one({"tradeId": "3"}, {"$set": {"measurement.effHalfBps": 0.5}})
    assert verify_account_v2(db, ACC, VERSION, "ff" * 32)["match"] is False


def test_verify_detects_an_edited_result():
    # Review finding M1-1: the hash covered the inputs only, so an edited grade still "matched".
    db = make_db(20)
    db.scores_v2.insert_one(dict(score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)))
    assert verify_account_v2(db, ACC, VERSION, "ff" * 32)["match"] is True
    db.scores_v2.update_one({}, {"$set": {"result.grade": "A"}})
    v = verify_account_v2(db, ACC, VERSION, "ff" * 32)
    assert v["match"] is False and v["resultMatch"] is False


def test_fee_snapshot_far_from_the_fill_is_not_used():
    # Review finding M1-3: a snapshot is the rate when fetched. Fills more than 30 days from every snapshot get no fee
    # score; fills within 30 days use the nearest snapshot.
    db = make_db(20)
    db.fee_snapshots.update_one({}, {"$set": {"fetchedAt": datetime(2026, 12, 15)}})     # 75 days after the fills
    c = score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)["result"]["components"]
    assert c["fees"]["score"] is None and c["fees"]["unmeasured"] == 20
    db.fee_snapshots.update_one({}, {"$set": {"fetchedAt": datetime(2026, 10, 20)}})     # 19 days after
    assert score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)["result"]["components"]["fees"]["score"] == pytest.approx(66.66666667, abs=1e-6)


def test_verify_with_another_version_file_does_not_match():
    db = make_db(20)
    db.scores_v2.insert_one(dict(score_account_v2(db, ACC, VERSION, "ff" * 32, now_ms=0)))
    assert verify_account_v2(db, ACC, VERSION, "ee" * 32)["match"] is False


def test_verify_without_stored_score():
    assert verify_account_v2(mongomock.MongoClient().db, ACC, VERSION, "ff" * 32) is None
