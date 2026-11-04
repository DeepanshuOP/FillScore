"""Legacy council_runs migration (1c.7): classify, build_update, dry run vs --apply."""
from __future__ import annotations

import asyncio
import pathlib
import sys

import pytest
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import migrate_legacy_council_runs as m  # noqa: E402


def clean_result():
    return {
        "liquidity": {"flags": []}, "alpha": {"flags": []}, "risk": {"flags": []}, "fee": {"flags": []},
        "synthesis": {"headline": "Fills were fine", "recommendations": ["Slippage was low"]},
        "debate_transcript": {"prosecution_summary": "p", "defense_summary": "d"},
    }


def doc(n_calls=9, result=None, **kw):
    d = {"_id": kw.pop("_id", 1), "run_id": kw.pop("run_id", "r1"),
         "council_result": result if result is not None else clean_result()}
    if n_calls is not None:
        d["token_usage"] = {"n_calls": n_calls}
    return d


def test_clean_nine_calls_ok():
    assert m.classify_run(doc()) == {"outcome": "ok", "degraded": False, "reasons": []}


def test_seven_calls_low():
    c = m.classify_run(doc(n_calls=7))
    assert c["outcome"] == "degraded_low_calls" and c["degraded"] is True
    assert c["reasons"] == ["legacy: only 7 of 9 model calls recorded"]


def test_agent_failed_flag_is_fallback():
    r = clean_result(); r["fee"]["flags"] = ["agent_failed"]
    c = m.classify_run(doc(result=r))
    assert c["outcome"] == "degraded_fallback" and c["degraded"] is True
    assert c["reasons"] and all(x.startswith("legacy: fallback marker") for x in c["reasons"])


def test_prosecution_unavailable_is_fallback():
    r = clean_result(); r["debate_transcript"]["prosecution_summary"] = "Prosecution unavailable"
    assert m.classify_run(doc(result=r))["outcome"] == "degraded_fallback"


def test_other_markers():
    r = clean_result(); r["synthesis"]["headline"] = "Analysis incomplete"
    assert m.classify_run(doc(result=r))["outcome"] == "degraded_fallback"
    r = clean_result(); r["synthesis"]["recommendations"] = ["Check API key and retry"]
    assert m.classify_run(doc(result=r))["outcome"] == "degraded_fallback"
    r = clean_result(); r["risk"]["summary"] = "Agent unavailable"
    assert m.classify_run(doc(result=r))["outcome"] == "degraded_fallback"
    r = clean_result(); r["debate_transcript"]["defense_summary"] = "Defense unavailable"
    assert m.classify_run(doc(result=r))["outcome"] == "degraded_fallback"


def test_missing_n_calls_counts_zero():
    c = m.classify_run(doc(n_calls=None))
    assert c["outcome"] == "degraded_low_calls"
    assert "legacy: only 0 of 9 model calls recorded" in c["reasons"]


def test_low_calls_priority_keeps_both_reasons():
    r = clean_result(); r["fee"]["flags"] = ["agent_failed"]
    c = m.classify_run(doc(n_calls=0, result=r))
    assert c["outcome"] == "degraded_low_calls"
    assert c["reasons"][0] == "legacy: only 0 of 9 model calls recorded"
    assert any("fallback marker" in x for x in c["reasons"])


def test_build_update_shape():
    r = clean_result(); r["fee"]["flags"] = ["agent_failed"]
    d = doc(result=r)
    c = m.classify_run(d)
    assert m.build_update(d) == {"$set": {"legacy": True, "degraded": True, "degraded_reasons": c["reasons"]}}


async def _seed(db):
    bad = clean_result(); bad["fee"]["flags"] = ["agent_failed"]
    await db.council_runs.insert_many([
        {"_id": 1, "run_id": "a", "token_usage": {"n_calls": 9}, "council_result": clean_result()},
        {"_id": 2, "run_id": "b", "token_usage": {"n_calls": 9}, "council_result": bad},
        {"_id": 3, "run_id": "c", "token_usage": {"n_calls": 3}, "council_result": clean_result(), "degraded": False},
    ])


def test_dry_run_changes_nothing(capsys):
    db = AsyncMongoMockClient()["x"]

    async def go():
        await _seed(db)
        await m.run_migration(db, apply=False)
        return await db.council_runs.find({}).to_list(10)

    docs = asyncio.run(go())
    out = capsys.readouterr().out
    assert "Matched: 2" in out and "ok: 1" in out and "degraded_fallback: 1" in out
    assert "degraded_low_calls: 0" in out and "DRY RUN" in out
    assert not any("legacy" in d for d in docs)


def test_apply_writes_matched_only(capsys):
    db = AsyncMongoMockClient()["x"]

    async def go():
        await _seed(db)
        await m.run_migration(db, apply=True)
        return {d["_id"]: d for d in await db.council_runs.find({}).to_list(10)}

    docs = asyncio.run(go())
    assert "Modified: 2" in capsys.readouterr().out
    assert docs[1]["legacy"] is True and docs[1]["degraded"] is False
    assert docs[2]["legacy"] is True and docs[2]["degraded"] is True
    assert "legacy" not in docs[3]
