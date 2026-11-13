"""Live-site review item 5 (2026-11-14): a demo Council run is served only if its stored packet hashes equal the
hashes of the packets built from the CURRENT demo data. A run recorded on the earlier (deleted) demo trades is not
served: the visitor reads "not yet generated for the current demo data". Hand values: make_packets(328.0, 10) and
make_packets(999.0, 10) differ in total_fee_paid_usd, so their fee packet hashes differ."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from mongomock_motor import AsyncMongoMockClient

from agents.errors import CouncilError, safe_message
from tests.council_fakes import make_packets, make_router
from tests.test_council_cache_demo import _env, _flow, _stored_run  # noqa: F401  (_env is an autouse fixture)

DEMO = "demo-moderate"


def _changed_packets():
    return make_packets(total_fee_paid_usd=999.0)


def _hashes(packets):
    return {k: p.content_hash for k, p in zip(("fee", "risk", "liquidity", "alpha"), packets)}


def _fixture(tmp_path, result):
    (tmp_path / f"{DEMO}.json").write_text(json.dumps({"account_id": DEMO, "symbol": "BTCUSDT", "council_result": result}))


def test_hash_sets_really_differ():
    assert _hashes(make_packets())["fee"] != _hashes(_changed_packets())["fee"]


def test_stored_run_on_other_data_is_not_served(tmp_path):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router, account=DEMO)))     # recorded on make_packets() data
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, db, account=DEMO, packets=_changed_packets())                   # the demo data is now different
    assert info.value.code == "DEMO_NOT_GENERATED" and provider.calls == []


def test_fixture_on_other_data_is_not_served(tmp_path):
    router, provider = make_router()
    _fixture(tmp_path, _stored_run(router, account=DEMO)["council_result"])
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, AsyncMongoMockClient()["fillscore"], account=DEMO, packets=_changed_packets())
    assert info.value.code == "DEMO_NOT_GENERATED" and provider.calls == []


def test_fixture_on_the_current_data_is_served(tmp_path):
    router, provider = make_router()
    _fixture(tmp_path, {**_stored_run(router, account=DEMO)["council_result"], "run_id": "fx"})
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path):
        result = _flow(router, AsyncMongoMockClient()["fillscore"], account=DEMO)
    assert result.run_id == "fx" and result.cached is True and provider.calls == []


def test_a_fixture_without_recorded_hashes_cannot_be_verified_and_is_not_served(tmp_path):
    router, _ = make_router()
    stored = _stored_run(router, account=DEMO)["council_result"]
    _fixture(tmp_path, {**stored, "tradeContext": {"userId": DEMO, "symbol": "BTCUSDT"}})
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, AsyncMongoMockClient()["fillscore"], account=DEMO)
    assert info.value.code == "DEMO_NOT_GENERATED"


def test_an_older_run_that_matches_beats_a_newer_run_that_does_not(tmp_path):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    now = datetime.now(timezone.utc)
    old_match = _stored_run(router, account=DEMO, run_id="match", created=now - timedelta(days=30))
    new_other = _stored_run(router, account=DEMO, run_id="other", created=now - timedelta(days=1),
                            packet_hashes=_hashes(_changed_packets()))
    asyncio.run(db["council_runs"].insert_many([old_match, new_other]))
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path):
        result = _flow(router, db, account=DEMO)
    assert result.run_id == "match" and provider.calls == []


def test_no_trades_in_the_current_demo_data_is_not_generated(tmp_path):
    router, provider = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router, account=DEMO)))
    with patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        _flow(router, db, account=DEMO, packets=make_packets(trade_count=0))
    assert info.value.code == "DEMO_NOT_GENERATED" and provider.calls == []


def test_unreadable_demo_data_is_not_generated_never_a_blind_serve(tmp_path):
    from agents.council_service import council_flow
    router, _ = make_router()
    db = AsyncMongoMockClient()["fillscore"]
    asyncio.run(db["council_runs"].insert_one(_stored_run(router, account=DEMO)))

    async def broken(*_a, **_k):
        raise RuntimeError("bad auth")

    with patch("agents.council_service._router", return_value=router), patch("agents.metrics.loader.load_run_inputs", broken), \
         patch("agents.persistence._get_db", return_value=(MagicMock(), db)), \
         patch("agents.council_service.DEMO_RUNS_DIR", tmp_path), pytest.raises(CouncilError) as info:
        asyncio.run(council_flow(DEMO, "BTCUSDT"))
    assert info.value.code == "DEMO_NOT_GENERATED"


def test_the_message_says_not_yet_generated_for_the_current_data():
    assert safe_message("DEMO_NOT_GENERATED") == "Demo analysis not yet generated for the current demo data."
