"""The open-source package `fillscore-metrics` (M7). Its code is GENERATED from ml-service/measure (registry, metrics, fees, orders) by
scripts/sync_metrics_package.py with one change (the measurement version is written into the registry instead of imported), so the formulas
in the package cannot differ from the ones that score accounts. These tests (1) fail when the committed package is not what the script
generates, and (2) run the package against the ml-service functions on a grid of inputs and require identical results."""
import importlib
import itertools
import sys
from pathlib import Path

import pytest

from scripts import sync_metrics_package as sync

PKG_ROOT = Path(__file__).resolve().parents[2] / "packages" / "fillscore-metrics"


def test_the_committed_package_is_what_the_script_generates():
    assert sync.check() == [], "run: python scripts/sync_metrics_package.py"


def test_the_package_version_is_the_measurement_version():
    from config.versions import MEASURE_VERSION
    assert f'version = "{MEASURE_VERSION}"' in (PKG_ROOT / "pyproject.toml").read_text()
    assert f'MEASURE_VERSION = "{MEASURE_VERSION}"' in (PKG_ROOT / "fillscore_metrics" / "registry.py").read_text()


@pytest.fixture(scope="module")
def pkg():
    sys.path.insert(0, str(PKG_ROOT))
    try:
        for name in [n for n in sys.modules if n == "fillscore_metrics" or n.startswith("fillscore_metrics.")]:
            del sys.modules[name]
        yield importlib.import_module("fillscore_metrics")
    finally:
        sys.path.remove(str(PKG_ROOT))
        for name in [n for n in sys.modules if n == "fillscore_metrics" or n.startswith("fillscore_metrics.")]:
            del sys.modules[name]


def test_the_package_exports_the_documented_functions(pkg):
    for name in ("effective_half_spread_bps", "realized_half_spread_bps", "price_impact_bps", "order_is", "effective_rate", "REGISTRY",
                 "methodology_markdown", "MEASURE_VERSION"):
        assert hasattr(pkg, name), name


def test_the_documented_examples_hold_in_the_package(pkg):
    # from the metric docs: buy at 100.02 with mid 100.01 gives 0.9999 bps; mid 15 s later 100.04: realized -1.9998, impact 2.9997
    assert pkg.effective_half_spread_bps(1, 100.02, 100.01) == pytest.approx(0.9999, abs=1e-4)
    assert pkg.realized_half_spread_bps(1, 100.02, 100.01, 100.04) == pytest.approx(-1.9998, abs=1e-4)
    assert pkg.price_impact_bps(1, 100.01, 100.04) == pytest.approx(2.9997, abs=1e-4)


def test_package_and_service_agree_on_a_grid(pkg):
    from measure import metrics as m
    prices = [0.01, 1.0, 99.99, 100.01, 42000.1]
    for side, fill, mid, after in itertools.product((1, -1), prices, prices, prices):
        assert pkg.effective_half_spread_bps(side, fill, mid) == m.effective_half_spread_bps(side, fill, mid)
        assert pkg.realized_half_spread_bps(side, fill, mid, after) == m.realized_half_spread_bps(side, fill, mid, after)
        assert pkg.price_impact_bps(side, mid, after) == m.price_impact_bps(side, mid, after)


def test_the_package_registry_lists_every_metric_of_the_service(pkg):
    from measure import registry
    import measure.metrics, measure.orders, measure.fees  # noqa: F401  (importing registers them)
    assert sorted(pkg.REGISTRY) == sorted(registry.REGISTRY)
    assert pkg.methodology_markdown() == registry.methodology_markdown()


def test_the_package_needs_nothing_but_the_standard_library():
    for f in (PKG_ROOT / "fillscore_metrics").glob("*.py"):
        text = f.read_text()
        for bad in ("import numpy", "import pandas", "from numpy", "from pandas", "import requests", "from config", "from measure"):
            assert bad not in text, f"{f.name} imports {bad}"
