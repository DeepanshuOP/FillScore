"""scripts/generate_demo_runs.py writes a fixture only for a non-degraded run (fakes only, no network)."""
import asyncio
import importlib.util
import json
import pathlib
from unittest.mock import patch

from agents.schemas import CouncilResult
from tests.council_fakes import FEE, HTTPError, make_packets, make_router

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "generate_demo_runs.py"


def _module():
    spec = importlib.util.spec_from_file_location("generate_demo_runs", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(mod, router, tmp_path, users):
    async def load(*_a, **_k):
        return make_packets(), []

    with patch("agents.llm_router.get_default_router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch.object(mod, "OUT_DIR", tmp_path):
        return asyncio.run(mod.generate(persist=False, users=users))


def test_writes_a_non_degraded_run(tmp_path):
    mod = _module()
    router, provider = make_router()
    assert _run(mod, router, tmp_path, ["demo-aggressive"]) == 0
    data = json.loads((tmp_path / "demo-aggressive.json").read_text())
    assert data["account_id"] == "demo-aggressive" and data["symbol"] == "BTCUSDT"
    assert CouncilResult.model_validate(data["council_result"]).degraded is False
    assert len(provider.calls) == 9


def test_skips_a_degraded_run(tmp_path):
    mod = _module()
    router, _ = make_router({"synthesis": HTTPError(404)})
    assert _run(mod, router, tmp_path, ["demo-moderate"]) == 1
    assert not (tmp_path / "demo-moderate.json").exists()


def test_refuses_without_yes(monkeypatch, capsys):
    mod = _module()
    monkeypatch.setattr("sys.argv", ["generate_demo_runs.py"])
    assert mod.main() == 2
    assert "--yes" in capsys.readouterr().out


def _run_opts(mod, router, tmp_path, users, **kw):
    async def load(*_a, **_k):
        return make_packets(), []

    with patch("agents.llm_router.get_default_router", return_value=router), \
         patch("agents.metrics.loader.load_run_inputs", load), \
         patch.object(mod, "OUT_DIR", tmp_path):
        return asyncio.run(mod.generate(persist=False, users=users, **kw))


def test_users_are_spaced_by_the_gap_and_not_after_the_last(tmp_path):
    # 1c.9/1d.7: 90 s between users (was 65) (Groq per-minute token window).
    mod = _module()
    router, _ = make_router()
    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)

    assert _run_opts(mod, router, tmp_path, ["demo-disciplined", "demo-moderate"], sleep=fake_sleep) == 0
    assert sleeps == [90]


def test_max_calls_is_a_hard_cap_across_users(tmp_path):
    # cap 9 = one full run (9 base calls); the second user is skipped without any request.
    mod = _module()
    router, provider = make_router()

    async def fake_sleep(_s):
        pass

    rc = _run_opts(mod, router, tmp_path, ["demo-disciplined", "demo-moderate"], max_calls=9, sleep=fake_sleep)
    assert rc == 1
    assert len(provider.calls) == 9 and router.http_attempts == 9
    assert (tmp_path / "demo-disciplined.json").exists()
    assert not (tmp_path / "demo-moderate.json").exists()


def _no_sleep_recorder():
    sleeps = []

    async def fake_sleep(s):
        sleeps.append(s)

    return sleeps, fake_sleep


def test_rejected_default_flagged_run_is_not_written(tmp_path):
    # Not degraded, but a verdict carries agent_failed -> structured acceptance rejects it.
    mod = _module()
    router, _ = make_router({"fee_optimizer": {**FEE, "flags": ["agent_failed"]}})
    assert _run_opts(mod, router, tmp_path, ["demo-moderate"]) == 1
    assert not (tmp_path / "demo-moderate.json").exists()


def test_retries_rerun_a_rejected_user_once(tmp_path):
    # 1st run rejected (fee agent_failed), 2nd accepted; 90 s gap between the two attempts only.
    mod = _module()
    router, provider = make_router({"fee_optimizer": lambda _kw, n: {**FEE, "flags": ["agent_failed"]} if n == 1 else FEE})
    sleeps, fake_sleep = _no_sleep_recorder()
    assert _run_opts(mod, router, tmp_path, ["demo-moderate"], sleep=fake_sleep, retries=1) == 0
    assert sleeps == [90]
    assert (tmp_path / "demo-moderate.json").exists()
    assert len(provider.calls) == 18


def test_cap_spent_skips_without_sleeping(tmp_path):
    mod = _module()
    router, provider = make_router()
    sleeps, fake_sleep = _no_sleep_recorder()
    rc = _run_opts(mod, router, tmp_path, ["demo-disciplined", "demo-moderate"], max_calls=9, sleep=fake_sleep)
    assert rc == 1 and sleeps == [] and len(provider.calls) == 9
