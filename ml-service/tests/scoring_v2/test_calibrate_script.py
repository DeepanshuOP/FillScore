"""scripts/calibrate_v2.py: the fixed day rule, and a full calibration pass on the committed real fixtures."""
import importlib.util
from pathlib import Path

import numpy as np

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
    # 2,099 BTC prints, nearly all under 1k notional: enough taker events for the lt1k spread anchors
    assert anchors["BTCUSDT"]["spread"]["lt1k"] is not None


def test_streaming_day_writes_a_summary_discards_the_zip_and_resumes(tmp_path):
    """A cached day zip (built here from the committed real slice) is reduced to a summary carrying the zip's
    SHA-256; with discard the zip is deleted; a rerun reads the summary and never needs the zip again."""
    import gzip
    import hashlib
    import zipfile

    from tests.measure.conftest import MARKET
    m = _mod()
    cache, summaries = tmp_path / "zips", tmp_path / "sums"
    z = cache / "BTCUSDT" / "BTCUSDT-aggTrades-2024-01-15.zip"
    z.parent.mkdir(parents=True)
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("BTCUSDT-aggTrades-2024-01-15.csv", gzip.decompress((MARKET / "BTCUSDT-aggTrades-2024-01-15_1400-1402.csv.gz").read_bytes()))
    sha = hashlib.sha256(z.read_bytes()).hexdigest()

    s1 = m.summarise_day("BTCUSDT", "2024-01-15", cache, summaries, discard_raw=True)
    assert s1["sha256"] == sha and s1["tick"] == 0.01 and s1["events"] > 0
    assert not z.exists()                                            # raw file discarded
    assert m.summary_path(summaries, "BTCUSDT", "2024-01-15").exists()
    s2 = m.summarise_day("BTCUSDT", "2024-01-15", cache, summaries, discard_raw=True)   # no zip: from the summary
    assert s2["sha256"] == sha and s2["events"] == s1["events"]
    assert all((s1["spread"][b] == s2["spread"][b]).all() for b in s1["spread"])


def test_resume_refuses_summaries_from_other_code(tmp_path):
    """Review M1.1 (low 3): a summary records a key over the code that made it; a summary from other code, or one
    with no key, is never merged silently."""
    import pytest

    from scoring_v2 import calibrate as cal
    m = _mod()
    s = {"spread": {"lt1k": np.array([1.0])}, "drift": {}, "hourSpread": {}, "hourRet": {}, "tick": 0.01, "events": 1,
         "sha256": "ab" * 32}
    path = m.summary_path(tmp_path, "BTCUSDT", "2026-01-01")
    cal.save_summary(path, s)
    assert cal.load_summary(path)["codeKey"] == cal.summary_code_key()
    assert m.summarise_day("BTCUSDT", "2026-01-01", tmp_path / "zips", tmp_path, False)["sha256"] == "ab" * 32
    cal.save_summary(path, {**s, "codeKey": "0" * 64})                       # made by other code
    with pytest.raises(m.StaleSummaryError):
        m.summarise_day("BTCUSDT", "2026-01-01", tmp_path / "zips", tmp_path, False)
    cal.save_summary(path, {**s, "codeKey": ""})                             # legacy summary: no key
    with pytest.raises(m.StaleSummaryError):
        m.summarise_day("BTCUSDT", "2026-01-01", tmp_path / "zips", tmp_path, False)
    assert m.summarise_day("BTCUSDT", "2026-01-01", tmp_path / "zips", tmp_path, False, accept_unkeyed=True)["sha256"] == "ab" * 32
