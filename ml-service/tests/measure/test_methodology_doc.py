"""The committed methodology page equals the registry's current output, so the method cannot drift from the code."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "gen_methodology.py"


def _gen():
    spec = importlib.util.spec_from_file_location("gen_methodology", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_methodology_doc_is_current():
    gen = _gen()
    path = gen.doc_path()
    assert path.exists(), f"missing {path}: run scripts/gen_methodology.py"
    assert path.read_text(encoding="utf-8") == gen.render(), "stale methodology doc: run scripts/gen_methodology.py"


def test_methodology_doc_lists_fill_metrics():
    text = _gen().render()
    for mid in ("fill.effective_half_spread_bps", "fill.realized_half_spread_bps", "fill.price_impact_bps", "fill.eq_ratio"):
        assert f"`{mid}`" in text
