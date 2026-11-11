"""scripts/calibrate_v2.py: the fixed day rule, and a full calibration pass on the committed real fixtures."""
import importlib.util
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "calibrate_v2.py"


def _mod():
    spec = importlib.util.spec_from_file_location("calibrate_v2", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_days_rule():
    assert _mod().days("2025-10-01", "2025-10-29", 7) == ["2025-10-01", "2025-10-08", "2025-10-15", "2025-10-22", "2025-10-29"]
    assert _mod().days("2025-10-01", "2025-10-03", 7) == ["2025-10-01"]


def test_calibrate_on_fixtures(btc_2024, bnb_2024):
    # Two-minute slices: too few samples for most anchors (MIN_SAMPLES = 200) and only one hour -> profile None.
    anchors, profiles = _mod().calibrate({"BTCUSDT": [btc_2024], "BNBUSDT": [bnb_2024]}, step_ms=1000, hour_step_ms=1000)
    assert anchors["BTCUSDT"]["tick"] == 0.01 and anchors["BNBUSDT"]["tick"] == 0.1
    assert profiles == {"BTCUSDT": None, "BNBUSDT": None}
    # 2,099 BTC prints, nearly all under 1k notional: enough for the lt1k spread anchors
    assert anchors["BTCUSDT"]["spread"]["lt1k"] is not None
