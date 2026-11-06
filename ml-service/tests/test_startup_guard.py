import pytest

from config.startup_guard import assert_no_e2e_flag_in_production as guard


def test_refuses_with_deploy_flag():
    with pytest.raises(RuntimeError, match="FILLSCORE_E2E_NO_LLM"):
        guard({"FILLSCORE_E2E_NO_LLM": "1", "FILLSCORE_DEPLOY": "1"})


def test_refuses_on_render():
    with pytest.raises(RuntimeError):
        guard({"FILLSCORE_E2E_NO_LLM": "1", "RENDER": "true"})


@pytest.mark.parametrize("env", [
    {"FILLSCORE_E2E_NO_LLM": "1"},                      # local e2e
    {"RENDER": "true"},                                 # prod, flag absent
    {"FILLSCORE_E2E_NO_LLM": "0", "RENDER": "true"},
    {},
])
def test_allows_everything_else(env):
    guard(env)


def test_main_calls_the_guard_at_import(monkeypatch):
    import importlib
    monkeypatch.delenv("FILLSCORE_E2E_NO_LLM", raising=False)
    monkeypatch.delenv("RENDER", raising=False)
    monkeypatch.delenv("FILLSCORE_DEPLOY", raising=False)
    import main
    monkeypatch.setenv("FILLSCORE_E2E_NO_LLM", "1")
    monkeypatch.setenv("RENDER", "true")
    with pytest.raises(RuntimeError):
        importlib.reload(main)
    monkeypatch.delenv("FILLSCORE_E2E_NO_LLM")
    monkeypatch.delenv("RENDER")
    importlib.reload(main)
