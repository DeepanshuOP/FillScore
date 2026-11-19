"""validate_real_account loads the env files itself and stops with exit 2 when MONGODB_URI is missing."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

import env_report  # noqa: E402
import validate_real_account as v  # noqa: E402


def test_main_uses_the_env_loader_and_stops_without_a_uri(monkeypatch, capsys):
    calls = []

    def fake(names, ml, be, environ=None):
        calls.append((names, Path(ml).name, Path(be).parent.name))
        return {"loaded": [], "present": {"MONGODB_URI": False}}

    monkeypatch.setattr(env_report, "load_and_report", fake)
    assert v.main(["--account", "real-1"]) == 2
    assert calls == [(["MONGODB_URI"], ".env", "backend")]
    assert "MONGODB_URI is not set" in capsys.readouterr().out
