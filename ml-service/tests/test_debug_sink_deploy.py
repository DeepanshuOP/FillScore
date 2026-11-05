"""Review L3 (2a): any deploy marker refuses the local debug sink, not only FILLSCORE_DEPLOY=1."""
from agents import debug_sink


def _env(monkeypatch, **kv):
    for k in ("FILLSCORE_GROUNDING_DEBUG", "FILLSCORE_DEPLOY", "RENDER"):
        monkeypatch.delenv(k, raising=False)
    for k, v in kv.items():
        monkeypatch.setenv(k, v)


def test_render_marker_refuses_the_sink(monkeypatch, tmp_path):
    _env(monkeypatch, FILLSCORE_GROUNDING_DEBUG="1", RENDER="true")   # Render sets RENDER=true on every service
    monkeypatch.setattr(debug_sink, "DEBUG_PATH", tmp_path / "g.jsonl")
    assert debug_sink.enabled() is False and debug_sink.refused() is True
    debug_sink.record("a", "f", "numeral_redacted", "s", ["1"])
    assert not (tmp_path / "g.jsonl").exists()


def test_local_debug_still_works_without_markers(monkeypatch, tmp_path):
    _env(monkeypatch, FILLSCORE_GROUNDING_DEBUG="1")
    assert debug_sink.enabled() is True and debug_sink.refused() is False


def test_the_ml_image_sets_the_deploy_marker_and_ignores_local_dirs():
    from pathlib import Path
    root = Path(__file__).resolve().parents[1]
    assert "ENV FILLSCORE_DEPLOY=1" in (root / "Dockerfile").read_text()
    ignored = (root / ".dockerignore").read_text().split()
    assert ".venv" in ignored and ".debug" in ignored
