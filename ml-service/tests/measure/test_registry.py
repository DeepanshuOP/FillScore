"""Metric registry: one place that knows every v2 metric, its unit, inputs and formula text."""
import pytest

from config.versions import MEASURE_VERSION
from measure import registry
from measure.registry import MetricSpec, metric, methodology_markdown


@pytest.fixture
def clean_registry(monkeypatch):
    monkeypatch.setattr(registry, "REGISTRY", {})
    return registry.REGISTRY


def test_register_and_call_through(clean_registry):
    @metric(id="t.double", unit="bps", inputs=["x"], doc="Twice x.")
    def double(x):
        return 2 * x

    assert double(3) == 6                       # the decorator returns the function unchanged
    spec = clean_registry["t.double"]
    assert isinstance(spec, MetricSpec)
    assert (spec.unit, spec.inputs, spec.doc) == ("bps", ["x"], "Twice x.")
    assert spec.fn(4) == 8


def test_duplicate_id_rejected(clean_registry):
    metric(id="t.a", unit="bps", inputs=[], doc="a")(lambda: 1)
    with pytest.raises(ValueError, match="t.a"):
        metric(id="t.a", unit="bps", inputs=[], doc="again")(lambda: 2)


def test_spec_carries_measure_version(clean_registry):
    metric(id="t.v", unit="ratio", inputs=[], doc="v")(lambda: 1)
    assert clean_registry["t.v"].version == MEASURE_VERSION == "1.0.0"


def test_methodology_lists_every_metric_once_sorted(clean_registry):
    metric(id="t.b", unit="bps", inputs=["fill", "mid"], doc="Doc of b.")(lambda: 1)
    metric(id="t.a", unit="ratio", inputs=["x"], doc="Doc of a.")(lambda: 1)
    md = methodology_markdown()
    assert md.count("### `t.a`") == 1 and md.count("### `t.b`") == 1
    assert md.index("### `t.a`") < md.index("### `t.b`")          # sorted by id
    assert "Doc of b." in md and "fill, mid" in md and "bps" in md
    assert MEASURE_VERSION in md


def test_real_registry_has_no_empty_doc():
    import measure.metrics  # noqa: F401  (registers the real metrics)
    assert registry.REGISTRY, "real metrics must be registered"
    for spec in registry.REGISTRY.values():
        assert spec.doc.strip() and spec.unit.strip(), spec.id
