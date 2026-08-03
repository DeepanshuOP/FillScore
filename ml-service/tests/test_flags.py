"""Tests for config/flags.py — the generic feature-flag mechanism behind R6-D9."""
from config.flags import flag_enabled, council_enabled, council_maintenance_message


def test_unset_returns_default_true(monkeypatch):
    monkeypatch.delenv("SOME_FLAG", raising=False)
    assert flag_enabled("SOME_FLAG", default=True) is True


def test_unset_returns_default_false(monkeypatch):
    monkeypatch.delenv("SOME_FLAG", raising=False)
    assert flag_enabled("SOME_FLAG", default=False) is False


def test_empty_or_whitespace_returns_default(monkeypatch):
    monkeypatch.setenv("SOME_FLAG", "")
    assert flag_enabled("SOME_FLAG", default=True) is True
    monkeypatch.setenv("SOME_FLAG", "   ")
    assert flag_enabled("SOME_FLAG", default=True) is True


def test_falsy_values(monkeypatch):
    for val in ["0", "false", "False", "FALSE", "no", "off", "OFF"]:
        monkeypatch.setenv("SOME_FLAG", val)
        assert flag_enabled("SOME_FLAG", default=True) is False, f"{val!r} should be falsy"


def test_truthy_values(monkeypatch):
    for val in ["1", "true", "TRUE", "yes", "on", "ON"]:
        monkeypatch.setenv("SOME_FLAG", val)
        assert flag_enabled("SOME_FLAG", default=False) is True, f"{val!r} should be truthy"


def test_unrecognized_value_falls_back_to_default(monkeypatch):
    monkeypatch.setenv("SOME_FLAG", "maybe")
    assert flag_enabled("SOME_FLAG", default=True) is True
    assert flag_enabled("SOME_FLAG", default=False) is False


def test_council_enabled_defaults_true(monkeypatch):
    monkeypatch.delenv("COUNCIL_ENABLED", raising=False)
    assert council_enabled() is True


def test_council_enabled_respects_env(monkeypatch):
    monkeypatch.setenv("COUNCIL_ENABLED", "false")
    assert council_enabled() is False


def test_council_maintenance_message_default(monkeypatch):
    monkeypatch.delenv("COUNCIL_DISABLED_MESSAGE", raising=False)
    msg = council_maintenance_message()
    assert isinstance(msg, str) and len(msg) > 0


def test_council_maintenance_message_override(monkeypatch):
    monkeypatch.setenv("COUNCIL_DISABLED_MESSAGE", "Groq quota exhausted, back at 00:00 UTC")
    assert council_maintenance_message() == "Groq quota exhausted, back at 00:00 UTC"
