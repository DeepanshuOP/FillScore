"""scripts/generate_demo_runs.py writes a fixture only for a non-degraded run (fakes only, no network)."""
import asyncio
import importlib.util
import json
import pathlib
from unittest.mock import patch

from agents.schemas import CouncilResult
from tests.council_fakes import HTTPError, make_packets, make_router

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "generate_demo_runs.py"


def _module():
    spec = importlib.util.spec_from_file_location("generate_demo_runs", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _run(mod, router, tmp_path, users):
    async def load(*_a, **_k):
        return make_packets()

    with patch("agents.llm_router.get_default_router", return_value=router), \
         patch("agents.metrics.loader.load_all_packets", load), \
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
